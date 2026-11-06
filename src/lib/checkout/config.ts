import type { DataSource } from "typeorm";
import { CheckoutSettingsEntity } from "@/lib/db/entities";

/**
 * Configuração comercial da oferta do VoceUP (fonte única para a página de
 * compra, a preferência do Mercado Pago e a liberação de acesso).
 *
 * Editável pelo Admin (tabela `checkout_settings`, ver migration
 * CheckoutSettingsAndCampaigns) — `GET`/`PUT /api/admin/settings`. Campo nulo
 * nessa tabela = o Admin ainda não configurou aquele campo; nesse caso cai
 * para a variável de ambiente correspondente (compatibilidade com lojas já
 * configuradas só por env, sem precisar reconfigurar no Admin):
 *  - CHECKOUT_PRODUCT_PRICE_BRL  preço em reais (ex.: 97.00)
 *  - CHECKOUT_PRODUCT_TITLE      nome exibido no Mercado Pago (opcional)
 *  - CHECKOUT_ACCESS_MONTHS      duração do acesso: número de meses (ex.: 3)
 *                                ou "vitalicio".
 *
 * Sem preço ou duração válidos (nem no Admin, nem por env), o checkout fica
 * desativado (nunca vende com condição indefinida).
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

function envConfig(): CheckoutConfig {
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

async function loadSettingsRow(db: DataSource) {
  try {
    const rows = await db
      .getRepository(CheckoutSettingsEntity)
      .find({ order: { updated_at: "DESC" }, take: 1 });
    return rows[0] ?? null;
  } catch (err) {
    console.error("[checkout/config] Falha ao carregar configurações do Admin:", err);
    return null;
  }
}

/**
 * Resolve a configuração efetiva: cada campo usa o valor salvo pelo Admin
 * (tabela `checkout_settings`) quando presente, senão cai para a variável de
 * ambiente. Nunca lança — na falha de leitura, cai inteiramente para o env.
 */
export async function getCheckoutConfig(db: DataSource): Promise<CheckoutConfig> {
  const fallback = envConfig();
  const row = await loadSettingsRow(db);
  if (!row) return fallback;

  const priceFromDb = row.price_brl !== null ? Number(row.price_brl) : null;
  const validPrice = priceFromDb !== null && Number.isFinite(priceFromDb) && priceFromDb > 0
    ? Math.round(priceFromDb * 100) / 100
    : null;
  const price = validPrice ?? fallback.price;

  let accessMonths: number | null;
  let accessLabel: string | null;
  let validAccess: boolean;
  if (row.access_lifetime) {
    accessMonths = null;
    accessLabel = "Acesso vitalício";
    validAccess = true;
  } else if (row.access_months !== null && row.access_months > 0) {
    accessMonths = row.access_months;
    accessLabel = `Acesso por ${accessMonths} ${accessMonths === 1 ? "mês" : "meses"}`;
    validAccess = true;
  } else {
    accessMonths = fallback.accessMonths;
    accessLabel = fallback.accessLabel;
    validAccess = fallback.configured && fallback.accessLabel !== null;
  }

  const title = row.title?.trim() || fallback.title;

  return {
    configured: price !== null && validAccess,
    price,
    priceFormatted:
      price !== null ? price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : null,
    title,
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
export async function computeAccessExpiry(
  db: DataSource,
  current: Date | string | null | undefined
): Promise<Date | null> {
  const { accessMonths } = await getCheckoutConfig(db);
  if (accessMonths === null) return null;
  const now = new Date();
  const currentDate = current ? new Date(current) : null;
  const base = currentDate && currentDate > now ? currentDate : now;
  const result = new Date(base);
  result.setMonth(result.getMonth() + accessMonths);
  return result;
}
