import { getAuthenticatedUser } from "@/lib/auth/apiAuth";
import { revokeUserTokens } from "@/lib/auth/authTokens";

/**
 * Encerra as sessões do usuário revogando todos os seus refresh tokens
 * (mesmo comportamento padrão do Supabase Auth, escopo "global"), para que
 * não possam mais ser renovados mesmo que tenham vazado. O access token
 * atual continua válido até expirar (no máximo 1 hora).
 */
export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth) {
      await revokeUserTokens(auth.db, auth.userId, ["refresh"]);
    }
  } catch {
    // Ignorado: o frontend apaga os cookies de qualquer forma.
  }
  return Response.json({ ok: true });
}
