import type { MiddlewareHandler } from "hono";

/**
 * CORS para as rotas de API deste backend.
 *
 * O frontend é um projeto/deploy separado (outra origem), então o navegador
 * do usuário só consegue chamar esta API se ela responder com os headers de
 * CORS liberando essa origem. Centralizado aqui em vez de repetido em cada
 * rota.
 *
 * Por padrão, só a origem definida em `FRONTEND_ORIGIN` é liberada — nunca
 * um wildcard em produção, para não permitir que qualquer site chame esta
 * API em nome de um usuário logado. Sem `FRONTEND_ORIGIN` configurada, o
 * CORS não libera nenhuma origem (falha de forma segura/fechada) — exceto
 * em desenvolvimento (`NODE_ENV !== "production"`), onde libera `*` para
 * não travar o `npm run dev` antes de configurar a variável.
 *
 * O webhook do Mercado Pago (`/api/webhooks/mercadopago`) nunca é chamado
 * pelo navegador — é uma chamada servidor-a-servidor do Mercado Pago, que
 * não é afetada por CORS (CORS é uma restrição do navegador).
 */
/** Normaliza uma origem: minúsculas, sem barra final, sem caminho. */
function normalizeOrigin(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  try {
    return new URL(trimmed).origin.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

/**
 * Origens liberadas. `FRONTEND_ORIGIN` aceita uma ou várias, separadas por
 * vírgula (ex.: "https://app.dominio.com.br,https://www.dominio.com.br").
 * Barra final, maiúsculas ou caminho são tolerados — antes, um simples "/"
 * no fim da variável fazia o navegador bloquear TODAS as chamadas feitas
 * direto do cliente (ex.: banco de perguntas, STAR, simulador) só em
 * produção, já que em desenvolvimento o CORS libera "*".
 */
function allowedOrigins(): string[] {
  return (process.env.FRONTEND_ORIGIN ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
    .map(normalizeOrigin);
}

/**
 * URL principal do frontend (a 1ª de FRONTEND_ORIGIN), sem barra final —
 * usada para montar links (e-mails, back_urls do Mercado Pago).
 */
export function getPrimaryFrontendUrl(): string | null {
  const first = (process.env.FRONTEND_ORIGIN ?? "").split(",")[0]?.trim();
  return first ? first.replace(/\/+$/, "") : null;
}

const warnedOrigins = new Set<string>();

function resolveAllowOrigin(requestOrigin: string | null): string | null {
  const allowed = allowedOrigins();
  if (allowed.length === 0) {
    return process.env.NODE_ENV === "production" ? null : "*";
  }
  if (!requestOrigin) return null;
  const normalized = normalizeOrigin(requestOrigin);
  if (allowed.includes(normalized)) return requestOrigin;

  // Diagnóstico: registra (uma vez por origem) quem foi bloqueado, para que
  // um FRONTEND_ORIGIN errado apareça nos logs do servidor (pm2 logs).
  if (!warnedOrigins.has(normalized)) {
    warnedOrigins.add(normalized);
    console.warn(
      `[CORS] Origem bloqueada: ${requestOrigin}. Liberadas: ${allowed.join(", ")}. ` +
        "Ajuste FRONTEND_ORIGIN no .env do backend se esta for a URL do frontend."
    );
  }
  return null;
}

function corsHeaders(requestOrigin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-anonymous-id",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };

  const allowOrigin = resolveAllowOrigin(requestOrigin);
  if (allowOrigin) {
    headers["Access-Control-Allow-Origin"] = allowOrigin;
  }

  return headers;
}

export const cors: MiddlewareHandler = async (c, next) => {
  const headers = corsHeaders(c.req.header("origin") ?? null);

  if (c.req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  await next();
  for (const [key, value] of Object.entries(headers)) {
    c.res.headers.set(key, value);
  }
};

/** Cabeçalhos de segurança básicos em toda resposta (defesa em profundidade). */
export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
};
