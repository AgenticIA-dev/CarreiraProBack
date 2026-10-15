import { NextResponse, type NextRequest } from "next/server";
import { requireActiveApiUser } from "@/lib/supabase/apiAuth";
import { resetPasswordSchema } from "@/lib/validation/schemas";

/**
 * Altera a senha do usuário autenticado (fluxo autenticado, distinto da
 * recuperação por e-mail).
 *
 * Chama a API REST do GoTrue (`PUT /auth/v1/user`) diretamente com o
 * access token do usuário, em vez de `supabase.auth.updateUser()`: esse
 * método do SDK depende de uma sessão (access + refresh token) guardada em
 * memória pelo cliente, e aqui só recebemos o access token (o refresh token
 * nunca saiu do navegador) — o endpoint REST aceita o access token sozinho
 * via `Authorization: Bearer`, exatamente como qualquer outra chamada
 * autenticada deste backend.
 */
export async function POST(request: NextRequest) {
  const auth = await requireActiveApiUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Senha inválida." },
      { status: 400 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "Não foi possível alterar sua senha agora." }, { status: 500 });
  }

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
    return NextResponse.json({ error: "Não foi possível alterar sua senha agora." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
