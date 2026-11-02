import { AsyncLocalStorage } from "node:async_hooks";
import type { DataSource } from "typeorm";
import { UsageEventEntity } from "@/lib/db/entities";
import type { UsageKind } from "@/types/database";
import { textCostUsd, transcriptionCostUsd } from "./pricing";

/**
 * Medidor de uso de IA por requisição.
 *
 * As rotas envolvem a chamada ao provedor em `withUsageMeter(...)`; o
 * provedor (ex.: OpenAIProvider) informa os tokens de cada chamada com
 * `reportAiUsage(...)`, sem precisar saber quem é o usuário. Depois, a rota
 * grava um `usage_events` com o total e o custo estimado.
 */

export interface AiCall {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

const storage = new AsyncLocalStorage<AiCall[]>();

export function reportAiUsage(call: AiCall): void {
  storage.getStore()?.push(call);
}

export async function withUsageMeter<T>(fn: () => Promise<T>): Promise<{ result: T; calls: AiCall[] }> {
  const calls: AiCall[] = [];
  const result = await storage.run(calls, fn);
  return { result, calls };
}

/** IP do cliente: o frontend repassa `x-client-ip` no login; nas demais rotas vale o proxy (Traefik). */
export function clientIp(request: Request): string | null {
  const direct = request.headers.get("x-client-ip")?.trim();
  if (direct) return direct.slice(0, 64);
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded ? forwarded.slice(0, 64) : request.headers.get("x-real-ip")?.trim().slice(0, 64) || null;
}

export function clientUserAgent(request: Request): string | null {
  const ua = request.headers.get("x-client-user-agent") ?? request.headers.get("user-agent");
  return ua ? ua.slice(0, 300) : null;
}

interface RecordInput {
  userId: string;
  kind: UsageKind;
  request?: Request;
  /** Chamadas de IA de texto medidas por withUsageMeter. */
  calls?: AiCall[];
  /** Transcrição: provedor, modelo e duração do áudio. */
  transcription?: { provider: string; model: string; seconds: number | null };
  meta?: Record<string, unknown>;
}

/**
 * Grava um evento de uso. Nunca lança erro: falha no registro não pode
 * atrapalhar o usuário (só gera log).
 */
export async function recordUsage(db: DataSource, input: RecordInput): Promise<void> {
  try {
    let provider: string | null = null;
    let model: string | null = null;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let audioSeconds: number | null = null;
    let cost = 0;

    if (input.calls && input.calls.length > 0) {
      provider = input.calls[0]!.provider;
      model = input.calls[0]!.model;
      inputTokens = input.calls.reduce((s, c) => s + c.inputTokens, 0);
      outputTokens = input.calls.reduce((s, c) => s + c.outputTokens, 0);
      cost = input.calls.reduce((s, c) => s + textCostUsd(c.model, c.inputTokens, c.outputTokens), 0);
    } else if (input.calls) {
      // Nenhuma chamada externa: análise feita pela heurística local (custo zero).
      provider = "local";
    }

    if (input.transcription) {
      provider = input.transcription.provider;
      model = input.transcription.model;
      audioSeconds = input.transcription.seconds;
      if (provider !== "mock" && audioSeconds) {
        cost += transcriptionCostUsd(model, audioSeconds);
      }
    }

    await db.getRepository(UsageEventEntity).insert({
      user_id: input.userId,
      kind: input.kind,
      provider,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      audio_seconds: audioSeconds,
      cost_usd: Math.round(cost * 1_000_000) / 1_000_000,
      ip: input.request ? clientIp(input.request) : null,
      user_agent: input.request ? clientUserAgent(input.request) : null,
      meta: input.meta ?? null,
    });
  } catch (err) {
    console.error(`[usage] Falha ao registrar uso (${input.kind}):`, err);
  }
}
