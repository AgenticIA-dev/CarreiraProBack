import { NextResponse, type NextRequest } from "next/server";
import { requireActiveApiUser } from "@/lib/supabase/apiAuth";
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
export async function POST(request: NextRequest) {
  const auth = await requireActiveApiUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = starFormSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Preencha ao menos um dos campos S/T/A/R antes de gerar.", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { situation, task, action, result, questionId } = parsed.data;

  try {
    const provider = getAIProvider();
    const output = await provider.generateStarResponse({ situation, task, action, result });

    const { data: saved, error } = await auth.supabase
      .from("star_responses")
      .insert({
        user_id: auth.authId,
        question_id: questionId ?? null,
        situation,
        task,
        action,
        result,
        generated_response: output.generatedResponse,
        ai_notes: output.notes,
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ starResponse: saved, notes: output.notes });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível gerar sua resposta agora. Tente novamente em instantes." },
      { status: 502 }
    );
  }
}
