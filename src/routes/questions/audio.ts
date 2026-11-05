import { requireActiveApiUser } from "@/lib/auth/apiAuth";
import { getAudioProvider } from "@/lib/audio";
import { QuestionAudioEntity, QuestionEntity } from "@/lib/db/entities";
import type { QuestionAudioKind } from "@/types/database";

/**
 * Áudio (texto-para-voz) da pergunta ou da estrutura de resposta ideal.
 *
 * Gerado uma única vez por pergunta e guardado em `question_audio`
 * (custo de plataforma, não por usuário) — não passa por `recordUsage`.
 * Qualquer usuário autenticado pode pedir o áudio de qualquer pergunta
 * publicada, assim como já ocorre com `GET /api/questions`.
 */
export async function GET(request: Request, questionId: string, kind: string) {
  const auth = await requireActiveApiUser(request);
  if (!auth) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (kind !== "question" && kind !== "ideal") {
    return Response.json({ error: "Tipo de áudio inválido." }, { status: 400 });
  }
  const audioKind = kind as QuestionAudioKind;

  const question = await auth.db.getRepository(QuestionEntity).findOneBy({ id: questionId });
  if (!question) {
    return Response.json({ error: "Pergunta não encontrada." }, { status: 404 });
  }

  const text = audioKind === "question" ? question.question : question.ideal_structure;
  if (!text || !text.trim()) {
    return Response.json({ error: "Esta pergunta não tem esse conteúdo para converter em áudio." }, { status: 404 });
  }

  const cache = auth.db.getRepository(QuestionAudioEntity);
  const where = { question_id: questionId, kind: audioKind };

  const cached = await cache.findOneBy(where);
  if (cached) {
    return mp3Response(cached.mp3);
  }

  try {
    const provider = getAudioProvider();
    const result = await provider.synthesize(text);
    await cache.insert({
      question_id: questionId,
      kind: audioKind,
      mp3: result.mp3,
      voice: result.voice,
      provider: result.provider,
      model: result.model,
    });
    return mp3Response(result.mp3);
  } catch (err) {
    // Corrida: outra requisição já gerou e salvou entre o findOneBy e o insert.
    const existing = await cache.findOneBy(where).catch(() => null);
    if (existing) {
      return mp3Response(existing.mp3);
    }
    console.error(`[audio] Falha ao gerar áudio da pergunta ${questionId}/${audioKind}:`, err);
    return Response.json({ error: "Não foi possível gerar o áudio agora. Tente novamente em instantes." }, { status: 502 });
  }
}

function mp3Response(mp3: Buffer): Response {
  return new Response(mp3, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(mp3.length),
      // Conteúdo gerado uma vez e imutável (nova pergunta = nova linha no banco).
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
