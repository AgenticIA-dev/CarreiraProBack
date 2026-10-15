import { NextResponse, type NextRequest } from "next/server";
import { requireActiveApiUser } from "@/lib/supabase/apiAuth";
import { profileUpdateSchema } from "@/lib/validation/schemas";

/**
 * Atualiza o nome do usuário. Alteração de e-mail não é exposta por essa
 * rota (§46). Exige status "active" pelo mesmo motivo das demais rotas de
 * conta: no app original, só se chegava a esta tela depois do middleware já
 * ter confirmado isso; aqui a checagem precisa ser explícita, já que esta
 * API é alcançável diretamente.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireActiveApiUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = profileUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Nome inválido." }, { status: 400 });
  }

  const { error } = await auth.supabase
    .from("users")
    .update({ name: parsed.data.name })
    .eq("id", auth.authId);

  if (error) {
    return NextResponse.json({ error: "Não foi possível salvar agora." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
