import { getCheckoutConfig } from "@/lib/checkout/config";
import { getDb } from "@/lib/db/dataSource";
import { PartnerEntity } from "@/lib/db/entities";

/**
 * Condições públicas da oferta (preço, duração do acesso, versão dos termos),
 * exibidas na página de compra antes do pagamento — exigência do Decreto
 * 7.962/2013 (informações claras sobre preço e condições).
 *
 * `?coupon=CODIGO` (opcional): se for um cupom de parceiro ativo, devolve
 * também o preço com desconto — só para exibir na tela antes de pagar; o
 * desconto real é recalculado e aplicado de novo em `create-preference.ts`,
 * nunca confiando no que o cliente mandar de volta.
 */
export async function GET(request?: Request) {
  const c = getCheckoutConfig();
  const couponParam = request ? new URL(request.url).searchParams.get("coupon")?.trim().toUpperCase() : null;

  let coupon: { valid: boolean; discountPercent: number; priceWithDiscount: number | null } | null = null;
  if (couponParam) {
    try {
      const db = await getDb();
      const partner = await db.getRepository(PartnerEntity).findOneBy({ coupon_code: couponParam, active: true });
      coupon = {
        valid: Boolean(partner),
        discountPercent: partner?.discount_percent ?? 0,
        priceWithDiscount:
          partner && c.price !== null
            ? Math.round(c.price * (1 - partner.discount_percent / 100) * 100) / 100
            : null,
      };
    } catch (err) {
      console.error("[checkout/info] Falha ao consultar cupom:", err);
      coupon = { valid: false, discountPercent: 0, priceWithDiscount: null };
    }
  }

  return Response.json({
    configured: c.configured,
    price: c.price,
    priceFormatted: c.priceFormatted,
    title: c.title,
    accessMonths: c.accessMonths,
    accessLabel: c.accessLabel,
    termsVersion: c.termsVersion,
    ...(coupon ? { coupon } : {}),
  });
}
