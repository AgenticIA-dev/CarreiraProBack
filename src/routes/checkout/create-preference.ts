import { z } from "zod";
import { createPreference } from "@/lib/mercadopago/client";
import { getClientIp, rateLimit } from "@/lib/security/rateLimit";
import { getPrimaryFrontendUrl } from "@/lib/http/cors";
import { getCheckoutConfig } from "@/lib/checkout/config";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  // Aceite expresso dos Termos de Uso e da Política de Privacidade, na versão
  // exibida ao comprador (registrado nos metadados do pagamento).
  acceptedTerms: z.literal(true),
  termsVersion: z.string().min(1).max(40),
});

/**
 * Cria uma preferência de pagamento (Checkout Pro) para a compra direta do
 * VoceUP. Não há mais venda por marketplace (Hotmart foi removida): o
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
    const termsIssue = parsed.error.issues.some((i) => i.path[0] === "acceptedTerms" || i.path[0] === "termsVersion");
    return Response.json(
      {
        error: termsIssue
          ? "Para continuar, aceite os Termos de Uso e a Política de Privacidade."
          : "Informe um e-mail válido para continuar.",
      },
      { status: 400 }
    );
  }

  const config = getCheckoutConfig();
  if (parsed.data.termsVersion !== config.termsVersion) {
    return Response.json(
      { error: "Os termos foram atualizados. Recarregue a página e revise antes de continuar." },
      { status: 409 }
    );
  }

  // Para onde o comprador volta depois de pagar (páginas /comprar/* — UI,
  // vivem no projeto FRONTEND, não aqui).
  const frontendUrl = getPrimaryFrontendUrl();
  // Para onde o Mercado Pago envia a notificação de pagamento (este próprio
  // backend, que é quem expõe /api/webhooks/mercadopago). NEXT_PUBLIC_APP_URL
  // é o nome antigo (da época do Next.js), aceito para não quebrar .env antigos.
  const backendUrl = (process.env.API_PUBLIC_URL ?? process.env.NEXT_PUBLIC_APP_URL)?.trim().replace(/\/+$/, "");

  if (!config.configured || config.price === null || !frontendUrl || !backendUrl) {
    // Configuração ausente nunca deve resultar em cobrança de valor
    // arbitrário — falha explicitamente em vez de usar um valor padrão.
    return Response.json(
      {
        error:
          "Checkout não configurado. Defina CHECKOUT_PRODUCT_PRICE_BRL, CHECKOUT_ACCESS_MONTHS, FRONTEND_ORIGIN e API_PUBLIC_URL no ambiente do servidor.",
      },
      { status: 500 }
    );
  }
  const price = config.price;

  const email = parsed.data.email;

  try {
    const preference = await createPreference({
      items: [
        {
          title: config.title,
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
      statement_descriptor: "VOCEUP",
      // Registro do aceite dos termos (versão e momento) junto ao pagamento.
      metadata: {
        terms_version: config.termsVersion,
        terms_accepted_at: new Date().toISOString(),
        access_months: config.accessMonths ?? "vitalicio",
      },
    });

    return Response.json({ initPoint: preference.init_point });
  } catch (err) {
    console.error("[checkout] Falha ao criar preferência:", err);
    return Response.json(
      { error: "Não foi possível iniciar o pagamento agora. Tente novamente em instantes." },
      { status: 502 }
    );
  }
}
