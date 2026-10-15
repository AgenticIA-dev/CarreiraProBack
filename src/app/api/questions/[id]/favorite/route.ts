import { NextResponse, type NextRequest } from "next/server";
import { requireActiveApiUser } from "@/lib/supabase/apiAuth";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireActiveApiUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { error } = await auth.supabase
    .from("question_favorites")
    .insert({ user_id: auth.authId, question_id: id });

  if (error && error.code !== "23505" /* já favoritada */) {
    return NextResponse.json({ error: "Não foi possível favoritar agora." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireActiveApiUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { error } = await auth.supabase
    .from("question_favorites")
    .delete()
    .eq("user_id", auth.authId)
    .eq("question_id", id);

  if (error) {
    return NextResponse.json({ error: "Não foi possível remover o favorito agora." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
