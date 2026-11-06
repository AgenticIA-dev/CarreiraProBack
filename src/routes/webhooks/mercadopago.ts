import type { DataSource, QueryDeepPartialEntity } from "typeorm";
import { computeAccessExpiry } from "@/lib/checkout/config";
import { getDb } from "@/lib/db/dataSource";
import {
  PartnerCommissionEntity,
  PartnerCommissionTierEntity,
  PartnerEntity,
  PurchaseEntity,
  UserEntity,
  WebhookEventEntity,
} from "@/lib/db/entities";
import { createAuthToken } from "@/lib/auth/authTokens";
import { buildPasswordSetupUrl } from "@/lib/auth/session";
import { inviteEmail, sendEmail } from "@/lib/email/mailer";
import { verifyMercadoPagoWebhook, buildIdempotencyKey } from "@/lib/mercadopago/verifyWebhook";
import { getPayment } from "@/lib/mercadopago/client";
import { mapPaymentToPurchaseStatus, mapPaymentToUserStatus } from "@/lib/mercadopago/mapStatus";
import type { MercadoPagoWebhookPayload, MercadoPagoPayment } from "@/lib/mercadopago/types";
import type { UserStatus } from "@/types/database";

/**
 * Webhook de notificações do Mercado Pago.
 *
 * Fluxo (ver PENDÊNCIA DE VERIFICAÇÃO em src/lib/mercadopago/types.ts):
 * 1. Valida a assinatura (`x-signature` + `x-request-id`, HMAC-SHA256 — ver
 *    verifyWebhook.ts). Nunca processa notificação sem assinatura válida.
 * 2. Registra o evento bruto em `webhook_events` antes de processar — a
 *    chave de idempotência garante que o mesmo evento nunca é processado
 *    duas vezes (reenvios do Mercado Pago, retries de rede, etc.).
 * 3. Nunca confia no conteúdo da notificação para decidir status: busca o
 *    pagamento real e autenticado via GET /v1/payments/{id}.
 * 4. Concede ou atualiza o acesso do usuário (`users.status`) de acordo com
 *    o status real do pagamento.
 *
 * Sem cadastro público: quando o pagamento é aprovado para um e-mail novo,
 * o usuário é criado aqui (sem senha) e recebe por e-mail um link de
 * convite para definir a senha em `/redefinir-senha` no frontend.
 *
 * Responde 200/201 sempre que o evento foi recebido e tratado (mesmo que
 * ignorado), e 401/500 apenas quando a notificação deve ser reenviada
 * (assinatura inválida é um erro definitivo, não reenviado; já uma falha
 * interna é transitória e o Mercado Pago tenta de novo, documentado como
 * ~15 minutos de intervalo).
 */
