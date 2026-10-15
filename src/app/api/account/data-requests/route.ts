import { NextResponse, type NextRequest } from "next/server";
import { requireActiveApiUser } from "@/lib/supabase/apiAuth";
import { dataRequestSchema } from "@/lib/validation/schemas";

/**
 * Solicitações do titular de dados: acesso, correção e eliminação
 * (LGPD art. 18 — PROMPT MESTRE §23, §46). Cria um registro para a equipe
 * tratar manualmente; este MVP não automatiza a exclusão total da conta,
 * pois isso depende de requisitos legais, financeiros e de auditoria
 * (PROMPT MESTRE §12) que devem ser avaliados por uma pessoa.
 */
export async function GET(request: NextRequest) {
  const auth = await requireActiveApiUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data, error } = await auth.supabase
    .from("data_requests")
    .select("*")
    .eq("user_id", auth.authId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Não foi possível carregar suas solicitações." }, { status: 500 });
  }

  return NextResponse.json({ requests: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireActiveApiUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = dataRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Solicitação inválida." }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("data_requests")
    .insert({ user_id: auth.authId, type: parsed.data.type, details: parsed.data.details ?? null })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Não foi possível registrar sua solicitação agora." }, { status: 500 });
  }

  return NextResponse.json({ request: data });
}
