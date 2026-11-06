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

    // Amostra grátis: só a 1ª pergunta de cada competência fica liberada; as
    // demais aparecem na lista (para mostrar o tamanho do banco), mas com
    // `locked: true` — o front-end bloqueia o acesso ao conteúdo dela.
    const questionsForResponse = auth.profile.is_trial ? markLockedByCategory(questions) : questions;

    return Response.json({
      questions: questionsForResponse,
      favoriteIds: favorites.map((f) => f.question_id),
    });
  } catch (err) {
    console.error("[questions] Falha ao listar perguntas:", err);
    return fallbackResponse();
  }
}

/** Marca como bloqueada toda pergunta além da 1ª de cada competência (ordem = `created_at ASC`). */
function markLockedByCategory<T extends { category: string }>(questions: T[]): (T & { locked: boolean })[] {
  const seenCategories = new Set<string>();
  return questions.map((q) => {
    const isFirstOfCategory = !seenCategories.has(q.category);
    if (isFirstOfCategory) seenCategories.add(q.category);
    return { ...q, locked: !isFirstOfCategory };
  });
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
