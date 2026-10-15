import type { MercadoPagoPaymentStatus } from "./types";
import type { PurchaseStatus, UserStatus } from "@/types/database";

/** Converte o status de pagamento do Mercado Pago no status de compra interno. */
export function mapPaymentToPurchaseStatus(status: string): PurchaseStatus | null {
  const known: Record<MercadoPagoPaymentStatus, PurchaseStatus> = {
    pending: "pending",
    approved: "approved",
    authorized: "authorized",
    in_process: "in_process",
    in_mediation: "in_mediation",
    rejected: "rejected",
    cancelled: "cancelled",
    refunded: "refunded",
    charged_back: "charged_back",
  };
  return known[status as MercadoPagoPaymentStatus] ?? null;
}

/**
 * Decide o novo status do usuário a partir do status de pagamento.
 * Retorna null quando o status não deve alterar (ou criar) o usuário —
 * por exemplo, um pagamento "rejected" nunca concedeu acesso, então não há
 * usuário para revogar.
 */
export function mapPaymentToUserStatus(status: string): UserStatus | null {
  switch (status as MercadoPagoPaymentStatus) {
    case "approved":
      return "active";
    case "refunded":
      return "refunded";
    case "charged_back":
      return "blocked";
    case "cancelled":
      return "cancelled";
    default:
      // pending, authorized, in_process, in_mediation, rejected: ainda não
      // concederam nem revogaram acesso — nenhuma alteração de status.
      return null;
  }
}
