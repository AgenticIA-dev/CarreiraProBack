import { z } from "zod";
import { getDb } from "@/lib/db/dataSource";
import { PartnerEntity, PurchaseEntity, UserEntity } from "@/lib/db/entities";
import { createAuthToken } from "@/lib/auth/authTokens";
import { buildPasswordSetupUrl } from "@/lib/auth/session";
import { sendEmail, trialSignupEmail } from "@/lib/email/mailer";
import { getClientIp, rateLimit } from "@/lib/security/rateLimit";

/**
 * Cadastro público da amostra grátis, a partir do link que o parceiro
 * divulga (página `/amostra/:codigo` no frontend → esta rota).
 *
 *  POST /api/trial/signup  { code, email, name? }
 *
 * Cria acesso restrito (1 dia, `is_trial: true`, vinculado ao parceiro do
 * cupom) e envia o convite para criar a senha. Diferente do testador do
 * Admin (`admin/testers.ts`, acesso completo por N dias, feito pelo admin):
 * este é autoatendido pelo visitante e sempre amarrado a um parceiro ativo,
 * e nunca é concedido duas vezes para o mesmo e-mail.
 *
 * Restrições do acesso de amostra (aplicadas nas rotas de produto, não
 * aqui): 1 simulação (`interview/question.ts`), STAR bloqueado
 * (`star/generate.ts`), 1 pergunta liberada por competência no banco
 * (`questions/list.ts`) — todas lidas de `users.is_trial`.
 */

const TRIAL_ACCESS_DAYS = 1;
const DAY = 24 * 60 * 60 * 1000;

const bodySchema = z.object({
  code: z.string().trim().toUpperCase().max(40),
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(254),
  name: z.string().trim().max(120).optional().nullable(),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  if (!rateLimit(`trial:signup:${ip}`, 10, 60 * 60 * 1000).allowed) {
    return Response.json(
      { error: "Muitas tentativas. Aguarde um instante e tente novamente." },
      { status: 429 }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });
  }
  const { code, email } = parsed.data;
  const name = parsed.data.name || null;

  try {
    const db = await getDb();
    const partner = await db.getRepository(PartnerEntity).findOneBy({ coupon_code: code, active: true });
    if (!partner) {
      return Response.json({ error: "Link de amostra grátis inválido ou expirado." }, { status: 404 });
    }

    const users = db.getRepository(UserEntity);
    const existing = await users.findOneBy({ email });
    const expiresAt = new Date(Date.now() + TRIAL_ACCESS_DAYS * DAY);
    let userId: string;

    if (existing) {
      if (existing.role === "admin") {
        return Response.json({ error: "Esse e-mail é de um administrador." }, { status: 409 });
      }
      if (existing.is_trial || existing.is_courtesy) {
        return Response.json(
          { error: "Esse e-mail já usou uma amostra grátis. Assine o VoceUP para continuar." },
          { status: 409 }
        );
      }
      const paid = await db.getRepository(PurchaseEntity).existsBy({ user_id: existing.id, status: "approved" });
      if (paid) {
        return Response.json(
          { error: 'Esse e-mail já tem uma conta no VoceUP. Faça login ou use "Esqueci minha senha".' },
          { status: 409 }
        );
      }
      if (existing.status === "blocked" || existing.status === "refunded") {
        return Response.json(
          { error: "Não foi possível liberar a amostra grátis para esse e-mail." },
          { status: 409 }
        );
      }

      await users.update(
        { id: existing.id },
        {
          status: "active",
          is_trial: true,
          access_expires_at: expiresAt,
          referred_by_partner_id: partner.id,
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
          is_trial: true,
          access_expires_at: expiresAt,
          referred_by_partner_id: partner.id,
        })
      );
      userId = created.id;
    }

    let emailSent = true;
    try {
      const token = await createAuthToken(db, userId, "invite");
      await sendEmail(trialSignupEmail(email, buildPasswordSetupUrl(token), TRIAL_ACCESS_DAYS, partner.name));
    } catch (err) {
      emailSent = false;
      console.error(`[trial/signup] Falha ao enviar convite para ${userId}:`, err);
    }

    return Response.json({ ok: true, email, days: TRIAL_ACCESS_DAYS, emailSent });
  } catch (err) {
    console.error("[trial/signup] Falha ao cadastrar amostra grátis:", err);
    return Response.json({ error: "Não foi possível liberar a amostra grátis agora." }, { status: 500 });
  }
}
