import type { TranscriptionProvider, TranscriptionResult } from "../TranscriptionProvider";

/**
 * Provedor de transcrição usado quando nenhuma credencial está configurada.
 *
 * Não produz um texto fabricado apresentado como transcrição real: retorna
 * um marcador claramente identificado, para que a UI e o usuário saibam que
 * a transcrição automática não está disponível neste ambiente — em vez de
 * inventar silenciosamente uma resposta (princípio anti-alucinação também
 * se aplica aqui, PROMPT MESTRE §19).
 */
export class MockTranscriptionProvider implements TranscriptionProvider {
  readonly name = "mock";

  async transcribe(audio: Blob | Buffer): Promise<TranscriptionResult> {
    const size = audio instanceof Blob ? audio.size : audio.length;
    return {
      transcript:
        "[Transcrição automática indisponível neste ambiente — nenhum provedor de transcrição está configurado. " +
        "Configure TRANSCRIPTION_PROVIDER e TRANSCRIPTION_PROVIDER_API_KEY, ou digite manualmente sua resposta abaixo.]",
      durationSeconds: size > 0 ? null : 0,
    };
  }
}
