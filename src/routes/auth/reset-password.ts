import { z } from "zod";
import { getDb } from "@/lib/db/dataSource";
import { UserEntity } from "@/lib/db/entities";
import { consumeLinkToken, revokeUserTokens } from "@/lib/auth/authTokens";
import { hashPassword } from "@/lib/auth/password";
import { resetPasswordSchema } from "@/lib/validation/schemas";

const tokenSchema = z.object({ token: z.string().min(1) });

const EXPIRED_LINK_MESSAGE =
  "Não foi possível redefinir sua senha. O link pode ter expirado — solicite um novo.";

/**
 * Define uma nova senha a partir do link de e-mail (recuperação de senha ou
 * convite pós-compra). O frontend lê o token do fragmento da URL do link
 * (`#token=`) e o envia aqui no corpo, junto com a nova senha.
 *
 * Não exige status "active": quem acabou de receber o convite ou está
 * recuperando a senha só precisa provar que é dono do e-mail (o token do
 * link) — o acesso aos dados continua bloqueado pelas demais rotas se o
 * status não for "active".
 *
 * O link é de uso único, e todas as sessões abertas são encerradas (se a
 * senha foi trocada por suspeita de invasão, quem invadiu perde o acesso).
 */
export async function POST(request: Request) {
  const json = await request.json().catch(() => null);

  const tokenParsed = tokenSchema.safeParse(json);
  if (!tokenParsed.success) {
    return Response.json({ error: EXPIRED_LINK_MESSAGE }, { status: 401 });
  }

  const parsed = resetPasswordSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Senha inválida." },
      { status: 400 }
    );
  }

  try {
    const passwordHash = await hashPassword(parsed.data.password);
    const db = await getDb();
    const ok = await db.transaction(async (manager) => {
      const userId = await consumeLinkToken(manager, tokenParsed.data.token);
      if (!userId) return false;
      await manager.getRepository(UserEntity).update({ id: userId }, { password_hash: passwordHash });
      await revokeUserTokens(manager, userId, ["refresh", "password_reset", "invite"]);
      return true;
    });

    if (!ok) {
      return Response.json({ error: EXPIRED_LINK_MESSAGE }, { status: 401 });
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Não foi possível redefinir sua senha agora. Tente novamente em instantes." },
      { status: 500 }
    );
  }
}
