import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiUser } from "@/lib/supabase/apiAuth";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";

/**
 * Lista TODAS as perguntas (publicadas ou não) para a área administrativa.
 * Distinta de `GET /api/questions`, que só devolve perguntas publicadas
 * para o usuário final. Exige role "admin".
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data: questions, error } = await service
    .from("questions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Não foi possível carregar as perguntas agora." }, { status: 500 });
  }

  return NextResponse.json({ questions: questions ?? [] });
}
