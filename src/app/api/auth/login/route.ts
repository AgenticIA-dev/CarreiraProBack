import { NextResponse, type NextRequest } from "next/server";
import { createAnonAuthClient, toSessionPayload } from "@/lib/supabase/authSession";
import { rateLimit } from "@/lib/security/rateLimit";
import { loginSchema } from "@/lib/validation/schemas";

/**
 * Login por e-mail/senha. Devolve os tokens da sessão; quem os guarda
 * (cookies) é o frontend, no seu próprio domínio.
 *
 * O rate limit é por e-mail, não por IP: no fluxo normal esta rota é
 * chamada pelo servidor do frontend (não pelo navegador), então o IP visto
 * aqui seria o mesmo para todos os usuários.
 *
 * Não checa status/role — isso continua sendo feito em `/api/account/me` e
 * em cada rota de negócio. Login é só autenticação.
 */
export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const { allowed } = rateLimit(`auth:login:${email}`, 10, 5 * 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429 }
    );
  }

  const supabase = createAnonAuthClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (error || !data.session) {
    return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
  }

  return NextResponse.json({ session: toSessionPayload(data.session) });
}
