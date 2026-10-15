import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/apiAuth";

/**
 * Devolve o perfil (status/role) do usuário autenticado.
 *
 * Esta é a rota que o PROJETO FRONTEND chama para decidir autorização
 * (middleware de `/app` e `/admin`, e `requireUser`/`requireAdmin` nos
 * Server Components) agora que os dois projetos são deploys separados: o
 * frontend não tem mais acesso direto ao Postgres nem à service role key —
 * ele só sabe que existe uma sessão Supabase (cookie) e pede a este backend
 * a verdade sobre o status/role, exatamente como antes fazia consultando a
 * tabela diretamente. Nunca confiamos em nada vindo do cliente: o status e
 * o role aqui sempre vêm de uma leitura fresca de `public.users` no banco.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data: profile, error } = await auth.supabase
    .from("users")
    .select("*")
    .eq("id", auth.authId)
    .single();

  if (error || !profile) {
    return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    profile,
    email: auth.email || profile.email,
  });
}
