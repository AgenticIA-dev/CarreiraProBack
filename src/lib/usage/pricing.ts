/**
 * Preços usados para ESTIMAR o custo de IA por usuário (relatório do admin).
 *
 * Valores padrão = tabela pública da OpenAI (US$), conferida em 02/11/2026.
 * Podem ser sobrescritos por variável de ambiente, sem novo deploy de código:
 *  - AI_PRICE_INPUT_PER_1M_USD / AI_PRICE_OUTPUT_PER_1M_USD  (modelo de texto ativo)
 *  - TRANSCRIPTION_PRICE_PER_MIN_USD                         (transcrição)
 *  - USD_BRL_RATE                                            (câmbio para o relatório; padrão 5.50)
 *
 * O custo real é o da fatura da OpenAI; este é um cálculo aproximado a partir
 * dos tokens/minutos que a própria API informa em cada chamada.
 */

const TEXT_PRICES_PER_1M: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gpt-5": { input: 1.25, output: 10 },
  "gpt-5-mini": { input: 0.25, output: 2 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
};

const TRANSCRIPTION_PRICES_PER_MIN: Record<string, number> = {
  "whisper-1": 0.006,
  "gpt-4o-transcribe": 0.006,
  "gpt-4o-mini-transcribe": 0.003,
};

/**
 * Texto-para-voz: `gpt-4o-mini-tts` cobra por token (texto de entrada +
 * áudio de saída), não por caractere — a API de síntese não devolve essa
 * contagem de tokens na resposta (só os bytes do áudio), então aqui é uma
 * estimativa por caractere do texto de entrada, não o valor exato da
 * fatura. Ajustável por `AUDIO_PRICE_PER_1K_CHARS_USD` sem novo deploy.
 */
const AUDIO_PRICE_PER_1K_CHARS_USD = 0.015;

function envNumber(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Acha o preço pelo nome do modelo (aceita sufixos de versão, ex.: gpt-4o-2024-08-06). */
function lookup<T>(table: Record<string, T>, model: string): T | null {
  const m = model.toLowerCase();
  if (table[m]) return table[m]!;
  // Prefixo mais longo primeiro, para "gpt-4o-mini-..." não cair em "gpt-4o".
  const key = Object.keys(table)
    .sort((a, b) => b.length - a.length)
    .find((k) => m.startsWith(k));
  return key ? table[key]! : null;
}

export function textCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const base = lookup(TEXT_PRICES_PER_1M, model) ?? TEXT_PRICES_PER_1M["gpt-4o"]!;
  const input = envNumber("AI_PRICE_INPUT_PER_1M_USD") ?? base.input;
  const output = envNumber("AI_PRICE_OUTPUT_PER_1M_USD") ?? base.output;
  return (inputTokens * input + outputTokens * output) / 1_000_000;
}

export function transcriptionCostUsd(model: string, seconds: number): number {
  const perMin =
    envNumber("TRANSCRIPTION_PRICE_PER_MIN_USD") ?? lookup(TRANSCRIPTION_PRICES_PER_MIN, model) ?? 0.006;
  return (seconds / 60) * perMin;
}

/** Estimativa de custo da síntese de voz, pelo tamanho do texto de entrada (ver nota acima). */
export function audioCostUsd(characters: number): number {
  const per1k = envNumber("AUDIO_PRICE_PER_1K_CHARS_USD") ?? AUDIO_PRICE_PER_1K_CHARS_USD;
  return (characters / 1000) * per1k;
}

export function usdBrlRate(): number {
  return envNumber("USD_BRL_RATE") ?? 5.5;
}
