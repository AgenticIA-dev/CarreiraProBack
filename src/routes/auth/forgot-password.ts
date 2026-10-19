import { getDb } from "@/lib/db/dataSource";
import { UserEntity } from "@/lib/db/entities";
import { createAuthToken, revokeUserTokens } from "@/lib/auth/authTokens";
import { buildPasswordSetupUrl } from "@/lib/auth/session";
import { passwordResetEmail, sendEmail } from "@/lib/email/mailer";
import { rateLimit } from "@/lib/security/rateLimit";
import { forgotPasswordSchema } from "@/lib/validation/schemas";

/**
 * Envia o e-mail de recuperação de senha (PROMPT MESTRE §45).
 *
 * A resposta é SEMPRE a mesma (200), exista ou não o e-mail, e mesmo em
 * erro técnico — para não revelar quais e-mails têm conta. O link do e-mail
 * leva para `/redefinir-senha` no frontend (URL montada aqui, nunca vinda
 * do cliente). Pedir um link novo invalida os anteriores.
 *
 * Também serve para quem comprou mas perdeu o link do convite (ou ele
 * expirou): o usuário já existe (criado pelo webhook), só não tem senha.
 */
export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const { allowed } = rateLimit(`auth:forgot:${email}`, 3, 15 * 60_000);
  if (allowed) {
    try {
      const db = await getDb();
      const user = await db.getRepository(UserEntity).findOneBy({ email });
      if (user) {
        await revokeUserTokens(db, user.id, ["password_reset"]);
        const token = await createAuthToken(db, user.id, "password_reset");
        await sendEmail(passwordResetEmail(user.email, buildPasswordSetupUrl(token)));
      }
    } catch (err) {
      console.error("Falha ao enviar e-mail de recuperação de senha:", err);
    }
  }

  return Response.json({ ok: true });
}
