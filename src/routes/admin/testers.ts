import { z } from "zod";
import { requireAdminApiUser } from "@/lib/auth/apiAuth";
import { createAuthToken } from "@/lib/auth/authTokens";
import { buildPasswordSetupUrl } from "@/lib/auth/session";
import { PurchaseEntity, UserEntity } from "@/lib/db/entities";
import { sendEmail, testerInviteEmail } from "@/lib/email/mailer";

/**
 * Testadores (acesso de cortesia, sem pagamento) — só admin.
 *
 *  GET  /api/admin/testers  → lista quem tem ou teve cortesia
 *  POST /api/admin/testers  → { email, name?, days? } cria (ou renova) o acesso
 *                             de cortesia e envia o convite para criar a senha
 *
 * Padrão: 7 dias (TESTER_ACCESS_DAYS). Clientes pagantes não são alterados.
 */

const DAY = 24 * 60 * 60 * 1000;

function defaultDays(): number {
  const n = Number(process.env.TESTER_ACCESS_DAYS ?? 7);
  return Number.isInteger(n) && n >= 1 && n <= 90 ? n : 7;
}

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().max(120).optional().nullable(),
  days: z.number().int().min(1).max(90).optional(),
});

export async function GET(request: Request) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
    return Response.json({ error: "Acesso restrito." }, { status: 403 });
  }
  try {
    const testers = await admin.db.getRepository(UserEntity).find({
      where: { is_courtesy: true },
      order: { courtesy_granted_at: "DESC" },
      take: 500,
    });
    return Response.json({ testers, defaultDays: defaultDays() });
  } catch (err) {
    console.error("[admin/testers] Falha ao listar:", err);
    return Response.json({ error: "Não foi possível carregar os testadores agora." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
    return Response.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Informe um e-mail válido (e, se quiser, o nome e os dias de acesso)." }, { status: 400 });
  }
  const { email } = parsed.data;
  const name = parsed.data.name || null;
  const days = parsed.data.days ?? defaultDays();
  const expiresAt = new Date(Date.now() + days * DAY);

  try {
    const users = admin.db.getRepository(UserEntity);
    const existing = await users.findOneBy({ email });
    let userId: string;

    if (existing) {
      if (existing.role === "admin") {
        return Response.json({ error: "Esse e-mail é de um administrador." }, { status: 409 });
      }
      const paid = await admin.db
        .getRepository(PurchaseEntity)
        .existsBy({ user_id: existing.id, status: "approved" });
      if (paid && !existing.is_courtesy) {
        return Response.json(
          { error: "Esse e-mail já é de um cliente pagante. O acesso dele não foi alterado." },
          { status: 409 }
        );
      }
      if (existing.status === "blocked" || existing.status === "refunded") {
        return Response.json(
          { error: `Esse usuário está "${existing.status}" (reembolso ou chargeback). Não liberei cortesia.` },
          { status: 409 }
        );
      }
      await users.update(
        { id: existing.id },
        {
          status: "active",
          is_courtesy: true,
          courtesy_granted_at: new Date(),
          access_expires_at: expiresAt,
          ...(name && !existing.name ? { name } : {}),
        }
      );
      userId = existing.id;
    } else {
      const created = await users.save(
        users.create({
          email,
          name,
          status: "active",
          role: "user",
          is_courtesy: true,
          courtesy_granted_at: new Date(),
          access_expires_at: expiresAt,
        })
      );
      userId = created.id;
    }

    // Convite para criar a senha (também serve para quem já tinha conta).
    let emailSent = true;
    try {
      const token = await createAuthToken(admin.db, userId, "invite");
      await sendEmail(testerInviteEmail(email, buildPasswordSetupUrl(token), days, name));
    } catch (err) {
      emailSent = false;
      console.error(`[admin/testers] Falha ao enviar convite para ${userId}:`, err);
    }

    return Response.json({
      ok: true,
      email,
      days,
      accessExpiresAt: expiresAt.toISOString(),
      renewed: Boolean(existing),
      emailSent,
    });
  } catch (err) {
    console.error("[admin/testers] Falha ao convidar:", err);
    return Response.json({ error: "Não foi possível liberar o acesso agora." }, { status: 500 });
  }
}
