import { requireActiveApiUser } from "@/lib/auth/apiAuth";
import { getAudioProvider } from "@/lib/audio";
import { rateLimit } from "@/lib/security/rateLimit";
import { audioSpeakSchema } from "@/lib/validation/schemas";
import { recordUsage } from "@/lib/usage/meter";

/**
 * Texto-para-voz genérico, por usuário — usado para o resumo falado do
 * feedback da simulação (texto curto montado pelo frontend a partir da
 * avaliação). Diferente de `GET /api/questions/:id/audio/:kind`: aqui o
 * custo é por usuário/uso, então entra em `recordUsage` (kind "audio") e
 * tem limite diário.
 */
export async function POST(request: Request) {
  const auth = await requireActiveApiUser(request);
  if (!auth) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (!rateLimit(`audio:speak:${auth.userId}`, 40, 24 * 60 * 60 * 1000).allowed) {
    return Response.json(
      { error: "Você atingiu o limite diário de uso desta função. Tente novamente amanhã." },
      { status: 429 }
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = audioSpeakSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Payload inválido." }, { status: 400 });
  }

  const text = parsed.data.text;

  try {
    const provider = getAudioProvider();
    const result = await provider.synthesize(text);

    await recordUsage(auth.db, {
      userId: auth.userId,
      kind: "audio",
      request,
      audio: { provider: result.provider, model: result.model, characters: text.length },
    });

    return new Response(result.mp3, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(result.mp3.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[audio] Falha ao gerar resumo falado:", err);
    return Response.json({ error: "Não foi possível gerar o áudio agora. Tente novamente em instantes." }, { status: 502 });
  }
}
