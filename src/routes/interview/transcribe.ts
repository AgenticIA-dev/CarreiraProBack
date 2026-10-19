import { z } from "zod";
import { requireActiveApiUser } from "@/lib/auth/apiAuth";
import { InterviewSessionEntity } from "@/lib/db/entities";
import { getTranscriptionProvider } from "@/lib/transcription";

const sessionIdSchema = z.string().uuid();

/**
 * Recebe o áudio gravado pelo usuário, envia para o provedor de transcrição
 * abstrato e salva o transcript na sessão. A API key do provedor nunca
 * trafega para o navegador — toda a chamada externa acontece aqui, no
 * servidor.
 */
export async function POST(request: Request) {
  const auth = await requireActiveApiUser(request);
  if (!auth) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const sessionId = sessionIdSchema.safeParse(formData?.get("sessionId"));
  const audio = formData?.get("audio");

  if (!sessionId.success || !(audio instanceof Blob)) {
    return Response.json({ error: "Áudio ou sessão inválidos." }, { status: 400 });
  }

  const sessions = auth.db.getRepository(InterviewSessionEntity);
  // Sempre filtrando pelo dono: um usuário nunca alcança a sessão de outro.
  const where = { id: sessionId.data, user_id: auth.userId };

  const session = await sessions.findOneBy(where);
  if (!session) {
    return Response.json({ error: "Sessão não encontrada." }, { status: 404 });
  }

  try {
    await sessions.update(where, { status: "transcribing" });

    const provider = getTranscriptionProvider();
    const result = await provider.transcribe(audio, audio.type || "audio/webm");

    await sessions.update(where, {
      transcript: result.transcript,
      audio_duration_seconds: result.durationSeconds,
      status: "in_progress",
    });
    const updated = await sessions.findOneByOrFail(where);

    return Response.json({ session: updated });
  } catch {
    await sessions.update(where, { status: "failed" }).catch(() => null);
    return Response.json(
      { error: "Não foi possível transcrever o áudio agora. Você pode digitar sua resposta manualmente." },
      { status: 502 }
    );
  }
}
