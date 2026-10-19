import { requireActiveApiUser } from "@/lib/auth/apiAuth";
import { StarResponseEntity } from "@/lib/db/entities";
import { getAIProvider } from "@/lib/ai";
import { starFormSchema } from "@/lib/validation/schemas";

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

  const json = await request.json().catch(() => null);
  const parsed = starFormSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Preencha ao menos um dos campos S/T/A/R antes de gerar.", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { situation, task, action, result, questionId } = parsed.data;

  try {
    const provider = getAIProvider();
    const output = await provider.generateStarResponse({ situation, task, action, result });

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

    return Response.json({ starResponse: saved, notes: output.notes });
  } catch {
    return Response.json(
      { error: "Não foi possível gerar sua resposta agora. Tente novamente em instantes." },
      { status: 502 }
    );
  }
}
