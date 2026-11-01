import { z } from "zod";
import { requireActiveApiUser } from "@/lib/auth/apiAuth";
import { rateLimit } from "@/lib/security/rateLimit";
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

  // Limite diário por usuário: protege o custo de IA/transcrição contra abuso.
  if (!rateLimit(`ai:transcribe:${auth.userId}`, 40, 24 * 60 * 60 * 1000).allowed) {
    return Response.json(
      { error: "Você atingiu o limite diário de uso desta função. Tente novamente amanhã." },
      { status: 429 }
    );
  }

  const formData = await request.formData().catch(() => null);
  const sessionId = sessionIdSchema.safeParse(formData?.get("sessionId"));
  const audio = formData?.get("audio");

  if (!sessionId.success || !(audio instanceof Blob)) {
    return Response.json({ error: "Áudio ou sessão inválidos." }, { status: 400 });
  }
  if (audio.size < 1024) {
    // Menos de ~1 KB: gravação vazia (microfone mudo ou clique muito rápido).
    return Response.json(
      { error: "Não captamos áudio na gravação. Verifique o microfone e grave novamente." },
      { status: 422 }
    );
  }

  const sessions = auth.db.getRepository(InterviewSessionEntity);
  // Sempre filtrando pelo dono: um usuário nunca alcança a sessão de outro.
  const where = { id: sessionId.data, user_id: auth.userId };

  const session = await sessions.findOneBy(where);
  if (!session) {
    return Response.json({ error: "Sessão não encontrada." }, { status: 404 });
  }

  const provider = getTranscriptionProvider();
  try {
    await sessions.update(where, { status: "transcribing" });

    const result = await provider.transcribe(audio, audio.type || "audio/webm");
    const available = result.available !== false;

    await sessions.update(where, {
      // Sem transcrição real (mock), não grava nada: o texto virá do
      // reconhecimento de fala do navegador ou do que o usuário digitar.
      transcript: available ? result.transcript : session.transcript,
      audio_duration_seconds: result.durationSeconds,
      status: "in_progress",
    });
    const updated = await sessions.findOneByOrFail(where);

    return Response.json({
      session: updated,
      transcriptionAvailable: available,
      provider: provider.name,
    });
  } catch (err) {
    console.error(`[transcribe] Falha (${provider.name}, ${audio.type}, ${audio.size} bytes):`, err);
    await sessions.update(where, { status: "in_progress" }).catch(() => null);
    return Response.json(
      { error: "Não foi possível transcrever o áudio agora. Você pode revisar ou digitar sua resposta." },
      { status: 502 }
    );
  }
}
