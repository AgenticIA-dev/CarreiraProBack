import { getCheckoutConfig } from "@/lib/checkout/config";
import { resolveBestDiscount, applyDiscount } from "@/lib/checkout/discount";
import { getDb } from "@/lib/db/dataSource";

/**
 * Condições públicas da oferta (preço, duração do acesso, versão dos termos),
 * exibidas na página de compra antes do pagamento — exigência do Decreto
 * 7.962/2013 (informações claras sobre preço e condições).
 *
 * `discountPercent`/`priceWithDiscount` (topo da resposta): o MELHOR desconto
 * vigente agora — campanha automática (sem código) OU, se `?coupon=CODIGO`
 * for passado e for válido (cupom de parceiro ou campanha com código), o
 * maior entre os dois. Nunca soma. Serve para a página de compra mostrar o
 * preço com desconto mesmo sem o visitante digitar nada.
 *
 * `coupon` (legado, só quando `?coupon=` é passado): mantém o formato antigo
 * (`valid`/`discountPercent`/`priceWithDiscount`) para a mensagem de
 * cupom válido/inválido — o desconto REAL é sempre o maior (ver acima) e é
 * recalculado e aplicado de novo em `create-preference.ts`, nunca confiando
 * no que o cliente mandar de volta.
 */
export async function GET(request?: Request) {
  const db = await getDb();
  const c = await getCheckoutConfig(db);
  const couponParam = request ? new URL(request.url).searchParams.get("coupon")?.trim().toUpperCase() : null;

  const auto = await resolveBestDiscount(db, null);
  let best = auto;

  let coupon: { valid: boolean; discountPercent: number; priceWithDiscount: number | null } | null = null;
  if (couponParam) {
    try {
      const resolved = await resolveBestDiscount(db, couponParam);
      const valid = resolved.source === "partner" || resolved.source === "campaign-code";
      coupon = {
        valid,
        discountPercent: valid ? resolved.percent : 0,
        priceWithDiscount: valid && c.price !== null ? applyDiscount(c.price, resolved.percent) : null,
      };
      if (resolved.percent > best.percent) best = resolved;
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
    // Melhor desconto vigente agora (automático ou, se digitado, o cupom — o
    // que for maior); null/0 quando não há nenhum.
    discountPercent: best.percent > 0 ? best.percent : null,
    priceWithDiscount: best.percent > 0 && c.price !== null ? applyDiscount(c.price, best.percent) : null,
    ...(coupon ? { coupon } : {}),
  });
}
