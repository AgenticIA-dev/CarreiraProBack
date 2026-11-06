import { z } from "zod";
import { requireAdminApiUser } from "@/lib/auth/apiAuth";
import type { ApiAuthContext } from "@/lib/auth/apiAuth";
import { PartnerCommissionEntity, PartnerCommissionTierEntity, PartnerEntity } from "@/lib/db/entities";

/**
 * Parceiros do programa de influenciadores — só admin.
 *
 *  GET    /api/admin/partners      → lista parceiros, faixas de comissão e totais de vendas
 *  POST   /api/admin/partners      → cria parceiro + faixas de comissão
 *  PATCH  /api/admin/partners/:id  → atualiza dados e/ou substitui as faixas
 *  DELETE /api/admin/partners/:id  → desativa (cupom deixa de dar desconto); não apaga histórico
 *
 * O cupom (`coupon_code`) é o código que o parceiro divulga, aplicado no
 * checkout (`checkout/create-preference.ts`). As faixas (`tiers`) decidem o
 * percentual de comissão por posição da venda — ex.: 20% até a 20ª venda,
 * 25% da 21ª à 30ª, 30% acima da 30ª (`max_sale_number: null`) — ver
 * migration Partners.
 */

const tierSchema = z
  .object({
    minSaleNumber: z.number().int().min(1),
    maxSaleNumber: z.number().int().min(1).nullable(),
    percent: z.number().int().min(0).max(100),
  })
  .refine((t) => t.maxSaleNumber === null || t.maxSaleNumber >= t.minSaleNumber, {
    message: "A venda final da faixa não pode ser menor que a inicial.",
    path: ["maxSaleNumber"],
  });

const couponCode = z
  .string()
  .trim()
  .toUpperCase()
  .min(3, "O cupom deve ter pelo menos 3 caracteres.")
  .max(40)
  .regex(/^[A-Z0-9_-]+$/, "O cupom só pode ter letras, números, - ou _.");

const createSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do parceiro.").max(120),
  email: z.string().trim().toLowerCase().email().max(254).optional().nullable(),
  couponCode,
  discountPercent: z.number().int().min(0).max(100),
  tiers: z.array(tierSchema).max(20).optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().toLowerCase().email().max(254).nullable().optional(),
  couponCode: couponCode.optional(),
  discountPercent: z.number().int().min(0).max(100).optional(),
  active: z.boolean().optional(),
  tiers: z.array(tierSchema).max(20).optional(),
});

async function replaceTiers(
  db: ApiAuthContext["db"],
  partnerId: string,
  tiers: z.infer<typeof tierSchema>[]
): Promise<void> {
  const repo = db.getRepository(PartnerCommissionTierEntity);
  await repo.delete({ partner_id: partnerId });
  if (tiers.length > 0) {
    await repo.insert(
      tiers.map((t) => ({
        partner_id: partnerId,
        min_sale_number: t.minSaleNumber,
        max_sale_number: t.maxSaleNumber,
        percent: t.percent,
      }))
    );
  }
}

