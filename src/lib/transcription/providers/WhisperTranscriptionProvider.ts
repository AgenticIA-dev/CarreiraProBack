import type { TranscriptionProvider, TranscriptionResult } from "../TranscriptionProvider";

/**
 * Implementação real via API de transcrição compatível com o formato
 * "OpenAI Audio Transcriptions" (ex.: whisper-1 / gpt-4o-transcribe).
 *
 * PENDENTE DE CREDENCIAIS: só é instanciada quando
 * `TRANSCRIPTION_PROVIDER_API_KEY` está definido.
 */
export class WhisperTranscriptionProvider implements TranscriptionProvider {
  readonly name = "whisper";

  constructor(private readonly apiKey: string) {}

  async transcribe(audio: Blob | Buffer, mimeType: string): Promise<TranscriptionResult> {
    const form = new FormData();
    const blob =
      audio instanceof Blob ? audio : new Blob([new Uint8Array(audio)], { type: mimeType });
    form.append("file", blob, "audio.webm");
    form.append("model", "whisper-1");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });

    if (!response.ok) {
      throw new Error(`Provedor de transcrição respondeu com status ${response.status}.`);
    }

    const data = (await response.json()) as { text: string; duration?: number };
    return { transcript: data.text, durationSeconds: data.duration ?? null };
  }
}
