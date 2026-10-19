import { getAuthenticatedUser } from "@/lib/auth/apiAuth";

/**
 * Devolve o perfil (status/role) do usuário autenticado.
 *
 * Esta é a rota que o PROJETO FRONTEND chama para decidir autorização
 * (middleware de `/app` e `/admin`, e `requireUser`/`requireAdmin` nos
 * Server Components). O frontend não tem acesso ao banco: ele só guarda os
 * tokens da sessão e pede a este backend a verdade sobre o status/role.
 * Nunca confiamos em nada vindo do cliente: o status e o role aqui sempre
 * vêm de uma leitura fresca de `users` no banco (ver `getAuthenticatedUser`).
 */
export async function GET(request: Request) {
  let auth;
  try {
    auth = await getAuthenticatedUser(request);
  } catch {
    // Banco indisponível: 503 (não 401), para o frontend não tratar uma
    // falha temporária como sessão inválida e apagar os cookies.
    return Response.json({ error: "Serviço indisponível." }, { status: 503 });
  }
  if (!auth) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  return Response.json({ profile: auth.profile, email: auth.email });
}