export async function POST(request: Request) {
  // Assinatura (x-signature) é uma camada extra: o status real do pagamento
  // SEMPRE vem da consulta à API do Mercado Pago com o nosso access token
  // (getPayment abaixo), então uma notificação forjada não libera acesso.
  // Com MERCADOPAGO_WEBHOOK_SECRET preenchido, a assinatura é obrigatória;
  // vazio (ex.: painel não exibe a chave, ou usuário de teste com outra
  // aplicação), a notificação é aceita e só dispara essa consulta.
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim() || "";

  const payload = (await request.json().catch(() => null)) as MercadoPagoWebhookPayload | null;

  if (!payload || payload.type !== "payment" || !payload.data?.id) {
    // Outros tópicos de notificação (ex.: "subscription_preapproval") são
    // reconhecidos e confirmados, mas nunca processados como pagamento.
    return Response.json({ ok: true });
  }

  const dataId = String(payload.data.id);
  const signatureHeader = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");

  if (secret) {
    const isValid = verifyMercadoPagoWebhook({ signatureHeader, requestId, dataId, secret });
    if (!isValid) {
      return Response.json({ error: "Assinatura inválida." }, { status: 401 });
    }
  } else {
    console.warn(
      `[webhook] MERCADOPAGO_WEBHOOK_SECRET vazio: assinatura não verificada (pagamento ${dataId} será confirmado na API do Mercado Pago).`
    );
  }

  const action = payload.action ?? "payment.updated";

  // O status real é consultado ANTES do controle de duplicidade e entra na
  // chave: o Mercado Pago avisa aprovação e reembolso com o MESMO evento
  // ("payment.updated") e o mesmo id de pagamento. Com a chave antiga
  // (evento + id), o aviso do reembolso era tratado como repetido e ignorado,
  // e o acesso não era revogado. Agora cada mudança de status é processada
  // uma vez; reenvios do mesmo status continuam sendo ignorados.
  let payment: MercadoPagoPayment;
  try {
    payment = await getPayment(dataId);
  } catch (err) {
    // Falha temporária na API do Mercado Pago: 500 faz o Mercado Pago reenviar.
    console.error(`[webhook] Falha ao consultar o pagamento ${dataId}:`, err);
    return Response.json({ error: "Erro ao consultar o pagamento." }, { status: 500 });
  }

  const idempotencyKey = `${buildIdempotencyKey(action, dataId)}:${payment.status}`;
  const db = await getDb();
  const events = db.getRepository(WebhookEventEntity);

  // ON CONFLICT DO NOTHING + RETURNING: nenhuma linha devolvida significa
  // que esta idempotency_key já existia, ou seja, evento já recebido antes.
  const inserted = await events
    .createQueryBuilder()
    .insert()
    .values({
      provider: "mercadopago",
      event_type: action,
      external_id: dataId,
      idempotency_key: idempotencyKey,
      payload: asJson(payload),
      status: "received",
    })
    .orIgnore()
    .returning(["id"])
    .execute();

  if (!Array.isArray(inserted.raw) || inserted.raw.length === 0) {
    // Evento já recebido antes. Só é ignorado se foi processado com sucesso:
    // se a tentativa anterior falhou (status "error") ou travou no meio
    // ("received" há mais de 5 minutos), o reenvio do Mercado Pago é
    // reprocessado — antes, um erro temporário (ex.: banco ou API fora do ar)
    // deixava o comprador pago sem acesso para sempre. O UPDATE ... RETURNING
    // garante que só uma requisição "pega" o reprocessamento.
    const claimed = await events
      .createQueryBuilder()
      .update()
      .set({ status: "received", error_message: null })
      .where("idempotency_key = :key", { key: idempotencyKey })
      .andWhere(
        "(status = 'error' or (status = 'received' and processed_at is null and created_at < now() - interval '5 minutes'))"
      )
      .returning(["id"])
      .execute();
    if (!Array.isArray(claimed.raw) || claimed.raw.length === 0) {
      return Response.json({ ok: true, duplicate: true });
    }
    console.warn(`[webhook] Reprocessando evento ${idempotencyKey} após falha anterior.`);
  }

  try {
    await processPayment(db, payment, action);

    await events.update(
      { idempotency_key: idempotencyKey },
      { status: "processed", processed_at: new Date() }
    );

    return Response.json({ ok: true });
  } catch (err) {
    console.error(`[webhook] Falha ao processar ${idempotencyKey}:`, err);
    await events
      .update(
        { idempotency_key: idempotencyKey },
        { status: "error", error_message: err instanceof Error ? err.message : "Erro desconhecido." }
      )
      .catch(() => null);

    return Response.json({ error: "Erro ao processar a notificação." }, { status: 500 });
  }
}

