/**
 * Camada de abstração de texto-para-voz (mesmo padrão de `AIProvider` e
 * `TranscriptionProvider`): nenhuma rota deve importar um provedor concreto
 * diretamente — sempre use `getAudioProvider()` (ver `index.ts`).
 */
export interface AudioResult {
  /** Áudio em MP3. */
  mp3: Buffer;
  provider: string;
  model: string;
  voice: string;
}

export interface AudioProvider {
  readonly name: string;
  readonly model: string;
  readonly voice: string;
  synthesize(text: string): Promise<AudioResult>;
}
