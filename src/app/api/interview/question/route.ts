import { NextResponse, type NextRequest } from "next/server";
import { requireActiveApiUser } from "@/lib/supabase/apiAuth";
import { getAIProvider } from "@/lib/ai";
import { questionsSeed } from "@/data/questions.seed";

/**
 * Seleciona a próxima pergunta do simulador e cria uma sessão de entrevista
 * em status "in_progress". A pergunta em si vem sempre do banco real (nunca
 * inventada pela IA — ver AIProvider.generateInterviewQuestion).
 */
export async function POST(request: NextRequest) {
  const auth = await requireActiveApiUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const { data: questions } = await auth.supabase
      .from("questions")
      .select("id, question, category")
      .eq("is_published", true);

    const pool =
      questions && questions.length > 0
        ? questions.map((q) => ({ questionId: q.id, question: q.question, category: q.category }))
        : questionsSeed.map((q, i) => ({
            questionId: `seed-${i}`,
            question: q.question,
            category: q.category,
          }));

    const provider = getAIProvider();
    const selected = await provider.generateInterviewQuestion(pool);

    const { data: session, error } = await auth.supabase
      .from("interview_sessions")
      .insert({
        user_id: auth.authId,
        question_id: selected.questionId.startsWith("seed-") ? null : selected.questionId,
        status: "in_progress",
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ session, question: selected });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível iniciar uma nova simulação agora. Tente novamente em instantes." },
      { status: 502 }
    );
  }
}
