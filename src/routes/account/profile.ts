import { requireActiveApiUser } from "@/lib/auth/apiAuth";
import { UserEntity } from "@/lib/db/entities";
import { profileUpdateSchema } from "@/lib/validation/schemas";

/**
 * Atualiza o nome do usuário. Alteração de e-mail não é exposta por essa
 * rota (§46). Exige status "active" pelo mesmo motivo das demais rotas de
 * conta: esta API é alcançável diretamente, sem passar pelo middleware do
 * frontend. Só o campo `name` é gravado — status/role nunca vêm do cliente.
 */
export async function PATCH(request: Request) {
  const auth = await requireActiveApiUser(request);
  if (!auth) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = profileUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Nome inválido." }, { status: 400 });
  }

  try {
    await auth.db.getRepository(UserEntity).update({ id: auth.userId }, { name: parsed.data.name });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Não foi possível salvar agora." }, { status: 500 });
  }
}
