/**
 * Configuração comercial da oferta do VoceUP (fonte única para a página de
 * compra, a preferência do Mercado Pago e a liberação de acesso).
 *
 * Tudo vem de variáveis de ambiente do servidor — o cliente nunca define
 * preço nem duração:
 *  - CHECKOUT_PRODUCT_PRICE_BRL  preço em reais (ex.: 97.00)
 *  - CHECKOUT_PRODUCT_TITLE      nome exibido no Mercado Pago (opcional)
 *  - CHECKOUT_ACCESS_MONTHS      duração do acesso: número de meses (ex.: 3)
 *                                ou "vitalicio". Obrigatório — os Termos e a
 *                                página de compra informam esse prazo, e o
 *                                sistema o aplica de fato (users.access_expires_at).
 *
 * Sem preço ou duração válidos, o checkout fica desativado (nunca vende com
 * condição indefinida).
 */

/** Versão dos Termos de Uso/Política de Privacidade aceitos na compra. Atualize ao mudar os textos. */
export const TERMS_VERSION = "2026-11-02";

export interface CheckoutConfig {
  configured: boolean;
  price: number | null;
  priceFormatted: string | null;
  title: string;
  /** null = vitalício. */
  accessMonths: number | null;
  accessLabel: string | null;
  termsVersion: string;
}

export function getCheckoutConfig(): CheckoutConfig {
  const priceRaw = process.env.CHECKOUT_PRODUCT_PRICE_BRL?.trim();
  const price = priceRaw ? Number(priceRaw.replace(",", ".")) : NaN;
  const validPrice = Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : null;

  const accessRaw = process.env.CHECKOUT_ACCESS_MONTHS?.trim().toLowerCase();
  let accessMonths: number | null = null;
  let accessLabel: string | null = null;
  let validAccess = false;
  if (accessRaw === "vitalicio" || accessRaw === "vitalício") {
    validAccess = true;
    accessLabel = "Acesso vitalício";
  } else if (accessRaw && /^\d+$/.test(accessRaw) && Number(accessRaw) > 0) {
    accessMonths = Number(accessRaw);
    validAccess = true;
    accessLabel = `Acesso por ${accessMonths} ${accessMonths === 1 ? "mês" : "meses"}`;
  }

  return {
    configured: validPrice !== null && validAccess,
    price: validPrice,
    priceFormatted:
      validPrice !== null
        ? validPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : null,
    title: process.env.CHECKOUT_PRODUCT_TITLE?.trim() || "VoceUP — Acesso completo",
    accessMonths,
    accessLabel,
    termsVersion: TERMS_VERSION,
  };
}

/**
 * Nova data de expiração ao aprovar um pagamento: soma a duração a partir de
 * hoje ou, se o acesso atual ainda estiver valendo, a partir do fim dele
 * (renovação antecipada não perde dias). null = sem expiração (vitalício).
 */
export function computeAccessExpiry(current: Date | string | null | undefined): Date | null {
  const { accessMonths } = getCheckoutConfig();
  if (accessMonths === null) return null;
  const now = new Date();
  const currentDate = current ? new Date(current) : null;
  const base = currentDate && currentDate > now ? currentDate : now;
  const result = new Date(base);
  result.setMonth(result.getMonth() + accessMonths);
  return result;
}
