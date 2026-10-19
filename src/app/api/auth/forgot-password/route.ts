import { NextResponse, type NextRequest } from "next/server";
import { createAnonAuthClient, getPasswordSetupUrl } from "@/lib/supabase/authSession";
import { rateLimit } from "@/lib/security/rateLimit";
import { forgotPasswordSchema } from "@/lib/validation/schemas";

/**
 * Envia o e-mail de recuperação de senha (PROMPT MESTRE §45).
 *
 * A resposta é SEMPRE a mesma (200), exista ou não o e-mail, e mesmo em
 * erro técnico — para não revelar quais e-mails têm conta. O link do e-mail
 * leva para `/redefinir-senha` no frontend (URL montada aqui, nunca vinda
 * do cliente).
 */
export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const { allowed } = rateLimit(`auth:forgot:${email}`, 3, 15 * 60_000);
  if (allowed) {
    const supabase = createAnonAuthClient();
    await supabase.auth
      .resetPasswordForEmail(email, { redirectTo: getPasswordSetupUrl() })
      .catch(() => null);
  }

  return NextResponse.json({ ok: true });
}
