/**
 * Rate limiting best-effort, em memória do processo.
 *
 * LIMITAÇÃO CONHECIDA: com múltiplas instâncias do servidor (vários
 * processos, containers ou serverless), este limitador não é compartilhado — serve
 * como defesa básica em desenvolvimento/instância única. Para produção com
 * múltiplas instâncias, substitua por um limitador distribuído (ex.: Upstash
 * Redis + `@upstash/ratelimit`), documentado como pendência em
 * docs/DOCUMENTATION.md.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count };
}

/** Extrai um identificador de cliente a partir de headers comuns de proxy. */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
