import { z } from "zod";
import { requireAdminApiUser } from "@/lib/auth/apiAuth";
import { CampaignEntity, PartnerEntity } from "@/lib/db/entities";

/**
 * Campanhas promocionais — só admin. Desconto independente do programa de
 * parceiros (sem comissão). `code` vazio = desconto automático (aplicado
 * direto no preço, sem precisar digitar nada); com código, funciona como
 * cupom (igual ao de parceiro). Nunca acumula com o cupom de parceiro nem
 * entre campanhas: vale sempre o maior desconto no momento da compra (ver
 * `checkout/create-preference.ts` e `lib/checkout/discount.ts`).
 *
 *  GET    /api/admin/campaigns      → lista
 *  POST   /api/admin/campaigns      → cria
 *  PATCH  /api/admin/campaigns/:id  → atualiza (inclusive reativar)
 *  DELETE /api/admin/campaigns/:id  → desativa; não apaga (preserva o
 *                                      histórico de vendas que a usaram)
 */

const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(3, "O código deve ter pelo menos 3 caracteres.")
  .max(40)
  .regex(/^[A-Z0-9_-]+$/, "O código só pode ter letras, números, - ou _.");

const dateSchema = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Data inválida.")
  .transform((v) => new Date(v));

const createSchema = z
  .object({
    code: codeSchema.nullable().optional(),
    discountPercent: z.number().int().min(1).max(100),
    startsAt: dateSchema.nullable().optional(),
    endsAt: dateSchema.nullable().optional(),
  })
  .refine((d) => !d.startsAt || !d.endsAt || d.endsAt > d.startsAt, {
    message: "A data final deve ser depois da inicial.",
    path: ["endsAt"],
  });

const updateSchema = z
  .object({
    code: codeSchema.nullable().optional(),
    discountPercent: z.number().int().min(1).max(100).optional(),
    active: z.boolean().optional(),
    startsAt: dateSchema.nullable().optional(),
    endsAt: dateSchema.nullable().optional(),
  })
  .refine((d) => !d.startsAt || !d.endsAt || d.endsAt > d.startsAt, {
    message: "A data final deve ser depois da inicial.",
    path: ["endsAt"],
  });

export async function GET(request: Request) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
    return Response.json({ error: "Acesso restrito." }, { status: 403 });
  }
  try {
    const campaigns = await admin.db.getRepository(CampaignEntity).find({ order: { created_at: "DESC" } });
    return Response.json({ campaigns });
  } catch (err) {
    console.error("[admin/campaigns] Falha ao listar:", err);
    return Response.json({ error: "Não foi possível carregar as campanhas agora." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
    return Response.json({ error: "Acesso restrito." }, { status: 403 });
  }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  const data = parsed.data;

  try {
    if (data.code) {
      const [takenByPartner, takenByCampaign] = await Promise.all([
        admin.db.getRepository(PartnerEntity).findOneBy({ coupon_code: data.code }),
        admin.db.getRepository(CampaignEntity).findOneBy({ code: data.code }),
      ]);
      if (takenByPartner || takenByCampaign) {
        return Response.json({ error: "Já existe um cupom/parceiro com esse código." }, { status: 409 });
      }
    }

    const campaigns = admin.db.getRepository(CampaignEntity);
    const campaign = await campaigns.save(
      campaigns.create({
        code: data.code ?? null,
        discount_percent: data.discountPercent,
        starts_at: data.startsAt ?? null,
        ends_at: data.endsAt ?? null,
      })
    );
    return Response.json({ ok: true, campaign });
  } catch (err) {
    console.error("[admin/campaigns] Falha ao criar:", err);
    return Response.json({ error: "Não foi possível criar a campanha agora." }, { status: 500 });
  }
}

export async function PATCH(request: Request, id: string) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
    return Response.json({ error: "Acesso restrito." }, { status: 403 });
  }
  const idCheck = z.string().uuid().safeParse(id);
  if (!idCheck.success) {
    return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
  }
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  const data = parsed.data;

  try {
    const campaigns = admin.db.getRepository(CampaignEntity);
    const campaign = await campaigns.findOneBy({ id: idCheck.data });
    if (!campaign) {
      return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
    }

    if (data.code !== undefined && data.code !== campaign.code && data.code) {
      const [takenByPartner, takenByCampaign] = await Promise.all([
        admin.db.getRepository(PartnerEntity).findOneBy({ coupon_code: data.code }),
        admin.db.getRepository(CampaignEntity).findOneBy({ code: data.code }),
      ]);
      if (takenByPartner || (takenByCampaign && takenByCampaign.id !== campaign.id)) {
        return Response.json({ error: "Já existe um cupom/parceiro com esse código." }, { status: 409 });
      }
    }

    await campaigns.update(
      { id: idCheck.data },
      {
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.discountPercent !== undefined ? { discount_percent: data.discountPercent } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(data.startsAt !== undefined ? { starts_at: data.startsAt } : {}),
        ...(data.endsAt !== undefined ? { ends_at: data.endsAt } : {}),
      }
    );
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[admin/campaigns] Falha ao atualizar:", err);
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
    // Desativa em vez de apagar: o desconto para de valer, mas o histórico de
    // vendas que usaram essa campanha é preservado.
    await admin.db.getRepository(CampaignEntity).update({ id: idCheck.data }, { active: false });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[admin/campaigns] Falha ao desativar:", err);
    return Response.json({ error: "Não foi possível desativar agora." }, { status: 500 });
  }
}
