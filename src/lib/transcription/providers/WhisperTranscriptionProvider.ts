import type { TranscriptionProvider, TranscriptionResult } from "../TranscriptionProvider";

/**
 * Transcrição real via API "OpenAI Audio Transcriptions".
 *
 * Modelo: `TRANSCRIPTION_PROVIDER_MODEL` (padrão `whisper-1`; também aceita
 * `gpt-4o-transcribe` / `gpt-4o-mini-transcribe`).
 *
 * Correções importantes:
 *  - A extensão do arquivo enviado segue o formato REAL do áudio. O Safari/
 *    iPhone grava em MP4/AAC; antes tudo ia como "audio.webm" e a OpenAI
 *    rejeitava o arquivo (formato inválido).
 *  - `language=pt` melhora muito a precisão em português.
 */
const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "video/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

export function extensionForMime(mimeType: string): string {
  const base = mimeType.split(";")[0]!.trim().toLowerCase();
  return EXTENSIONS[base] ?? "webm";
}

export class WhisperTranscriptionProvider implements TranscriptionProvider {
  readonly name = "whisper";

  constructor(
    private readonly apiKey: string,
    private readonly model: string = "whisper-1"
  ) {}

  async transcribe(audio: Blob | Buffer, mimeType: string): Promise<TranscriptionResult> {
    const baseMime = mimeType.split(";")[0]!.trim() || "audio/webm";
    const blob =
      audio instanceof Blob
        ? new Blob([await audio.arrayBuffer()], { type: baseMime })
        : new Blob([new Uint8Array(audio)], { type: baseMime });

    const form = new FormData();
    form.append("file", blob, `resposta.${extensionForMime(baseMime)}`);
    form.append("model", this.model);
    form.append("language", "pt");
    // Contexto ajuda o modelo com vocabulário de entrevistas.
    form.append("prompt", "Resposta de um candidato em entrevista de emprego, em português do Brasil.");
    // whisper-1 só devolve a duração no formato verbose_json.
    form.append("response_format", this.model === "whisper-1" ? "verbose_json" : "json");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`[transcription] OpenAI respondeu ${response.status}: ${detail.slice(0, 500)}`);
      throw new Error(`Provedor de transcrição respondeu com status ${response.status}.`);
    }

    const data = (await response.json()) as { text?: string; duration?: number };
    return {
      transcript: (data.text ?? "").trim(),
      durationSeconds: typeof data.duration === "number" ? Math.round(data.duration) : null,
      available: true,
    };
  }
}
