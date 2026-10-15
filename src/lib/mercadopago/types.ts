/**
 * Tipos da integração com o Mercado Pago (Checkout Pro).
 *
 * ==========================================================================
 * PENDÊNCIA DE VERIFICAÇÃO — LEIA ANTES DE IR PARA PRODUÇÃO
 * ==========================================================================
 * Implementado a partir da documentação oficial em
 * developers.mercadopago.com (seções "Webhooks"/"Notificações" e "Checkout
 * Pro") consultada durante o desenvolvimento, complementada por uma fonte
 * secundária para o formato exato do "manifest" usado na assinatura HMAC
 * (a doc oficial confirma o header `x-signature` no formato
 * `ts=...,v1=...` e HMAC-SHA256, mas a montagem exata da string assinada
 * estava em uma aba de código que não pôde ser lida integralmente). Antes
 * de produção, confirme em
 * https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 * (aba "Sem SDKs"/sem biblioteca) o formato exato do manifest e, se algo
 * divergir, ajuste `verifyWebhook.ts` — a documentação oficial sempre
 * prevalece sobre este projeto, e a divergência deve ser registrada em
 * docs/DOCUMENTATION.md.
 * ==========================================================================
 */

/** Status de pagamento documentados pela API do Mercado Pago. */
export type MercadoPagoPaymentStatus =
  | "pending"
  | "approved"
  | "authorized"
  | "in_process"
  | "in_mediation"
  | "rejected"
  | "cancelled"
  | "refunded"
  | "charged_back";

/** Corpo recebido na notificação de webhook (tópico "payment"). */
export interface MercadoPagoWebhookPayload {
  id?: number | string;
  live_mode?: boolean;
  type: string; // ex.: "payment"
  action?: string; // ex.: "payment.created" | "payment.updated"
  date_created?: string;
  user_id?: number | string;
  api_version?: string;
  data: { id: string };
}

/** Subconjunto relevante do recurso retornado por GET /v1/payments/{id}. */
export interface MercadoPagoPayment {
  id: number;
  status: MercadoPagoPaymentStatus;
  status_detail?: string;
  external_reference?: string | null;
  transaction_amount?: number;
  currency_id?: string;
  date_approved?: string | null;
  date_created?: string;
  payer?: {
    email?: string;
    first_name?: string | null;
    last_name?: string | null;
  };
}

/** Corpo enviado para POST /checkout/preferences. */
export interface CreatePreferenceRequest {
  items: {
    title: string;
    quantity: number;
    unit_price: number;
    currency_id: string;
  }[];
  payer?: { email: string };
  external_reference?: string;
  back_urls: { success: string; failure: string; pending: string };
  auto_return?: "approved";
  notification_url?: string;
}

export interface CreatePreferenceResponse {
  id: string;
  init_point: string;
  sandbox_init_point?: string;
}
