import { z } from "zod";
import { createPreference } from "@/lib/mercadopago/client";
import { getClientIp, rateLimit } from "@/lib/security/rateLimit";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
});

/**
 * Cria uma preferência de pagamento (Checkout Pro) para a compra direta do
 * CarreiraPro. Não há mais venda por marketplace (Hotmart foi removida): o
 * próprio app hospeda a página `/comprar` e usa o Mercado Pago apenas para
 * processar o pagamento, via redirecionamento para o `init_point` retornado
 * aqui.
 *
 * Preço e título do produto são SEMPRE lidos de variáveis de ambiente do
 * servidor — nunca do corpo da requisição (PROMPT MESTRE §13: o cliente
 * nunca determina valores financeiros).
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = rateLimit(`checkout:${ip}`, 10, 60_000);
  if (!allowed) {
    return Response.json(
      { error: "Muitas tentativas. Aguarde um instante e tente novamente." },
      { status: 429 }
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Informe um e-mail válido para continuar." }, { status: 400 });
  }

  const priceRaw = process.env.CHECKOUT_PRODUCT_PRICE_BRL;
  const price = priceRaw ? Number(priceRaw) : NaN;
  // Para onde o comprador volta depois de pagar (páginas /comprar/* — UI,
  // vivem no projeto FRONTEND, não aqui).
  const frontendUrl = process.env.FRONTEND_ORIGIN;
  // Para onde o Mercado Pago envia a notificação de pagamento (este próprio
  // backend, que é quem expõe /api/webhooks/mercadopago). NEXT_PUBLIC_APP_URL
  // é o nome antigo (da época do Next.js), aceito para não quebrar .env antigos.
  const backendUrl = process.env.API_PUBLIC_URL ?? process.env.NEXT_PUBLIC_APP_URL;

  if (!priceRaw || Number.isNaN(price) || price <= 0 || !frontendUrl || !backendUrl) {
    // Configuração ausente nunca deve resultar em cobrança de valor
    // arbitrário — falha explicitamente em vez de usar um valor padrão.
    return Response.json(
      {
        error:
          "Checkout não configurado. Defina CHECKOUT_PRODUCT_PRICE_BRL, FRONTEND_ORIGIN e API_PUBLIC_URL no ambiente do servidor.",
      },
      { status: 500 }
    );
  }

  const email = parsed.data.email;

  try {
    const preference = await createPreference({
      items: [
        {
          title: process.env.CHECKOUT_PRODUCT_TITLE?.trim() || "CarreiraPro — Acesso completo",
          quantity: 1,
          unit_price: price,
          currency_id: "BRL",
        },
      ],
      payer: { email },
      // Usado para correlacionar o pagamento ao comprador quando o webhook
      // chegar — não há cadastro de pedidos próprio neste MVP.
      external_reference: email,
      back_urls: {
        success: `${frontendUrl}/comprar/sucesso`,
        failure: `${frontendUrl}/comprar`,
        pending: `${frontendUrl}/comprar/pendente`,
      },
      auto_return: "approved",
      notification_url: `${backendUrl}/api/webhooks/mercadopago`,
    });

    return Response.json({ initPoint: preference.init_point });
  } catch {
    return Response.json(
      { error: "Não foi possível iniciar o pagamento agora. Tente novamente em instantes." },
      { status: 502 }
    );
  }
}
