import { z } from "zod";
import { getDb } from "@/lib/db/dataSource";
import { PartnerEntity } from "@/lib/db/entities";

const codeSchema = z.string().trim().toUpperCase().max(40);

/**
 * Resolve um código de amostra grátis (cupom do parceiro) para a página
 * pública `/amostra/:codigo` do frontend exibir antes do cadastro (ex.:
 * "Você foi indicado por {partnerName}"). Rota pública, sem autenticação.
 */
export async function GET(_request: Request, code: string) {
  const parsed = codeSchema.safeParse(code);
  if (!parsed.success) {
    return Response.json({ valid: false });
  }

  try {
    const db = await getDb();
    const partner = await db.getRepository(PartnerEntity).findOneBy({ coupon_code: parsed.data, active: true });
    if (!partner) {
      return Response.json({ valid: false });
    }
    return Response.json({ valid: true, partnerName: partner.name });
  } catch (err) {
    console.error("[trial/info] Falha ao consultar cupom:", err);
    return Response.json({ valid: false });
  }
}
