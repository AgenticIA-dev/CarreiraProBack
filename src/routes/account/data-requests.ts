import { requireActiveApiUser } from "@/lib/auth/apiAuth";
import { DataRequestEntity } from "@/lib/db/entities";
import { dataRequestSchema } from "@/lib/validation/schemas";

/**
 * Solicitações do titular de dados: acesso, correção e eliminação
 * (LGPD art. 18 — PROMPT MESTRE §23, §46). Cria um registro para a equipe
 * tratar manualmente; este MVP não automatiza a exclusão total da conta,
 * pois isso depende de requisitos legais, financeiros e de auditoria
 * (PROMPT MESTRE §12) que devem ser avaliados por uma pessoa.
 */
export async function GET(request: Request) {
  const auth = await requireActiveApiUser(request);
  if (!auth) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const requests = await auth.db.getRepository(DataRequestEntity).find({
      where: { user_id: auth.userId },
      order: { created_at: "DESC" },
    });
    return Response.json({ requests });
  } catch {
    return Response.json({ error: "Não foi possível carregar suas solicitações." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireActiveApiUser(request);
  if (!auth) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = dataRequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Solicitação inválida." }, { status: 400 });
  }

  try {
    const repo = auth.db.getRepository(DataRequestEntity);
    const saved = await repo.save(
      repo.create({ user_id: auth.userId, type: parsed.data.type, details: parsed.data.details ?? null })
    );
    return Response.json({ request: saved });
  } catch {
    return Response.json({ error: "Não foi possível registrar sua solicitação agora." }, { status: 500 });
  }
}
