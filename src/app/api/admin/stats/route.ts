import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiUser } from "@/lib/supabase/apiAuth";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";

/**
 * Contagens para a home do admin. Exige role "admin" (verificado contra o
 * banco, nunca por campo enviado pelo cliente). As contagens em si exigem a
 * service role porque cobrem todos os usuários/perguntas, não apenas os do
 * próprio chamador — RLS só libera cada usuário a ler sua própria linha em
 * `users`.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const service = createSupabaseServiceRoleClient();
  const [{ count: userCount }, { count: questionCount }] = await Promise.all([
    service.from("users").select("*", { count: "exact", head: true }),
    service.from("questions").select("*", { count: "exact", head: true }),
  ]);

  return NextResponse.json({ userCount: userCount ?? 0, questionCount: questionCount ?? 0 });
}
