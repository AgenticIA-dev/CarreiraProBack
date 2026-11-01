import { z } from "zod";
import { requireActiveApiUser } from "@/lib/auth/apiAuth";
import { rateLimit } from "@/lib/security/rateLimit";
import { InterviewSessionEntity, QuestionEntity } from "@/lib/db/entities";
import { getAIProvider } from "@/lib/ai";
import type { EvaluateResponseOutput } from "@/lib/ai/AIProvider";
import { MockAIProvider } from "@/lib/ai/providers/MockAIProvider";

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  question: z.string().min(1),
  transcript: z.string().max(20000),
  /** Só usado quando a pergunta não está no banco (conteúdo local de fallback). */
  category: z.string().max(40).nullish(),
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

  // Limite diário por usuário: protege o custo de IA/transcrição contra abuso.
  if (!rateLimit(`ai:feedback:${auth.userId}`, 40, 24 * 60 * 60 * 1000).allowed) {
    return Response.json(
      { error: "Você atingiu o limite diário de uso desta função. Tente novamente amanhã." },
      { status: 429 }
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Payload inválido." }, { status: 400 });
  }

  const { sessionId, question } = parsed.data;
  const transcript = parsed.data.transcript.trim();
  if (transcript.split(/\s+/).filter(Boolean).length < 5) {
    return Response.json(
      { error: "Sua resposta está vazia ou curta demais para ser avaliada. Grave novamente ou complete o texto." },
      { status: 422 }
    );
  }
  const sessions = auth.db.getRepository(InterviewSessionEntity);
  // Sempre filtrando pelo dono: um usuário nunca alcança a sessão de outro.
  const where = { id: sessionId, user_id: auth.userId };

  const session = await sessions.findOneBy(where);
  if (!session) {
    return Response.json({ error: "Sessão não encontrada." }, { status: 404 });
  }

  // O contexto vem da pergunta salva no banco (fonte confiável); o que o
  // cliente envia só vale quando a sessão usou uma pergunta local de fallback.
  let category = parsed.data.category ?? null;
  if (session.question_id) {
    const q = await auth.db
      .getRepository(QuestionEntity)
      .findOne({ select: { id: true, category: true }, where: { id: session.question_id } })
      .catch(() => null);
    category = q?.category ?? category;
  }
  const context = category === "aumento_promocao" ? "aumento_promocao" : "entrevista";

  try {
    await sessions.update(where, { status: "scoring" });

    const provider = getAIProvider();
    let evaluation: EvaluateResponseOutput;
    try {
      evaluation = await provider.evaluateInterviewResponse({ question, transcript, context });
    } catch (err) {
      // IA externa fora do ar / resposta malformada: não deixa o usuário sem
      // feedback — usa a avaliação heurística local (marcada como tal).
      console.error(`[feedback] Provedor "${provider.name}" falhou; usando heurística local:`, err);
      evaluation = await new MockAIProvider().evaluateInterviewResponse({ question, transcript, context });
    }

    const feedback = formatFeedback(evaluation);

    await sessions.update(where, {
      transcript,
      score: evaluation.score,
      score_breakdown: evaluation.breakdown,
      feedback,
      status: "completed",
    });
    const updated = await sessions.findOneByOrFail(where);

    return Response.json({ session: updated, evaluation });
  } catch (err) {
    console.error("[feedback] Falha ao avaliar resposta:", err);
    await sessions.update(where, { status: "failed" }).catch(() => null);
    return Response.json(
      { error: "Não foi possível gerar o feedback agora. Tente novamente em instantes." },
      { status: 502 }
    );
  }
}

const CRITERIA_LABELS = {
  estrutura: "Estrutura",
  clareza: "Clareza",
  objetividade: "Objetividade",
  resultado: "Resultado",
} as const;

/**
 * Texto do feedback salvo na sessão (histórico). A UI usa o objeto
 * `evaluation.analysis` completo; este texto é a versão persistida/legível.
 */
function formatFeedback(evaluation: EvaluateResponseOutput): string {
  const a = evaluation.analysis;
  const blocks: string[] = [];
  const list = (title: string, items: string[]) =>
    items.length > 0 ? `${title}\n${items.map((i) => `• ${i}`).join("\n")}` : null;

  if (a?.verdict) blocks.push(`Parecer: ${a.verdict}`);
  if (a?.criteria?.length) {
    blocks.push(
      `Avaliação por critério\n${a.criteria
        .map((c) => `• ${CRITERIA_LABELS[c.key]} (${c.score}/25): ${c.justification}`)
        .join("\n")}`
    );
  }
  blocks.push(
    ...[
      list("Pontos fortes", evaluation.strengths),
      list("Pontos a melhorar", evaluation.improvements),
      a ? list("Sinais de senioridade", a.seniorSignals) : null,
      a ? list("Pontos de atenção", a.redFlags) : null,
    ].filter((b): b is string => Boolean(b))
  );
  if (a?.improvedAnswer) blocks.push(`Resposta reestruturada (complete os [colchetes])\n${a.improvedAnswer}`);
  if (a?.followUpQuestions?.length) blocks.push(list("Prepare-se para estas perguntas de aprofundamento", a.followUpQuestions)!);
  blocks.push(`Próxima ação recomendada: ${evaluation.nextAction}`);
  return blocks.join("\n\n");
}
