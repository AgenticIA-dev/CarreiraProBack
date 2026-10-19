import { z } from "zod";
import { requireActiveApiUser } from "@/lib/auth/apiAuth";
import { InterviewSessionEntity } from "@/lib/db/entities";
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
export async function POST(request: Request) {
  const auth = await requireActiveApiUser(request);
  if (!auth) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Payload inválido." }, { status: 400 });
  }

  const { sessionId, question, transcript } = parsed.data;
  const sessions = auth.db.getRepository(InterviewSessionEntity);
  // Sempre filtrando pelo dono: um usuário nunca alcança a sessão de outro.
  const where = { id: sessionId, user_id: auth.userId };

  const session = await sessions.findOneBy(where);
  if (!session) {
    return Response.json({ error: "Sessão não encontrada." }, { status: 404 });
  }

  try {
    await sessions.update(where, { status: "scoring" });

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

    await sessions.update(where, {
      transcript,
      score: evaluation.score,
      score_breakdown: evaluation.breakdown,
      feedback,
      status: "completed",
    });
    const updated = await sessions.findOneByOrFail(where);

    return Response.json({ session: updated, evaluation });
  } catch {
    await sessions.update(where, { status: "failed" }).catch(() => null);
    return Response.json(
      { error: "Não foi possível gerar o feedback agora. Tente novamente em instantes." },
      { status: 502 }
    );
  }
}
