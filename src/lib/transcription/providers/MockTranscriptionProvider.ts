import type { TranscriptionProvider, TranscriptionResult } from "../TranscriptionProvider";

/**
 * Provedor usado quando nenhuma credencial de transcrição está configurada.
 *
 * Não fabrica texto: devolve transcrição VAZIA e `available: false`. Antes,
 * devolvia uma frase de aviso como se fosse a transcrição — e essa frase
 * acabava sendo avaliada como se fosse a resposta do usuário. Agora o
 * frontend usa o texto capturado pelo reconhecimento de fala do navegador
 * (quando disponível) ou pede que o usuário digite.
 */
export class MockTranscriptionProvider implements TranscriptionProvider {
  readonly name = "mock";

  async transcribe(): Promise<TranscriptionResult> {
    return { transcript: "", durationSeconds: null, available: false };
  }
}