export async function GET(request: Request) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
    return Response.json({ error: "Acesso restrito." }, { status: 403 });
  }

  try {
    const partners = await admin.db.getRepository(PartnerEntity).find({ order: { created_at: "DESC" } });
    const tiers = await admin.db
      .getRepository(PartnerCommissionTierEntity)
      .find({ order: { min_sale_number: "ASC" } });
    const totals = await admin.db
      .getRepository(PartnerCommissionEntity)
      .createQueryBuilder("c")
      .select("c.partner_id", "partner_id")
      .addSelect("count(*)", "sales_count")
      .addSelect("coalesce(sum(c.amount_brl), 0)", "total_amount")
      .addSelect("coalesce(sum(case when c.status = 'pending' then c.amount_brl else 0 end), 0)", "pending_amount")
      .groupBy("c.partner_id")
      .getRawMany<{ partner_id: string; sales_count: string; total_amount: string; pending_amount: string }>();

    const partnersWithDetails = partners.map((partner) => {
      const total = totals.find((t) => t.partner_id === partner.id);
      return {
        ...partner,
        tiers: tiers.filter((t) => t.partner_id === partner.id),
        salesCount: Number(total?.sales_count ?? 0),
        totalCommissionBrl: Number(total?.total_amount ?? 0),
        pendingCommissionBrl: Number(total?.pending_amount ?? 0),
      };
    });

    return Response.json({ partners: partnersWithDetails });
  } catch (err) {
    console.error("[admin/partners] Falha ao listar:", err);
    return Response.json({ error: "Não foi possível carregar os parceiros agora." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
    return Response.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Dados inválidos. Confira nome, cupom e percentual de desconto." }, { status: 400 });
  }
  const { tiers, ...data } = parsed.data;

  try {
    const partners = admin.db.getRepository(PartnerEntity);
    const existing = await partners.findOneBy({ coupon_code: data.couponCode });
    if (existing) {
      return Response.json({ error: "Já existe um parceiro com esse cupom." }, { status: 409 });
    }

    const partner = await partners.save(
      partners.create({
        name: data.name,
        email: data.email || null,
        coupon_code: data.couponCode,
        discount_percent: data.discountPercent,
      })
    );
    if (tiers && tiers.length > 0) {
      await replaceTiers(admin.db, partner.id, tiers);
    }

    return Response.json({ ok: true, partner });
  } catch (err) {
    console.error("[admin/partners] Falha ao criar:", err);
    return Response.json({ error: "Não foi possível criar o parceiro agora." }, { status: 500 });
  }
}

export async function PATCH(request: Request, id: string) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
    return Response.json({ error: "Acesso restrito." }, { status: 403 });
  }
  const idCheck = z.string().uuid().safeParse(id);
  if (!idCheck.success) {
    return Response.json({ error: "Parceiro não encontrado." }, { status: 404 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const { tiers, couponCode: newCoupon, ...rest } = parsed.data;

  try {
    const partners = admin.db.getRepository(PartnerEntity);
    const partner = await partners.findOneBy({ id: idCheck.data });
    if (!partner) {
      return Response.json({ error: "Parceiro não encontrado." }, { status: 404 });
    }

    if (newCoupon && newCoupon !== partner.coupon_code) {
      const taken = await partners.findOneBy({ coupon_code: newCoupon });
      if (taken) {
        return Response.json({ error: "Já existe um parceiro com esse cupom." }, { status: 409 });
      }
    }

    await partners.update(
      { id: idCheck.data },
      {
        ...(rest.name !== undefined ? { name: rest.name } : {}),
        ...(rest.email !== undefined ? { email: rest.email || null } : {}),
        ...(newCoupon ? { coupon_code: newCoupon } : {}),
        ...(rest.discountPercent !== undefined ? { discount_percent: rest.discountPercent } : {}),
        ...(rest.active !== undefined ? { active: rest.active } : {}),
      }
    );
    if (tiers !== undefined) {
      await replaceTiers(admin.db, idCheck.data, tiers);
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[admin/partners] Falha ao atualizar:", err);
    return Response.json({ error: "Não foi possível salvar agora." }, { status: 500 });
  }
}

export async function DELETE(request: Request, id: string) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
    return Response.json({ error: "Acesso restrito." }, { status: 403 });
  }
  const idCheck = z.string().uuid().safeParse(id);
  if (!idCheck.success) {
    return Response.json({ ok: true });
  }

  try {
    // Desativa em vez de apagar: o cupom para de valer, mas o histórico de
    // vendas e comissões desse parceiro é preservado.
    await admin.db.getRepository(PartnerEntity).update({ id: idCheck.data }, { active: false });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[admin/partners] Falha ao desativar:", err);
    return Response.json({ error: "Não foi possível desativar agora." }, { status: 500 });
  }
}
