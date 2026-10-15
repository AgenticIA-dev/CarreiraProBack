import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";
import { verifyMercadoPagoWebhook, buildIdempotencyKey } from "@/lib/mercadopago/verifyWebhook";
import { getPayment } from "@/lib/mercadopago/client";
import { mapPaymentToPurchaseStatus, mapPaymentToUserStatus } from "@/lib/mercadopago/mapStatus";
import type { MercadoPagoWebhookPayload, MercadoPagoPayment } from "@/lib/mercadopago/types";
import type { UserStatus } from "@/types/database";

type ServiceRoleClient = ReturnType<typeof createSupabaseServiceRoleClient>;

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
 * 4. Concede ou atualiza o acesso do usuário (Supabase Auth +
 *    `public.users.status`) de acordo com o status real do pagamento.
 *
 * Sem cadastro público: o acesso é criado aqui via
 * `supabase.auth.admin.inviteUserByEmail` quando o pagamento é aprovado — o
 * mesmo modelo usado anteriormente com a Hotmart, agora disparado pelo
 * Mercado Pago.
 *
 * Responde 200/201 sempre que o evento foi recebido e tratado (mesmo que
 * ignorado), e 401/500 apenas quando a notificação deve ser reenviada
 * (assinatura inválida é um erro definitivo, não reenviado; já uma falha
 * interna é transitória e o Mercado Pago tenta de novo, documentado como
 * ~15 minutos de intervalo).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) {
    // Nunca aceitar notificações sem segredo de validação configurado.
    return NextResponse.json({ error: "Webhook não configurado." }, { status: 503 });
  }

  const payload = (await request.json().catch(() => null)) as MercadoPagoWebhookPayload | null;

  if (!payload || payload.type !== "payment" || !payload.data?.id) {
    // Outros tópicos de notificação (ex.: "subscription_preapproval") são
    // reconhecidos e confirmados, mas nunca processados como pagamento.
    return NextResponse.json({ ok: true });
  }

  const dataId = String(payload.data.id);
  const signatureHeader = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");

  const isValid = verifyMercadoPagoWebhook({ signatureHeader, requestId, dataId, secret });
  if (!isValid) {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  const action = payload.action ?? "payment.updated";
  const idempotencyKey = buildIdempotencyKey(action, dataId);
  const service = createSupabaseServiceRoleClient();

  const { error: insertEventError } = await service.from("webhook_events").insert({
    provider: "mercadopago",
    event_type: action,
    external_id: dataId,
    idempotency_key: idempotencyKey,
    payload: payload as unknown as Record<string, unknown>,
    status: "received",
  });

  if (insertEventError) {
    // Violação da unicidade de idempotency_key = evento já recebido antes.
    // Confirma recebimento sem reprocessar.
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    const payment = await getPayment(dataId);
    await processPayment(service, payment, action);

    await service
      .from("webhook_events")
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("idempotency_key", idempotencyKey);

    return NextResponse.json({ ok: true });
  } catch (err) {
    await service
      .from("webhook_events")
      .update({
        status: "error",
        error_message: err instanceof Error ? err.message : "Erro desconhecido.",
      })
      .eq("idempotency_key", idempotencyKey);

    return NextResponse.json({ error: "Erro ao processar a notificação." }, { status: 500 });
  }
}

async function processPayment(
  service: ServiceRoleClient,
  payment: MercadoPagoPayment,
  eventType: string
): Promise<void> {
  const purchaseStatus = mapPaymentToPurchaseStatus(payment.status);
  if (!purchaseStatus) {
    throw new Error(`Status de pagamento não reconhecido: ${payment.status}`);
  }

  const email = payment.payer?.email?.trim().toLowerCase() || payment.external_reference || null;
  const userStatus = mapPaymentToUserStatus(payment.status);
  const userId = email && userStatus ? await syncUserAccess(service, email, userStatus) : null;

  await service.from("purchases").upsert(
    {
      user_id: userId,
      external_transaction_id: String(payment.id),
      external_product_id: payment.external_reference ?? null,
      status: purchaseStatus,
      event_type: eventType,
      raw_payload: payment as unknown as Record<string, unknown>,
      purchased_at: payment.date_approved ?? null,
    },
    { onConflict: "external_transaction_id,event_type" }
  );
}

/**
 * Garante que exista um usuário para o e-mail do comprador e aplica o novo
 * status. Só cria um usuário novo (via convite) quando o status concede
 * acesso (`active`) — nunca cria um registro só para aplicar um status de
 * revogação a alguém que nunca teve acesso.
 */
async function syncUserAccess(
  service: ServiceRoleClient,
  email: string,
  status: UserStatus
): Promise<string | null> {
  const { data: existing } = await service
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    await service.from("users").update({ status }).eq("id", existing.id);
    return existing.id;
  }

  if (status !== "active") {
    return null;
  }

  // Sem cadastro público: o acesso é concedido criando o usuário por convite
  // de e-mail (sem senha permanente em texto puro). O trigger
  // `on_auth_user_created` cria o perfil em public.users com status
  // "pending"; aqui atualizamos para o status real do pagamento.
  const { data: invited, error } = await service.auth.admin.inviteUserByEmail(email);
  if (error || !invited?.user) {
    throw error ?? new Error("Falha ao convidar o usuário após pagamento aprovado.");
  }

  await service.from("users").update({ status }).eq("id", invited.user.id);
  return invited.user.id;
}
