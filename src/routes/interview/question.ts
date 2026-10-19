import { requireActiveApiUser } from "@/lib/auth/apiAuth";
import { InterviewSessionEntity, QuestionEntity } from "@/lib/db/entities";
import { getAIProvider } from "@/lib/ai";
import { questionsSeed } from "@/data/questions.seed";

/**
 * Seleciona a próxima pergunta do simulador e cria uma sessão de entrevista
 * em status "in_progress". A pergunta em si vem sempre do banco real (nunca
 * inventada pela IA — ver AIProvider.generateInterviewQuestion).
 */
export async function POST(request: Request) {
  const auth = await requireActiveApiUser(request);
  if (!auth) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const questions = await auth.db.getRepository(QuestionEntity).find({
      select: { id: true, question: true, category: true },
      where: { is_published: true },
    });

    const pool =
      questions.length > 0
        ? questions.map((q) => ({ questionId: q.id, question: q.question, category: q.category }))
        : questionsSeed.map((q, i) => ({
            questionId: `seed-${i}`,
            question: q.question,
            category: q.category,
          }));

    const provider = getAIProvider();
    const selected = await provider.generateInterviewQuestion(pool);

    const sessions = auth.db.getRepository(InterviewSessionEntity);
    const session = await sessions.save(
      sessions.create({
        user_id: auth.userId,
        question_id: selected.questionId.startsWith("seed-") ? null : selected.questionId,
        status: "in_progress",
      })
    );

    return Response.json({ session, question: selected });
  } catch {
    return Response.json(
      { error: "Não foi possível iniciar uma nova simulação agora. Tente novamente em instantes." },
      { status: 502 }
    );
  }
}
