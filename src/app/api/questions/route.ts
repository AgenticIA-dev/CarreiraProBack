import { NextResponse, type NextRequest } from "next/server";
import { requireActiveApiUser } from "@/lib/supabase/apiAuth";
import { questionsSeed } from "@/data/questions.seed";

/**
 * Lista as perguntas publicadas. Requer sessão ativa (RLS garante isso no
 * banco também — esta rota é uma camada adicional de conveniência para o
 * cliente).
 *
 * Fallback: se o Supabase não estiver configurado neste ambiente (sem
 * credenciais), devolve o conteúdo semente local em memória, para que a
 * experiência de UI permaneça demonstrável.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireActiveApiUser(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data, error } = await auth.supabase
      .from("questions")
      .select("*")
      .eq("is_published", true)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const { data: favorites } = await auth.supabase
      .from("question_favorites")
      .select("question_id")
      .eq("user_id", auth.authId);

    return NextResponse.json({
      questions: data ?? [],
      favoriteIds: (favorites ?? []).map((f) => f.question_id),
    });
  } catch {
    // Supabase indisponível/não configurado: devolve o conteúdo semente para
    // que a interface continue navegável em ambiente de desenvolvimento.
    const fallback = questionsSeed.map((q, i) => ({
      id: `seed-${i}`,
      ...q,
      is_published: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    return NextResponse.json({ questions: fallback, favoriteIds: [], mock: true });
  }
}
