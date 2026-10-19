import { requireAdminApiUser } from "@/lib/auth/apiAuth";
import { QuestionEntity } from "@/lib/db/entities";

/**
 * Lista TODAS as perguntas (publicadas ou não) para a área administrativa.
 * Distinta de `GET /api/questions`, que só devolve perguntas publicadas
 * para o usuário final. Exige role "admin".
 */
export async function GET(request: Request) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
    return Response.json({ error: "Acesso restrito." }, { status: 403 });
  }

  try {
    const questions = await admin.db.getRepository(QuestionEntity).find({ order: { created_at: "DESC" } });
    return Response.json({ questions });
  } catch {
    return Response.json({ error: "Não foi possível carregar as perguntas agora." }, { status: 500 });
  }
}
