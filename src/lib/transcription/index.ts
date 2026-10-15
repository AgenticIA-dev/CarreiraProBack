import type { TranscriptionProvider } from "./TranscriptionProvider";
import { MockTranscriptionProvider } from "./providers/MockTranscriptionProvider";
import { WhisperTranscriptionProvider } from "./providers/WhisperTranscriptionProvider";

let cached: TranscriptionProvider | null = null;

export function getTranscriptionProvider(): TranscriptionProvider {
  if (cached) return cached;

  const providerName = process.env.TRANSCRIPTION_PROVIDER ?? "mock";
  const apiKey = process.env.TRANSCRIPTION_PROVIDER_API_KEY;

  if (providerName === "whisper" && apiKey) {
    cached = new WhisperTranscriptionProvider(apiKey);
  } else {
    cached = new MockTranscriptionProvider();
  }

  return cached;
}
