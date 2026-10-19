import { NextResponse, type NextRequest } from "next/server";
import { getAnonConfig, getAuthenticatedUser } from "@/lib/supabase/apiAuth";
import { resetPasswordSchema } from "@/lib/validation/schemas";

/**
 * Define uma nova senha a partir do link de e-mail (recuperação de senha ou
 * convite pós-compra). O frontend recebe o access token temporário no
 * fragmento da URL do link e o envia aqui como `Authorization: Bearer`.
 *
 * Diferente de `/api/account/password`, não exige status "active": quem
 * acabou de receber o convite ou está recuperando a senha só precisa provar
 * que é dono do e-mail (o token do link) — o acesso aos dados continua
 * bloqueado pelas demais rotas se o status não for "active".
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) {
    return NextResponse.json(
      { error: "O link pode ter expirado — solicite um novo." },
      { status: 401 }
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Senha inválida." },
      { status: 400 }
    );
  }

  const { url, anonKey } = getAnonConfig();
  const response = await fetch(`${url}/auth/v1/user`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${auth.accessToken}`,
    },
    body: JSON.stringify({ password: parsed.data.password }),
  }).catch(() => null);

  if (!response || !response.ok) {
    return NextResponse.json(
      { error: "Não foi possível redefinir sua senha. O link pode ter expirado — solicite um novo." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
