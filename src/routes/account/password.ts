import { requireActiveApiUser } from "@/lib/auth/apiAuth";
import { hashPassword } from "@/lib/auth/password";
import { UserEntity } from "@/lib/db/entities";
import { resetPasswordSchema } from "@/lib/validation/schemas";

/**
 * Altera a senha do usuário autenticado (fluxo autenticado, distinto da
 * recuperação por e-mail). As sessões abertas continuam válidas, como era
 * no Supabase Auth.
 */
export async function POST(request: Request) {
  const auth = await requireActiveApiUser(request);
  if (!auth) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Senha inválida." },
      { status: 400 }
    );
  }

  try {
    const passwordHash = await hashPassword(parsed.data.password);
    await auth.db.getRepository(UserEntity).update({ id: auth.userId }, { password_hash: passwordHash });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Não foi possível alterar sua senha agora." }, { status: 500 });
  }
}
