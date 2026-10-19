import { requireActiveApiUser } from "@/lib/auth/apiAuth";
import { InterviewSessionEntity, StarResponseEntity } from "@/lib/db/entities";
import { calculateReadiness } from "@/lib/scoring/readiness";

/**
 * Calcula a "prontidão de treinamento" do usuário autenticado (métrica
 * interna — nunca uma previsão de contratação, PROMPT MESTRE §15, §58).
 * Quem lê `interview_sessions`/`star_responses` e aplica a fórmula é este
 * backend; o frontend só exibe o resultado.
 */
export async function GET(request: Request) {
  const auth = await requireActiveApiUser(request);
  if (!auth) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const [completedSessions, starResponses] = await Promise.all([
      auth.db
        .getRepository(InterviewSessionEntity)
        .findBy({ user_id: auth.userId, status: "completed" }),
      auth.db.getRepository(StarResponseEntity).findBy({ user_id: auth.userId }),
    ]);

    return Response.json({ readiness: calculateReadiness({ completedSessions, starResponses }) });
  } catch {
    return Response.json({ error: "Não foi possível calcular sua prontidão agora." }, { status: 500 });
  }
}
