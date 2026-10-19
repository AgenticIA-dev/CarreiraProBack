import { requireActiveApiUser } from "@/lib/auth/apiAuth";
import { QuestionEntity, QuestionFavoriteEntity } from "@/lib/db/entities";
import { questionsSeed } from "@/data/questions.seed";

/**
 * Lista as perguntas publicadas e os favoritos do usuário. Requer sessão
 * ativa.
 *
 * Fallback: se o banco não estiver configurado/acessível neste ambiente,
 * devolve o conteúdo semente local em memória, para que a experiência de UI
 * permaneça demonstrável em desenvolvimento.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireActiveApiUser(request);
    if (!auth) {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }

    const [questions, favorites] = await Promise.all([
      auth.db.getRepository(QuestionEntity).find({
        where: { is_published: true },
        order: { created_at: "ASC" },
      }),
      auth.db.getRepository(QuestionFavoriteEntity).findBy({ user_id: auth.userId }),
    ]);

    return Response.json({
      questions,
      favoriteIds: favorites.map((f) => f.question_id),
    });
  } catch {
    const fallback = questionsSeed.map((q, i) => ({
      id: `seed-${i}`,
      ...q,
      is_published: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    return Response.json({ questions: fallback, favoriteIds: [], mock: true });
  }
}
