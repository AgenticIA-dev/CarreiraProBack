import { NextResponse, type NextRequest } from "next/server";
import { requireActiveApiUser } from "@/lib/supabase/apiAuth";
import { getTranscriptionProvider } from "@/lib/transcription";

export const runtime = "nodejs";

/**
 * Recebe o áudio gravado pelo usuário, envia para o provedor de transcrição
 * abstrato e salva o transcript na sessão. A API key do provedor nunca
 * trafega para o navegador — toda a chamada externa acontece aqui, no
 * servidor.
 */
export async function POST(request: NextRequest) {
  const auth = await requireActiveApiUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const sessionId = formData?.get("sessionId");
  const audio = formData?.get("audio");

  if (typeof sessionId !== "string" || !(audio instanceof Blob)) {
    return NextResponse.json({ error: "Áudio ou sessão inválidos." }, { status: 400 });
  }

  const { data: session } = await auth.supabase
    .from("interview_sessions")
    .select("id, user_id")
    .eq("id", sessionId)
    .single();

  if (!session || session.user_id !== auth.authId) {
    return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });
  }

  try {
    await auth.supabase
      .from("interview_sessions")
      .update({ status: "transcribing" })
      .eq("id", sessionId);

    const provider = getTranscriptionProvider();
    const result = await provider.transcribe(audio, audio.type || "audio/webm");

    const { data: updated, error } = await auth.supabase
      .from("interview_sessions")
      .update({
        transcript: result.transcript,
        audio_duration_seconds: result.durationSeconds,
        status: "in_progress",
      })
      .eq("id", sessionId)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ session: updated });
  } catch {
    await auth.supabase.from("interview_sessions").update({ status: "failed" }).eq("id", sessionId);
    return NextResponse.json(
      { error: "Não foi possível transcrever o áudio agora. Você pode digitar sua resposta manualmente." },
      { status: 502 }
    );
  }
}
