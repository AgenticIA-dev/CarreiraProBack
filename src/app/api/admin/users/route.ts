import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiUser } from "@/lib/supabase/apiAuth";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";

/** Lista usuários para a área administrativa. Exige role "admin". */
export async function GET(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data: users, error } = await service
    .from("users")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: "Não foi possível carregar os usuários agora." }, { status: 500 });
  }

  return NextResponse.json({ users: users ?? [] });
}
