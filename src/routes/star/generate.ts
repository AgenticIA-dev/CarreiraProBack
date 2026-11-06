import { requireActiveApiUser } from "@/lib/auth/apiAuth";
import { rateLimit } from "@/lib/security/rateLimit";
import { StarResponseEntity } from "@/lib/db/entities";
import { getAIProvider } from "@/lib/ai";
import type { StarOutput } from "@/lib/ai/AIProvider";
import { MockAIProvider } from "@/lib/ai/providers/MockAIProvider";
import { starFormSchema } from "@/lib/validation/schemas";
import { recordUsage, withUsageMeter } from "@/lib/usage/meter";

/**
 * Gera uma resposta estruturada pelo método STAR a partir do que o usuário
 * informou, e persiste o rascunho.
 *
 * Princípio anti-alucinação (PROMPT MESTRE §19): a IA (ou seu fallback
 * determinístico) nunca preenche lacunas com fatos inventados — apenas
 * organiza o que foi fornecido e sinaliza o que falta.
 */
export async function POST(request: Request) {
  const auth = await requireActiveApiUser(request);
  if (!auth) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  // Amostra grátis: pode ver a tela/explicação do STAR, mas gerar a resposta
  // é recurso pago.
  if (auth.profile.is_trial) {
    return Response.json(
      {
        error: "Gerar respostas pelo método STAR é um recurso exclusivo do plano pago. Assine o VoceUP para usar.",
        trialLimitReached: true,
      },
      { status: 403 }
    );
  }

  // Limite diário por usuário: protege o custo de IA/transcrição contra abuso.
  if (!rateLimit(`ai:star:${auth.userId}`, 30, 24 * 60 * 60 * 1000).allowed) {
    return Response.json(
      { error: "Você atingiu o limite diário de uso desta função. Tente novamente amanhã." },
      { status: 429 }
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = starFormSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      {
        error: parsed.error.issues[0]?.message ?? "Preencha Situação, Tarefa, Ação e Resultado antes de gerar.",
        issues: parsed.error.issues,
      },
      { status: 400 }
    );
  }

  const { situation, task, action, result, questionId, targetQuestion, targetRole } = parsed.data;
  const input = {
    situation,
    task,
    action,
    result,
    targetQuestion: targetQuestion ?? undefined,
    targetRole: targetRole ?? undefined,
  };

  try {
    const provider = getAIProvider();
    const { result: output, calls } = await withUsageMeter(async (): Promise<StarOutput> => {
      try {
        return await provider.generateStarResponse(input);
      } catch (err) {
        // IA externa indisponível/resposta inválida: usa a estruturação local.
        console.error(`[star] Provedor "${provider.name}" falhou; usando heurística local:`, err);
        return new MockAIProvider().generateStarResponse(input);
      }
    });
    await recordUsage(auth.db, { userId: auth.userId, kind: "star", request, calls });

    const repo = auth.db.getRepository(StarResponseEntity);
    const saved = await repo.save(
      repo.create({
        user_id: auth.userId,
        question_id: questionId ?? null,
        situation,
        task,
        action,
        result,
        generated_response: output.generatedResponse,
        ai_notes: output.notes,
      })
    );

    return Response.json({ starResponse: saved, notes: output.notes, analysis: output.analysis ?? null });
  } catch (err) {
    console.error("[star] Falha ao gerar/salvar resposta STAR:", err);
    return Response.json(
      { error: "Não foi possível gerar sua resposta agora. Tente novamente em instantes." },
      { status: 502 }
    );
  }
}
