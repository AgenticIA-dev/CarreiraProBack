import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/apiAuth";
import { getDb } from "@/lib/db/dataSource";
import { ConsentRecordEntity } from "@/lib/db/entities";

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
export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Payload inválido." }, { status: 400 });
  }

  try {
    // Autenticação opcional: se houver um token válido, associamos o
    // registro ao usuário; senão, fica como visitante anônimo.
    const auth = await getAuthenticatedUser(request);

    const db = await getDb();
    await db.getRepository(ConsentRecordEntity).insert({
      user_id: auth?.userId ?? null,
      anonymous_id: auth ? null : (request.headers.get("x-anonymous-id") ?? "unknown"),
      necessary: true,
      analytics: parsed.data.analytics,
      marketing: parsed.data.marketing,
    });

    return Response.json({ ok: true });
  } catch {
    // Falha ao registrar não deve impedir a navegação do usuário; apenas
    // não confirma a auditoria. Não expõe detalhes internos na resposta.
    return Response.json({ ok: false }, { status: 202 });
  }
}
