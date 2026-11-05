import type { AudioProvider } from "./AudioProvider";
import { MockAudioProvider } from "./providers/MockAudioProvider";
import { OpenAIAudioProvider } from "./providers/OpenAIAudioProvider";

let cached: AudioProvider | null = null;

/**
 * Provedor de texto-para-voz ativo.
 *
 *  - `AUDIO_PROVIDER=openai` + `AUDIO_PROVIDER_API_KEY` (própria) → voz real.
 *  - Sem chave própria, reaproveita `AI_PROVIDER_API_KEY` quando
 *    `AI_PROVIDER=openai` (mesma conta OpenAI serve para os dois, como já
 *    acontece com a transcrição).
 *  - Caso contrário → mock (áudio silencioso, sem custo).
 */
export function getAudioProvider(): AudioProvider {
  if (cached) return cached;

  const providerName = (process.env.AUDIO_PROVIDER ?? "").trim().toLowerCase();
  const ownKey = process.env.AUDIO_PROVIDER_API_KEY?.trim();
  const aiKey =
    (process.env.AI_PROVIDER ?? "").trim().toLowerCase() === "openai"
      ? process.env.AI_PROVIDER_API_KEY?.trim()
      : undefined;

  const wantsOpenAI = providerName === "openai" || (!providerName && Boolean(ownKey || aiKey));
  const apiKey = ownKey || aiKey;

  if (wantsOpenAI && apiKey) {
    cached = new OpenAIAudioProvider(
      apiKey,
      process.env.AUDIO_PROVIDER_MODEL?.trim() || undefined,
      process.env.AUDIO_PROVIDER_VOICE?.trim() || undefined
    );
  } else {
    if (providerName === "openai" && !apiKey) {
      console.warn("[audio] AUDIO_PROVIDER=openai, mas sem API key — usando mock.");
    }
    cached = new MockAudioProvider();
  }

  return cached;
}
