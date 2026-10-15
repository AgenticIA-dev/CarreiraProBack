import { describe, expect, it } from "vitest";
import { mapPaymentToPurchaseStatus, mapPaymentToUserStatus } from "@/lib/mercadopago/mapStatus";

describe("mapPaymentToPurchaseStatus", () => {
  it("mapeia cada status documentado do Mercado Pago para o status interno equivalente", () => {
    expect(mapPaymentToPurchaseStatus("pending")).toBe("pending");
    expect(mapPaymentToPurchaseStatus("approved")).toBe("approved");
    expect(mapPaymentToPurchaseStatus("authorized")).toBe("authorized");
    expect(mapPaymentToPurchaseStatus("in_process")).toBe("in_process");
    expect(mapPaymentToPurchaseStatus("in_mediation")).toBe("in_mediation");
    expect(mapPaymentToPurchaseStatus("rejected")).toBe("rejected");
    expect(mapPaymentToPurchaseStatus("cancelled")).toBe("cancelled");
    expect(mapPaymentToPurchaseStatus("refunded")).toBe("refunded");
    expect(mapPaymentToPurchaseStatus("charged_back")).toBe("charged_back");
  });

  it("retorna null para um status não documentado, em vez de inventar um mapeamento", () => {
    expect(mapPaymentToPurchaseStatus("algo_novo_desconhecido")).toBeNull();
  });
});

describe("mapPaymentToUserStatus", () => {
  it("concede acesso (active) somente quando o pagamento é approved", () => {
    expect(mapPaymentToUserStatus("approved")).toBe("active");
  });

  it("revoga ou marca o usuário de acordo com status de reembolso/chargeback/cancelamento", () => {
    expect(mapPaymentToUserStatus("refunded")).toBe("refunded");
    expect(mapPaymentToUserStatus("charged_back")).toBe("blocked");
    expect(mapPaymentToUserStatus("cancelled")).toBe("cancelled");
  });

  it("não altera o usuário para status intermediários ou de rejeição (nunca concedeu acesso)", () => {
    expect(mapPaymentToUserStatus("pending")).toBeNull();
    expect(mapPaymentToUserStatus("authorized")).toBeNull();
    expect(mapPaymentToUserStatus("in_process")).toBeNull();
    expect(mapPaymentToUserStatus("in_mediation")).toBeNull();
    expect(mapPaymentToUserStatus("rejected")).toBeNull();
  });
});
