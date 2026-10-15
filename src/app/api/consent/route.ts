import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getAuthenticatedUser } from "@/lib/supabase/apiAuth";

const bodySchema = z.object({
  necessary: z.literal(true),
  analytics: z.boolean(),
  marketing: z.boolean(),
  decidedAt: z.string(),
});

/**
 * Registra a decisão de consentimento de cookies para fins de auditoria
 * (LGPD/ANPD). Aceita tanto visitantes anônimos (banner de cookies aparece
 * antes de qualquer login) quanto usuários autenticados — o `Authorization:
 * Bearer` é opcional aqui, diferente das demais rotas deste backend.
 */
export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  try {
    // Autenticação opcional: se houver um token válido, associamos o
    // registro ao usuário; senão, fica como visitante anônimo.
    const auth = await getAuthenticatedUser(request);

    const service = createSupabaseServiceRoleClient();
    await service.from("consent_records").insert({
      user_id: auth?.authId ?? null,
      anonymous_id: auth ? null : request.headers.get("x-anonymous-id") ?? "unknown",
      necessary: true,
      analytics: parsed.data.analytics,
      marketing: parsed.data.marketing,
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Falha ao registrar não deve impedir a navegação do usuário; apenas
    // não confirma a auditoria. Não expõe detalhes internos na resposta.
    return NextResponse.json({ ok: false }, { status: 202 });
  }
}