async function processPayment(db: DataSource, payment: MercadoPagoPayment, eventType: string): Promise<void> {
  const purchaseStatus = mapPaymentToPurchaseStatus(payment.status);
  if (!purchaseStatus) {
    throw new Error(`Status de pagamento não reconhecido: ${payment.status}`);
  }

  // Prioriza o e-mail digitado na página de compra (external_reference), que é
  // onde o cliente espera o convite e para o qual aceitou os Termos. O e-mail
  // da conta Mercado Pago do pagador (payer.email) pode ser outro — e, em
  // teste, é o do usuário de teste —, então fica só como reserva.
  const email =
    (payment.external_reference?.includes("@") ? payment.external_reference : payment.payer?.email || "")
      .trim()
      .toLowerCase() || null;
  const userStatus = mapPaymentToUserStatus(payment.status);
  // O mesmo pagamento gera várias notificações (created/updated): o prazo do
  // acesso só é estendido na primeira vez em que ele aparece como aprovado.
  const alreadyGranted = await db.getRepository(PurchaseEntity).existsBy({
    external_transaction_id: String(payment.id),
    status: "approved",
  });
  const userId =
    email && userStatus ? await syncUserAccess(db, email, userStatus, !alreadyGranted) : null;

  // Campanha usada no checkout (automática ou cupom) — só para auditoria/
  // relatório, registrada sempre (mesmo em eventos repetidos do mesmo
  // pagamento), ao contrário da comissão de parceiro, que é uma única vez.
  const campaignIdFromMetadata =
    typeof payment.metadata?.campaign_id === "string" ? payment.metadata.campaign_id : null;

  await db.getRepository(PurchaseEntity).upsert(
    {
      user_id: userId,
      external_transaction_id: String(payment.id),
      external_product_id: payment.external_reference ?? null,
      status: purchaseStatus,
      event_type: eventType,
      raw_payload: asJson(payment),
      purchased_at: payment.date_approved ?? null,
      campaign_id: campaignIdFromMetadata,
    },
    { conflictPaths: ["external_transaction_id", "event_type"] }
  );

  // Comissão de parceiro: só na primeira vez que ESTE pagamento aparece como
  // aprovado (mesma proteção que evita estender o acesso duas vezes). Nunca
  // deixa uma falha aqui impedir a liberação de acesso já concedida acima.
  if (purchaseStatus === "approved" && userId && !alreadyGranted) {
    try {
      const purchase = await db
        .getRepository(PurchaseEntity)
        .findOneBy({ external_transaction_id: String(payment.id), event_type: eventType });
      await recordPartnerCommission(db, { userId, purchaseId: purchase?.id ?? null, payment });
    } catch (err) {
      console.error(`[webhook] Falha ao calcular comissão de parceiro (pagamento ${payment.id}):`, err);
    }
  }
}

/**
 * Atribui a venda a um parceiro (pelo cupom/parceiro usado no checkout ou,
 * na falta disso, pela indicação registrada no cadastro do usuário — amostra
 * grátis) e grava a comissão calculada pela faixa de meta vigente.
 *
 * Nunca falha a aprovação do pagamento: chamado dentro de um try/catch no
 * chamador. O pagamento fica pendente de pagamento no Admin
 * (`admin/partner-commissions.ts`) — nunca é pago automaticamente.
 */
