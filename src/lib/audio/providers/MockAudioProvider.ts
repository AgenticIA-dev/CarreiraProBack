import type { AudioProvider, AudioResult } from "../AudioProvider";

/**
 * Provedor usado quando nenhuma credencial de áudio está configurada (ex.:
 * ambiente de desenvolvimento local, sem `AI_PROVIDER_API_KEY`). Não chama
 * nenhuma API externa: devolve um MP3 silencioso de ~0,3s, só para a UI
 * (botão de play, player) continuar funcionando sem gerar custo nem exigir
 * chave.
 */
const SILENCE_MP3_BASE64 =
  "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//NwwAAAAAAAAAAAAEluZm8AAAAPAAAADgAAAiIAYWFhYWFhYW1tbW1tbW15eXl5eXl5hoaGhoaGhpKSkpKSkpKenp6enp6eqqqqqqqqqra2tra2tra2w8PDw8PDw8/Pz8/Pz8/b29vb29vb5+fn5+fn5/Pz8/Pz8/P/////////AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQDaQAAAAAAAAIiRvRARQAAAAAAAAAAAAAAAAD/8xDEAAAAA0gAAAAATEFNRTMuMTAwVVVVVf/zEMQNAAADSAAAAABVVVVVVVVVVVVVVVVV//MQxBoAAANIAAAAAFVVVVVVVVVVVVVVVVX/8xDEJwAAA0gAAAAAVVVVVVVVVVVVVVVVVf/zEMQ0AAADSAAAAABVVVVVVVVVVVVVVVVV//MQxEEAAANIAAAAAFVVVVVVVVVVVVVVVVX/8xDETgAAA0gAAAAAVVVVVVVVVVVVVVVVVf/zEMRbAAADSAAAAABVVVVVVVVVVVVVVVVV//MQxGgAAANIAAAAAFVVVVVVVVVVVVVVVVX/8xDEdQAAA0gAAAAAVVVVVVVVVVVVVVVVVf/zEMSCAAADSAAAAABVVVVVVVVVVVVVVVVV//MQxI8AAANIAAAAAFVVVVVVVVVVVVVVVVX/8xDEnAAAA0gAAAAAVVVVVVVVVVVVVVVVVf/zEMSpAAADSAAAAABVVVVVVVVVVVVVVVVV";

export class MockAudioProvider implements AudioProvider {
  readonly name = "mock";
  readonly model = "mock";
  readonly voice = "mock";

  async synthesize(): Promise<AudioResult> {
    return {
      mp3: Buffer.from(SILENCE_MP3_BASE64, "base64"),
      provider: this.name,
      model: this.model,
      voice: this.voice,
    };
  }
}
