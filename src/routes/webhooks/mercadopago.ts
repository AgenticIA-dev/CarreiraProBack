import type { DataSource, QueryDeepPartialEntity } from "typeorm";
import { getDb } from "@/lib/db/dataSource";
import { PurchaseEntity, UserEntity, WebhookEventEntity } from "@/lib/db/entities";
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
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) {
    // Nunca aceitar notificações sem segredo de validação configurado.
    return Response.json({ error: "Webhook não configurado." }, { status: 503 });
  }

  const payload = (await request.json().catch(() => null)) as MercadoPagoWebhookPayload | null;

  if (!payload || payload.type !== "payment" || !payload.data?.id) {
    // Outros tópicos de notificação (ex.: "subscription_preapproval") são
    // reconhecidos e confirmados, mas nunca processados como pagamento.
    return Response.json({ ok: true });
  }

  const dataId = String(payload.data.id);
  const signatureHeader = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");

  const isValid = verifyMercadoPagoWebhook({ signatureHeader, requestId, dataId, secret });
  if (!isValid) {
    return Response.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  const action = payload.action ?? "payment.updated";
  const idempotencyKey = buildIdempotencyKey(action, dataId);
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
    return Response.json({ ok: true, duplicate: true });
  }

  try {
    const payment = await getPayment(dataId);
    await processPayment(db, payment, action);

    await events.update(
      { idempotency_key: idempotencyKey },
      { status: "processed", processed_at: new Date() }
    );

    return Response.json({ ok: true });
  } catch (err) {
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

  const email = (payment.payer?.email || payment.external_reference || "").trim().toLowerCase() || null;
  const userStatus = mapPaymentToUserStatus(payment.status);
  const userId = email && userStatus ? await syncUserAccess(db, email, userStatus) : null;

  await db.getRepository(PurchaseEntity).upsert(
    {
      user_id: userId,
      external_transaction_id: String(payment.id),
      external_product_id: payment.external_reference ?? null,
      status: purchaseStatus,
      event_type: eventType,
      raw_payload: asJson(payment),
      purchased_at: payment.date_approved ?? null,
    },
    { conflictPaths: ["external_transaction_id", "event_type"] }
  );
}

/**
 * Garante que exista um usuário para o e-mail do comprador e aplica o novo
 * status. Só cria um usuário novo (com convite) quando o status concede
 * acesso (`active`) — nunca cria um registro só para aplicar um status de
 * revogação a alguém que nunca teve acesso.
 */
async function syncUserAccess(db: DataSource, email: string, status: UserStatus): Promise<string | null> {
  const users = db.getRepository(UserEntity);
  const existing = await users.findOneBy({ email });

  if (existing) {
    await users.update({ id: existing.id }, { status });
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
    .values({ email, status, role: "user" })
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
