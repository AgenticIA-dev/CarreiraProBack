import type { DataSource } from "typeorm";
import { getDb } from "@/lib/db/dataSource";
import { UserEntity } from "@/lib/db/entities";
import type { UserRow } from "@/types/database";
import { verifyAccessToken } from "./accessToken";

/**
 * Autenticação das rotas de API deste backend.
 *
 * O frontend é outro projeto/deploy (outra origem), então cada chamada traz
 * o access token no header `Authorization: Bearer <token>`. O token é
 * validado (assinatura + expiração, ver `accessToken.ts`) e o perfil é
 * sempre relido do banco — status e role nunca vêm do token nem do cliente.
 *
 * Sem RLS: o banco não sabe quem é o usuário. Toda rota que lê ou altera
 * dados do usuário DEVE filtrar por `auth.userId` (ex.: `where: { user_id:
 * auth.userId }`) — esse filtro é o que impede um usuário de ver dados de
 * outro.
 */

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export interface ApiAuthContext {
  userId: string;
  email: string;
  profile: UserRow;
  db: DataSource;
}

/** Autentica a requisição (token válido + usuário existente), sem exigir status/role. */
export async function getAuthenticatedUser(request: Request): Promise<ApiAuthContext | null> {
  const token = extractBearerToken(request);
  if (!token) return null;

  const claims = await verifyAccessToken(token);
  if (!claims) return null;

  const db = await getDb();
  const profile = await db.getRepository(UserEntity).findOneBy({ id: claims.userId });
  if (!profile) return null;

  return { userId: profile.id, email: profile.email, profile, db };
}

/**
 * Autentica e exige status "active" — a mesma regra aplicada pelo middleware
 * do frontend, reforçada aqui porque esta API é alcançável diretamente.
 */
export async function requireActiveApiUser(request: Request): Promise<ApiAuthContext | null> {
  const auth = await getAuthenticatedUser(request);
  if (!auth || auth.profile.status !== "active") return null;
  return auth;
}

/** Igual a requireActiveApiUser, mas também exige role "admin". */
export async function requireAdminApiUser(request: Request): Promise<ApiAuthContext | null> {
  const active = await requireActiveApiUser(request);
  if (!active || active.profile.role !== "admin") return null;
  return active;
}
