import type { TranscriptionProvider } from "./TranscriptionProvider";
import { MockTranscriptionProvider } from "./providers/MockTranscriptionProvider";
import { WhisperTranscriptionProvider } from "./providers/WhisperTranscriptionProvider";

let cached: TranscriptionProvider | null = null;

/**
 * Provedor de transcrição ativo.
 *
 *  - `TRANSCRIPTION_PROVIDER=whisper` (ou `openai`) + `TRANSCRIPTION_PROVIDER_API_KEY`
 *    → transcrição real via OpenAI.
 *  - Sem chave própria de transcrição, reaproveita `AI_PROVIDER_API_KEY` quando
 *    `AI_PROVIDER=openai` (mesma conta OpenAI serve para os dois).
 *  - Caso contrário → mock (sem transcrição real; o navegador usa o
 *    reconhecimento de fala nativo como alternativa).
 */
export function getTranscriptionProvider(): TranscriptionProvider {
  if (cached) return cached;

  const providerName = (process.env.TRANSCRIPTION_PROVIDER ?? "").trim().toLowerCase();
  const ownKey = process.env.TRANSCRIPTION_PROVIDER_API_KEY?.trim();
  const aiKey =
    (process.env.AI_PROVIDER ?? "").trim().toLowerCase() === "openai"
      ? process.env.AI_PROVIDER_API_KEY?.trim()
      : undefined;

  const wantsOpenAI = providerName === "whisper" || providerName === "openai" || (!providerName && Boolean(ownKey));
  const apiKey = ownKey || aiKey;

  if ((wantsOpenAI || (!providerName && aiKey)) && apiKey) {
    cached = new WhisperTranscriptionProvider(apiKey, process.env.TRANSCRIPTION_PROVIDER_MODEL?.trim() || undefined);
  } else {
    if (wantsOpenAI && !apiKey) {
      console.warn("[transcription] TRANSCRIPTION_PROVIDER definido, mas sem API key — usando mock.");
    }
    cached = new MockTranscriptionProvider();
  }

  return cached;
}
