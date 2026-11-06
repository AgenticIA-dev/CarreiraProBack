/**
 * Pagamento de comissão aos parceiros via Payouts API do Mercado Pago.
 *
 * ==========================================================================
 * PENDÊNCIA DE VERIFICAÇÃO — LEIA ANTES DE IR PARA PRODUÇÃO
 * ==========================================================================
 * Implementado a partir da pesquisa feita durante o desenvolvimento
 * (POST /v1/payouts, cabeçalho `X-Idempotency-Key`, conta padrão sem
 * aprovação especial no Brasil). Antes de pagar a primeira comissão real,
 * confirme em https://www.mercadopago.com.br/developers (seção
 * "Payouts"/"Pagamentos para parceiros") o formato exato do corpo — em
 * especial que campo identifica o recebedor (e-mail da conta MP, CPF/CNPJ
 * via Pix, ou ID de usuário) — e se a conta precisa de alguma habilitação
 * adicional. Se algo divergir, ajuste esta função — a documentação oficial
 * sempre prevalece sobre este projeto, e a divergência deve ser registrada
 * em docs/DOCUMENTATION.md.
 * ==========================================================================
 */

const API_BASE = "https://api.mercadopago.com";

function getAccessToken(): string {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Mercado Pago não configurado: defina MERCADOPAGO_ACCESS_TOKEN.");
  }
  return token;
}

export interface CreatePayoutRequest {
  /** Chave única por comissão (ex.: `commission:<id>`) — evita pagar a mesma comissão duas vezes em caso de retry. */
  idempotencyKey: string;
  /** Valor em reais (BRL). */
  amount: number;
  /** E-mail ou ID da conta Mercado Pago do parceiro recebedor, informado pelo admin na hora de pagar. */
  receiverId: string;
  /** Id interno (comissão) para rastrear este pagamento nos relatórios do Mercado Pago. */
  externalReference: string;
}

export interface PayoutResponse {
  id: string;
  status: string;
}

/**
 * Paga uma comissão a um parceiro. Nunca chamado automaticamente: o admin
 * decide quando pagar cada comissão, na tela "Comissões" do Admin
 * (`admin/partner-commissions.ts`).
 */
export async function createPayout(request: CreatePayoutRequest): Promise<PayoutResponse> {
  const response = await fetch(`${API_BASE}/v1/payouts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAccessToken()}`,
      "X-Idempotency-Key": request.idempotencyKey,
    },
    body: JSON.stringify({
      amount: request.amount,
      currency: "BRL",
      receiver_id: request.receiverId,
      external_reference: request.externalReference,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Mercado Pago respondeu com status ${response.status} ao pagar a comissão. ${detail}`.trim());
  }

  return (await response.json()) as PayoutResponse;
}
