import { getCheckoutConfig } from "@/lib/checkout/config";

/**
 * Condições públicas da oferta (preço, duração do acesso, versão dos termos),
 * exibidas na página de compra antes do pagamento — exigência do Decreto
 * 7.962/2013 (informações claras sobre preço e condições).
 */
export async function GET() {
  const c = getCheckoutConfig();
  return Response.json({
    configured: c.configured,
    price: c.price,
    priceFormatted: c.priceFormatted,
    title: c.title,
    accessMonths: c.accessMonths,
    accessLabel: c.accessLabel,
    termsVersion: c.termsVersion,
  });
}
