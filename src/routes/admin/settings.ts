import { z } from "zod";
import { requireAdminApiUser } from "@/lib/auth/apiAuth";
import { CheckoutSettingsEntity } from "@/lib/db/entities";
import { getCheckoutConfig } from "@/lib/checkout/config";

/**
 * Preço, duração do acesso e título do produto — editáveis pelo Admin
 * (tabela `checkout_settings`, ver migration CheckoutSettingsAndCampaigns).
 * Reflete na hora na página /comprar (ela busca `GET /api/checkout/info` a
 * cada carregamento — não precisa de novo deploy).
 *
 *  GET /api/admin/settings  → valores salvos no banco (podem ser nulos, se o
 *                              admin nunca salvou) + o valor EFETIVO (já com
 *                              a variável de ambiente como respaldo) que a
 *                              loja está usando agora.
 *  PUT /api/admin/settings  → salva (cria a linha se ainda não existir).
 */

const updateSchema = z
  .object({
    priceBrl: z.number().positive().max(100000).optional(),
    accessLifetime: z.boolean().optional(),
    accessMonths: z.number().int().positive().max(120).nullable().optional(),
    title: z.string().trim().max(200).nullable().optional(),
  })
  .refine((d) => d.accessLifetime !== false || d.accessMonths !== null || d.accessMonths === undefined, {
    message: "Informe a duração do acesso em meses, ou marque vitalício.",
    path: ["accessMonths"],
  });

export async function GET(request: Request) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
    return Response.json({ error: "Acesso restrito." }, { status: 403 });
  }

  try {
    const rows = await admin.db.getRepository(CheckoutSettingsEntity).find({ order: { updated_at: "DESC" }, take: 1 });
    const row = rows[0] ?? null;
    const effective = await getCheckoutConfig(admin.db);

    return Response.json({
      settings: row
        ? {
            priceBrl: row.price_brl !== null ? Number(row.price_brl) : null,
            accessLifetime: row.access_lifetime,
            accessMonths: row.access_months,
            title: row.title,
          }
        : null,
      effective,
    });
  } catch (err) {
    console.error("[admin/settings] Falha ao carregar:", err);
    return Response.json({ error: "Não foi possível carregar as configurações agora." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
    return Response.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  const data = parsed.data;

  try {
    const repo = admin.db.getRepository(CheckoutSettingsEntity);
    const rows = await repo.find({ order: { updated_at: "DESC" }, take: 1 });
    const existing = rows[0] ?? null;

    const patch = {
      ...(data.priceBrl !== undefined ? { price_brl: data.priceBrl } : {}),
      ...(data.accessLifetime !== undefined ? { access_lifetime: data.accessLifetime } : {}),
      ...(data.accessMonths !== undefined ? { access_months: data.accessLifetime ? null : data.accessMonths } : {}),
      ...(data.title !== undefined ? { title: data.title } : {}),
      updated_at: new Date(),
    };

    if (existing) {
      await repo.update({ id: existing.id }, patch);
    } else {
      await repo.insert(patch);
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[admin/settings] Falha ao salvar:", err);
    return Response.json({ error: "Não foi possível salvar agora." }, { status: 500 });
  }
}
