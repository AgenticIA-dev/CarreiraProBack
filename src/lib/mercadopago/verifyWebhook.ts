import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Valida a autenticidade de uma notificação de webhook do Mercado Pago.
 *
 * Mecanismo (ver PENDÊNCIA DE VERIFICAÇÃO em ./types.ts): o header
 * `x-signature` vem no formato `ts=<timestamp>,v1=<hash>`. O hash é um
 * HMAC-SHA256 (hex) sobre um "manifest" montado como:
 *
 *   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 *
 * usando o segredo da aplicação (`MERCADOPAGO_WEBHOOK_SECRET`, exibido no
 * painel de configuração de webhooks). Comparação em tempo constante para
 * evitar ataques de timing — nunca confiamos cegamente na notificação
 * (mesmo princípio de nunca confiar cegamente no payload: PROMPT
 * MESTRE §13).
 */
export function verifyMercadoPagoWebhook(params: {
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string;
}): boolean {
  const { signatureHeader, requestId, dataId, secret } = params;

  if (!signatureHeader || !requestId || !dataId || !secret) return false;

  const parts = Object.fromEntries(
    signatureHeader
      .split(",")
      .map((part) => part.trim().split("="))
      .filter((pair): pair is [string, string] => pair.length === 2)
  );

  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;

  const expected = createHmac("sha256", secret).update(manifest).digest("hex");

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(v1);

  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}

/** Chave de idempotência para um evento de webhook do Mercado Pago. */
export function buildIdempotencyKey(action: string, dataId: string): string {
  return `mercadopago:${action}:${dataId}`;
}
