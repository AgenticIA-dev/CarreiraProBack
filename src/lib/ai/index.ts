import type { AIProvider } from "./AIProvider";
import { MockAIProvider } from "./providers/MockAIProvider";
import { OpenAIProvider } from "./providers/OpenAIProvider";

let cached: AIProvider | null = null;

/**
 * Fábrica do provedor de IA ativo.
 *
 * Troca de provedor é feita apenas por variável de ambiente — nenhuma regra
 * de negócio (STAR, simulador) deve saber qual provedor concreto está em
 * uso (PROMPT MESTRE §38).
 */
export function getAIProvider(): AIProvider {
  if (cached) return cached;

  const providerName = process.env.AI_PROVIDER ?? "mock";
  const apiKey = process.env.AI_PROVIDER_API_KEY;

  if (providerName === "openai" && apiKey) {
    cached = new OpenAIProvider(apiKey, process.env.AI_PROVIDER_MODEL || undefined);
  } else {
    cached = new MockAIProvider();
  }

  return cached;
}
