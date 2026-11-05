import type { AudioProvider, AudioResult } from "../AudioProvider";

/**
 * Texto-para-voz real via API "OpenAI Audio Speech" (`/v1/audio/speech`).
 *
 * Modelo padrão `gpt-4o-mini-tts`. Esse endpoint está marcado como
 * descontinuado pela OpenAI (desligamento anunciado para 06/01/2027, sem
 * substituto direto fora da API de tempo real) — conferido na documentação
 * oficial em 05/11/2026. Continua funcionando normalmente até lá; os áudios
 * de pergunta/resposta ideal, uma vez gerados e guardados no banco, seguem
 * funcionando mesmo depois (não dependem de nova chamada à API).
 */
export class OpenAIAudioProvider implements AudioProvider {
  readonly name = "openai";

  constructor(
    private readonly apiKey: string,
    readonly model: string = "gpt-4o-mini-tts",
    readonly voice: string = "alloy"
  ) {}

  async synthesize(text: string): Promise<AudioResult> {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        voice: this.voice,
        input: text,
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`[audio] OpenAI respondeu ${response.status}: ${detail.slice(0, 500)}`);
      throw new Error(`Provedor de áudio respondeu com status ${response.status}.`);
    }

    const mp3 = Buffer.from(await response.arrayBuffer());
    return { mp3, provider: this.name, model: this.model, voice: this.voice };
  }
}
