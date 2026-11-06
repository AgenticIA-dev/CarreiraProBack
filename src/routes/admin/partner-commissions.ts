import { z } from "zod";
import { requireAdminApiUser } from "@/lib/auth/apiAuth";
import { PartnerCommissionEntity, PartnerEntity, UserEntity } from "@/lib/db/entities";
import { createPayout } from "@/lib/mercadopago/payouts";

/**
 * Comissões calculadas por venda de parceiro (ver webhook do Mercado Pago,
 * `webhooks/mercadopago.ts`) — só admin.
 *
 *  GET  /api/admin/partner-commissions          → lista (filtro opcional ?partnerId=)
 *  POST /api/admin/partner-commissions/:id/pay  → paga uma comissão via Payouts API do Mercado Pago
 *
 * Pagamento é sempre manual: o admin revisa esta tela e decide quando pagar
 * cada comissão (não há disparo automático no aprovar do pagamento).
 */

export async function GET(request: Request) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
    return Response.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const partnerIdParam = new URL(request.url).searchParams.get("partnerId");
  const partnerIdCheck = partnerIdParam ? z.string().uuid().safeParse(partnerIdParam) : null;

  try {
    const qb = admin.db
      .getRepository(PartnerCommissionEntity)
      .createQueryBuilder("c")
      .leftJoin(PartnerEntity, "p", "p.id = c.partner_id")
      .leftJoin(UserEntity, "u", "u.id = c.user_id")
      .select([
        "c.id AS id",
        "c.partner_id AS partner_id",
        "c.user_id AS user_id",
        "c.purchase_id AS purchase_id",
        "c.sale_number AS sale_number",
        "c.percent_applied AS percent_applied",
        "c.amount_brl AS amount_brl",
        "c.status AS status",
        "c.paid_at AS paid_at",
        "c.created_at AS created_at",
        "p.name AS partner_name",
        "u.email AS user_email",
      ])
      .orderBy("c.created_at", "DESC")
      .limit(500);

    if (partnerIdCheck?.success) {
      qb.andWhere("c.partner_id = :partnerId", { partnerId: partnerIdCheck.data });
    }

    const commissions = await qb.getRawMany();
    return Response.json({ commissions });
  } catch (err) {
    console.error("[admin/partner-commissions] Falha ao listar:", err);
    return Response.json({ error: "Não foi possível carregar as comissões agora." }, { status: 500 });
  }
}

const payBodySchema = z.object({
  /** E-mail ou ID da conta Mercado Pago do parceiro, informado pelo admin na hora de pagar. */
  receiverId: z.string().trim().min(1, "Informe o e-mail ou ID da conta Mercado Pago do parceiro."),
});

export async function POST(request: Request, id: string) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
    return Response.json({ error: "Acesso restrito." }, { status: 403 });
  }
  const idCheck = z.string().uuid().safeParse(id);
  if (!idCheck.success) {
    return Response.json({ error: "Comissão não encontrada." }, { status: 404 });
  }

  const parsed = payBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Informe a conta Mercado Pago (e-mail ou ID) do parceiro para pagar esta comissão." },
      { status: 400 }
    );
  }

  try {
    const commissions = admin.db.getRepository(PartnerCommissionEntity);
    const commission = await commissions.findOneBy({ id: idCheck.data });
    if (!commission) {
      return Response.json({ error: "Comissão não encontrada." }, { status: 404 });
    }
    if (commission.status === "paid") {
      return Response.json({ error: "Essa comissão já foi paga." }, { status: 409 });
    }

    const payout = await createPayout({
      idempotencyKey: `commission:${commission.id}`,
      amount: Number(commission.amount_brl),
      receiverId: parsed.data.receiverId,
      externalReference: commission.id,
    });

    await commissions.update({ id: commission.id }, { status: "paid", paid_at: new Date() });

    return Response.json({ ok: true, payout });
  } catch (err) {
    console.error("[admin/partner-commissions] Falha ao pagar:", err);
    return Response.json({ error: "Não foi possível pagar essa comissão agora." }, { status: 500 });
  }
}