async function recordPartnerCommission(
  db: DataSource,
  params: { userId: string; purchaseId: string | null; payment: MercadoPagoPayment }
): Promise<void> {
  const { userId, purchaseId, payment } = params;
  const metadata = payment.metadata ?? {};
  const partnerIdFromMetadata = typeof metadata.partner_id === "string" ? metadata.partner_id : null;
  const couponFromMetadata = typeof metadata.coupon_code === "string" ? metadata.coupon_code : null;

  const partners = db.getRepository(PartnerEntity);
  let partner = partnerIdFromMetadata ? await partners.findOneBy({ id: partnerIdFromMetadata }) : null;
  if (!partner && couponFromMetadata) {
    partner = await partners.findOneBy({ coupon_code: couponFromMetadata });
  }
  if (!partner) {
    // Sem cupom no pagamento: tenta a indicação registrada no cadastro
    // (quem veio da amostra grátis de um parceiro e comprou depois).
    const user = await db.getRepository(UserEntity).findOneBy({ id: userId });
    if (user?.referred_by_partner_id) {
      partner = await partners.findOneBy({ id: user.referred_by_partner_id });
    }
  }
  if (!partner) return;
  const partnerId = partner.id;

  if (purchaseId) {
    await db.getRepository(PurchaseEntity).update({ id: purchaseId }, { partner_id: partnerId }).catch(() => null);
  }

  await db.transaction(async (manager) => {
    // Lock na linha do parceiro para serializar o cálculo de `sale_number`
    // entre vendas concorrentes do mesmo parceiro (duas notificações do
    // Mercado Pago processadas em paralelo).
    await manager
      .createQueryBuilder()
      .select("id")
      .from(PartnerEntity, "p")
      .where("id = :id", { id: partnerId })
      .setLock("pessimistic_write")
      .getRawOne();

    const commissionRepo = manager.getRepository(PartnerCommissionEntity);
    const saleNumber = (await commissionRepo.count({ where: { partner_id: partnerId } })) + 1;

    const tiers = await manager
      .getRepository(PartnerCommissionTierEntity)
      .find({ where: { partner_id: partnerId }, order: { min_sale_number: "ASC" } });
    const matchedTier = tiers.find(
      (t) => saleNumber >= t.min_sale_number && (t.max_sale_number === null || saleNumber <= t.max_sale_number)
    );
    if (!matchedTier) {
      console.warn(
        `[webhook] Parceiro ${partnerId} sem faixa de comissão cadastrada para a venda #${saleNumber}; comissão registrada com 0%.`
      );
    }
    const percent = matchedTier?.percent ?? 0;
    // Sobre o valor realmente cobrado (já com o desconto do cupom aplicado
    // na criação da preferência) — nunca sobre o preço de tabela.
    const amount = Math.round(((payment.transaction_amount ?? 0) * percent) / 100 * 100) / 100;

    await commissionRepo.insert({
      partner_id: partnerId,
      user_id: userId,
      purchase_id: purchaseId,
      sale_number: saleNumber,
      percent_applied: percent,
      amount_brl: amount,
      status: "pending",
    });
  });
}

/**
 * Garante que exista um usuário para o e-mail do comprador e aplica o novo
 * status. Só cria um usuário novo (com convite) quando o status concede
 * acesso (`active`) — nunca cria um registro só para aplicar um status de
 * revogação a alguém que nunca teve acesso.
 */
async function syncUserAccess(
  db: DataSource,
  email: string,
  status: UserStatus,
  extendAccess: boolean
): Promise<string | null> {
  const users = db.getRepository(UserEntity);
  const existing = await users.findOneBy({ email });

  if (existing) {
    await users.update(
      { id: existing.id },
      status === "active" && extendAccess
        ? {
            status,
            // Testador que compra vira cliente: o prazo comprado conta a partir
            // de hoje (não soma aos dias de cortesia) e a marca de cortesia sai.
            access_expires_at: await computeAccessExpiry(db, existing.is_courtesy ? null : existing.access_expires_at),
            is_courtesy: false,
          }
        : { status }
    );
    return existing.id;
  }

  if (status !== "active") {
    return null;
  }

  // ON CONFLICT DO NOTHING: se dois eventos do mesmo comprador chegarem ao
  // mesmo tempo, só um cria o usuário (e envia o convite); o outro só
  // aplica o status.
  const created = await users
    .createQueryBuilder()
    .insert()
    .values({ email, status, role: "user", access_expires_at: await computeAccessExpiry(db, null) })
    .orIgnore()
    .returning(["id"])
    .execute();

  const newId = (created.raw as Array<{ id: string }>)[0]?.id;
  if (!newId) {
    const raced = await users.findOneByOrFail({ email });
    await users.update({ id: raced.id }, { status });
    return raced.id;
  }

  // Falha no envio do e-mail não desfaz o acesso: o comprador pode pedir
  // um link novo em "Esqueci minha senha" (o usuário já existe).
  try {
    const token = await createAuthToken(db, newId, "invite");
    await sendEmail(inviteEmail(email, buildPasswordSetupUrl(token)));
  } catch (err) {
    console.error(`Falha ao enviar convite para o usuário ${newId}:`, err);
  }

  return newId;
}

/** Payloads externos gravados como jsonb. */
function asJson(value: object): QueryDeepPartialEntity<Record<string, unknown>> {
  return value as QueryDeepPartialEntity<Record<string, unknown>>;
}
