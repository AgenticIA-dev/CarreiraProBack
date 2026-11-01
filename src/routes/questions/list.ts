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
  let auth;
  try {
    auth = await requireActiveApiUser(request);
  } catch (err) {
    console.error("[questions] Falha ao autenticar (banco indisponível?):", err);
    return fallbackResponse();
  }
  if (!auth) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const [questions, favorites] = await Promise.all([
      auth.db.getRepository(QuestionEntity).find({
        where: { is_published: true },
        order: { created_at: "ASC" },
      }),
      auth.db.getRepository(QuestionFavoriteEntity).findBy({ user_id: auth.userId }),
    ]);

    if (questions.length === 0) {
      console.warn("[questions] Nenhuma pergunta publicada no banco — rode `npm run seed` no backend.");
    }

    return Response.json({
      questions,
      favoriteIds: favorites.map((f) => f.question_id),
    });
  } catch (err) {
    console.error("[questions] Falha ao listar perguntas:", err);
    return fallbackResponse();
  }
}

/** Conteúdo semente em memória (favoritos desativados: ids não existem no banco). */
function fallbackResponse() {
  const now = new Date().toISOString();
  const fallback = questionsSeed.map((q, i) => ({
    id: `seed-${i}`,
    ...q,
    is_published: true,
    created_at: now,
    updated_at: now,
  }));
  return Response.json({ questions: fallback, favoriteIds: [], mock: true });
}
