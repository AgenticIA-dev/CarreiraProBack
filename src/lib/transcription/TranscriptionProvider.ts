/**
 * Camada de abstração do serviço de transcrição de áudio (PROMPT MESTRE §22).
 *
 * Fluxo: Browser → gravação → backend → serviço de transcrição → transcript → IA → feedback.
 * A aplicação nunca fica acoplada a um único fornecedor — troque a
 * implementação em `index.ts` sem alterar as rotas que a consomem.
 */
export interface TranscriptionResult {
  transcript: string;
  durationSeconds: number | null;
}

export interface TranscriptionProvider {
  readonly name: string;
  transcribe(audio: Blob | Buffer, mimeType: string): Promise<TranscriptionResult>;
}
