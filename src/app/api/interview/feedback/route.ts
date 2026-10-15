import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireActiveApiUser } from "@/lib/supabase/apiAuth";
import { getAIProvider } from "@/lib/ai";

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  question: z.string().min(1),
  transcript: z.string(), // pode ser vazio se a transcrição falhou e o usuário não digitou nada ainda
});

/**
 * Gera feedback e pontuação para a resposta do usuário.
 *
 * A pontuação é sempre uma métrica de qualidade de treinamento (estrutura,
 * clareza, objetividade, resultado) — nunca uma previsão de contratação
 * (PROMPT MESTRE §20-21, §58).
 */
export async function POST(request: NextRequest) {
  const auth = await requireActiveApiUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const { sessionId, question, transcript } = parsed.data;

  const { data: session } = await auth.supabase
    .from("interview_sessions")
    .select("id, user_id")
    .eq("id", sessionId)
    .single();

  if (!session || session.user_id !== auth.authId) {
    return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });
  }

  try {
    await auth.supabase.from("interview_sessions").update({ status: "scoring" }).eq("id", sessionId);

    const provider = getAIProvider();
    const evaluation = await provider.evaluateInterviewResponse({ question, transcript });

    const feedback = [
      evaluation.strengths.length > 0 ? `Pontos fortes: ${evaluation.strengths.join(" ")}` : null,
      evaluation.improvements.length > 0
        ? `Pontos a melhorar: ${evaluation.improvements.join(" ")}`
        : null,
      `Próxima ação recomendada: ${evaluation.nextAction}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const { data: updated, error } = await auth.supabase
      .from("interview_sessions")
      .update({
        transcript,
        score: evaluation.score,
        score_breakdown: evaluation.breakdown,
        feedback,
        status: "completed",
      })
      .eq("id", sessionId)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ session: updated, evaluation });
  } catch {
    await auth.supabase.from("interview_sessions").update({ status: "failed" }).eq("id", sessionId);
    return NextResponse.json(
      { error: "Não foi possível gerar o feedback agora. Tente novamente em instantes." },
      { status: 502 }
    );
  }
}
