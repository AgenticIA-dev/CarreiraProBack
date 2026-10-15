import { NextResponse, type NextRequest } from "next/server";
import { requireActiveApiUser } from "@/lib/supabase/apiAuth";
import { calculateReadiness } from "@/lib/scoring/readiness";

/**
 * Calcula a "prontidão de treinamento" do usuário autenticado (métrica
 * interna — nunca uma previsão de contratação, PROMPT MESTRE §15, §58).
 *
 * Antes da separação em dois projetos, o dashboard (Server Component no
 * frontend) calculava isso diretamente a partir de uma leitura ao Supabase.
 * Agora quem lê `interview_sessions`/`star_responses` e aplica a fórmula é
 * este backend; o frontend só exibe o resultado.
 */
export async function GET(request: NextRequest) {
  const auth = await requireActiveApiUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const [{ data: sessions }, { data: starResponses }] = await Promise.all([
    auth.supabase
      .from("interview_sessions")
      .select("*")
      .eq("user_id", auth.authId)
      .eq("status", "completed"),
    auth.supabase.from("star_responses").select("*").eq("user_id", auth.authId),
  ]);

  const readiness = calculateReadiness({
    completedSessions: sessions ?? [],
    starResponses: starResponses ?? [],
  });

  return NextResponse.json({ readiness });
}
