import { z } from "zod";
import { getDb } from "@/lib/db/dataSource";
import { UserEntity } from "@/lib/db/entities";
import { consumeRefreshToken } from "@/lib/auth/authTokens";
import { issueSession } from "@/lib/auth/session";

const bodySchema = z.object({ refresh_token: z.string().min(1) });

/**
 * Troca um refresh token por uma sessão nova (access + refresh token
 * rotacionados — o antigo deixa de valer, ver `consumeRefreshToken`).
 * Chamada pelo frontend quando o access token expira.
 */
export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Sessão inválida." }, { status: 400 });
  }

  try {
    const db = await getDb();
    const session = await db.transaction(async (manager) => {
      const userId = await consumeRefreshToken(manager, parsed.data.refresh_token);
      if (!userId) return null;
      const user = await manager.getRepository(UserEntity).findOneBy({ id: userId });
      return user ? issueSession(manager, user) : null;
    });

    if (!session) {
      return Response.json({ error: "Sessão expirada." }, { status: 401 });
    }
    return Response.json({ session });
  } catch {
    return Response.json({ error: "Não foi possível renovar a sessão agora." }, { status: 500 });
  }
}
