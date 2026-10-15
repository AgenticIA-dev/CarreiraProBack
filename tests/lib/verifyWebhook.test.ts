import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyMercadoPagoWebhook, buildIdempotencyKey } from "@/lib/mercadopago/verifyWebhook";

const SECRET = "test-secret";

/** Monta um header `x-signature` válido para os parâmetros dados, exatamente como o Mercado Pago faz. */
function signFor(params: { dataId: string; requestId: string; ts: string; secret?: string }) {
  const manifest = `id:${params.dataId.toLowerCase()};request-id:${params.requestId};ts:${params.ts};`;
  const v1 = createHmac("sha256", params.secret ?? SECRET).update(manifest).digest("hex");
  return `ts=${params.ts},v1=${v1}`;
}

describe("verifyMercadoPagoWebhook", () => {
  it("aceita uma assinatura válida", () => {
    const dataId = "123456789";
    const requestId = "req-abc";
    const ts = "1700000000000";

    const result = verifyMercadoPagoWebhook({
      signatureHeader: signFor({ dataId, requestId, ts }),
      requestId,
      dataId,
      secret: SECRET,
    });

    expect(result).toBe(true);
  });

  it("rejeita quando o hash não corresponde (payload ou segredo diferentes)", () => {
    const dataId = "123456789";
    const requestId = "req-abc";
    const ts = "1700000000000";

    const result = verifyMercadoPagoWebhook({
      signatureHeader: signFor({ dataId, requestId, ts, secret: "outro-segredo" }),
      requestId,
      dataId,
      secret: SECRET,
    });

    expect(result).toBe(false);
  });

  it("rejeita quando o dataId usado para verificar é diferente do assinado", () => {
    const requestId = "req-abc";
    const ts = "1700000000000";

    const result = verifyMercadoPagoWebhook({
      signatureHeader: signFor({ dataId: "123456789", requestId, ts }),
      requestId,
      dataId: "999999999", // alguém tentando reaproveitar a assinatura para outro pagamento
      secret: SECRET,
    });

    expect(result).toBe(false);
  });

  it("rejeita quando faltam o header de assinatura, o request-id, o dataId ou o segredo", () => {
    expect(
      verifyMercadoPagoWebhook({ signatureHeader: null, requestId: "r", dataId: "1", secret: SECRET })
    ).toBe(false);
    expect(
      verifyMercadoPagoWebhook({ signatureHeader: "ts=1,v1=abc", requestId: null, dataId: "1", secret: SECRET })
    ).toBe(false);
    expect(
      verifyMercadoPagoWebhook({ signatureHeader: "ts=1,v1=abc", requestId: "r", dataId: null, secret: SECRET })
    ).toBe(false);
    expect(
      verifyMercadoPagoWebhook({ signatureHeader: "ts=1,v1=abc", requestId: "r", dataId: "1", secret: "" })
    ).toBe(false);
  });

  it("rejeita um header de assinatura malformado (sem ts ou v1)", () => {
    const result = verifyMercadoPagoWebhook({
      signatureHeader: "formato=invalido",
      requestId: "req-abc",
      dataId: "123456789",
      secret: SECRET,
    });

    expect(result).toBe(false);
  });
});

describe("buildIdempotencyKey", () => {
  it("gera a mesma chave para o mesmo evento", () => {
    expect(buildIdempotencyKey("payment.updated", "123")).toBe(
      buildIdempotencyKey("payment.updated", "123")
    );
  });

  it("gera chaves diferentes para ações ou ids diferentes", () => {
    expect(buildIdempotencyKey("payment.created", "123")).not.toBe(
      buildIdempotencyKey("payment.updated", "123")
    );
    expect(buildIdempotencyKey("payment.updated", "123")).not.toBe(
      buildIdempotencyKey("payment.updated", "456")
    );
  });

  it("inclui o provedor no prefixo, para nunca colidir com eventos de outro provedor", () => {
    expect(buildIdempotencyKey("payment.updated", "123")).toBe("mercadopago:payment.updated:123");
  });
});
