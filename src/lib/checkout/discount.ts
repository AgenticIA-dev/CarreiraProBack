import type { DataSource } from "typeorm";
import { CampaignEntity, PartnerEntity } from "@/lib/db/entities";

export type DiscountSource = "partner" | "campaign-code" | "campaign-auto" | null;

export interface ResolvedDiscount {
  percent: number;
  source: DiscountSource;
  partnerId: string | null;
  campaignId: string | null;
  /** O código que efetivamente "ganhou" (cupom de parceiro ou de campanha), se houver. */
  couponCode: string | null;
}

const NONE: ResolvedDiscount = { percent: 0, source: null, partnerId: null, campaignId: null, couponCode: null };

function inWindow(c: { starts_at: Date | string | null; ends_at: Date | string | null }, now: Date): boolean {
  if (c.starts_at && new Date(c.starts_at) > now) return false;
  if (c.ends_at && new Date(c.ends_at) < now) return false;
  return true;
}

/**
 * Resolve o melhor desconto do checkout: compara o cupom digitado (parceiro
 * OU campanha com código) com as campanhas automáticas (sem código, ativas e
 * dentro do período) e fica com o MAIOR percentual — nunca soma os dois. Em
 * empate, prioriza o cupom digitado (preserva a atribuição ao parceiro, se
 * for o caso). Nunca lança: cupom/campanha ruim só não aplica desconto.
 */
export async function resolveBestDiscount(db: DataSource, couponCodeInput?: string | null): Promise<ResolvedDiscount> {
  const now = new Date();
  let fromCode: ResolvedDiscount = NONE;

  const code = couponCodeInput?.trim().toUpperCase() || null;
  if (code) {
    try {
      const partner = await db.getRepository(PartnerEntity).findOneBy({ coupon_code: code, active: true });
      if (partner) {
        fromCode = { percent: partner.discount_percent, source: "partner", partnerId: partner.id, campaignId: null, couponCode: code };
      } else {
        const campaign = await db.getRepository(CampaignEntity).findOneBy({ code, active: true });
        if (campaign && inWindow(campaign, now)) {
          fromCode = {
            percent: campaign.discount_percent,
            source: "campaign-code",
            partnerId: null,
            campaignId: campaign.id,
            couponCode: code,
          };
        }
      }
    } catch (err) {
      console.error("[checkout] Falha ao resolver cupom:", err);
    }
  }

  let fromAuto: ResolvedDiscount = NONE;
  try {
    // TypeORM: `code: null` nos critérios gera "code is null" — as campanhas
    // automáticas (sem cupom) são exatamente essas.
    const autoCampaigns = await db.getRepository(CampaignEntity).find({ where: { active: true, code: null as unknown as string } });
    for (const c of autoCampaigns) {
      if (inWindow(c, now) && c.discount_percent > fromAuto.percent) {
        fromAuto = { percent: c.discount_percent, source: "campaign-auto", partnerId: null, campaignId: c.id, couponCode: null };
      }
    }
  } catch (err) {
    console.error("[checkout] Falha ao resolver campanha automática:", err);
  }

  return fromCode.percent >= fromAuto.percent ? fromCode : fromAuto;
}

/** Aplica um desconto percentual a um preço, arredondado em centavos. */
export function applyDiscount(price: number, percent: number): number {
  if (percent <= 0) return price;
  return Math.round(price * (1 - percent / 100) * 100) / 100;
}
