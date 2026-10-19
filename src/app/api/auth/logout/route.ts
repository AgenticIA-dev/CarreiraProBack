import { NextResponse, type NextRequest } from "next/server";
import { getAnonConfig, getAuthenticatedUser } from "@/lib/supabase/apiAuth";

/**
 * Encerra a sessão do usuário no Supabase Auth (revoga o refresh token),
 * para que os tokens não possam mais ser renovados mesmo que tenham vazado.
 *
 * Usa a API REST do GoTrue (`POST /auth/v1/logout`) com o access token, pelo
 * mesmo motivo de `/api/account/password`: o SDK depende de uma sessão em
 * memória que este backend não mantém.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) {
    // Já não há sessão válida — nada a revogar.
    return NextResponse.json({ ok: true });
  }

  const { url, anonKey } = getAnonConfig();
  await fetch(`${url}/auth/v1/logout`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${auth.accessToken}` },
  }).catch(() => null);

  return NextResponse.json({ ok: true });
}
