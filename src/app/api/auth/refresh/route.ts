import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAnonAuthClient, toSessionPayload } from "@/lib/supabase/authSession";

const bodySchema = z.object({ refresh_token: z.string().min(1) });

/**
 * Troca um refresh token por uma sessão nova (access + refresh token
 * rotacionados). Chamada pelo frontend quando o access token expira.
 */
export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 400 });
  }

  const supabase = createAnonAuthClient();
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: parsed.data.refresh_token,
  });

  if (error || !data.session) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  return NextResponse.json({ session: toSessionPayload(data.session) });
}
