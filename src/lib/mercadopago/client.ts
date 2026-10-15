import type {
  CreatePreferenceRequest,
  CreatePreferenceResponse,
  MercadoPagoPayment,
} from "./types";

const API_BASE = "https://api.mercadopago.com";

function getAccessToken(): string {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "Mercado Pago não configurado: defina MERCADOPAGO_ACCESS_TOKEN."
    );
  }
  return token;
}

/**
 * Cria uma preferência de pagamento (Checkout Pro) e retorna a URL de
 * checkout hospedada pelo Mercado Pago (`init_point`), para onde o
 * comprador é redirecionado.
 *
 * Nunca aceite o preço vindo do cliente — quem chama esta função deve
 * montar `items[].unit_price` a partir de uma constante/variável de
 * ambiente do servidor (ver `src/app/api/checkout/create-preference/route.ts`),
 * nunca de um valor recebido na requisição (mesmo princípio do PROMPT
 * MESTRE §13: nunca permitir que o cliente determine valores financeiros).
 */
export async function createPreference(
  body: CreatePreferenceRequest
): Promise<CreatePreferenceResponse> {
  const response = await fetch(`${API_BASE}/checkout/preferences`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAccessToken()}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Mercado Pago respondeu com status ${response.status} ao criar a preferência.`);
  }

  return (await response.json()) as CreatePreferenceResponse;
}

/**
 * Busca os dados completos de um pagamento pelo id recebido na notificação
 * de webhook (`data.id`). Nunca confiamos no payload da notificação em si
 * para decidir status — ele é só um aviso de que algo mudou; os dados reais
 * vêm desta chamada autenticada à API.
 */
export async function getPayment(paymentId: string): Promise<MercadoPagoPayment> {
  const response = await fetch(`${API_BASE}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });

  if (!response.ok) {
    throw new Error(`Mercado Pago respondeu com status ${response.status} ao buscar o pagamento.`);
  }

  return (await response.json()) as MercadoPagoPayment;
}
