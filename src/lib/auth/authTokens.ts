import { createHash, randomBytes } from "node:crypto";
import { IsNull, type DataSource, type EntityManager } from "typeorm";
import { AuthTokenEntity } from "@/lib/db/entities";
import type { AuthTokenKind } from "@/types/database";

/**
 * Tokens opacos guardados no banco (tabela `auth_tokens`): refresh tokens e
 * links de e-mail (recuperação de senha e convite pós-compra).
 *
 * O valor do token só existe na resposta/e-mail; no banco fica apenas o
 * SHA-256 dele. Como o token tem 256 bits aleatórios, um hash simples (sem
 * salt/bcrypt) é suficiente — não há como testar candidatos por força bruta.
 */

export const TOKEN_TTL_SECONDS: Record<AuthTokenKind, number> = {
  refresh: 60 * 60 * 24 * 30, // 30 dias (mesmo prazo do cookie no frontend)
  password_reset: 60 * 60, // 1 hora
  invite: 60 * 60 * 24 * 7, // 7 dias
};

/**
 * Janela em que um refresh token já rotacionado ainda é aceito. O frontend
 * pode disparar renovações concorrentes com o mesmo refresh token (várias
 * requisições ao mesmo tempo logo após o access token expirar); sem essa
 * folga, todas menos uma derrubariam a sessão do usuário.
 */
const REFRESH_REUSE_GRACE_SECONDS = 10;

type Db = DataSource | EntityManager;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Cria um token novo e devolve o valor em claro (o único momento em que ele existe). */
export async function createAuthToken(db: Db, userId: string, kind: AuthTokenKind): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.getRepository(AuthTokenEntity).insert({
    user_id: userId,
    kind,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + TOKEN_TTL_SECONDS[kind] * 1000),
  });
  return token;
}

/**
 * Marca um token de link (senha/convite) como usado e devolve o dono. Só
 * funciona uma vez: a condição `consumed_at IS NULL` no próprio UPDATE
 * impede que duas requisições simultâneas usem o mesmo link.
 */
export async function consumeLinkToken(db: Db, token: string): Promise<string | null> {
  const result = await db
    .getRepository(AuthTokenEntity)
    .createQueryBuilder()
    .update()
    .set({ consumed_at: () => "now()" })
    .where("token_hash = :hash", { hash: hashToken(token) })
    .andWhere("kind IN ('password_reset', 'invite')")
    .andWhere("consumed_at IS NULL")
    .andWhere("expires_at > now()")
    .returning(["user_id"])
    .execute();

  return firstUserId(result.raw);
}

/**
 * Rotaciona um refresh token: marca como consumido e devolve o dono, para
 * que o chamador emita um par novo. Tokens consumidos há menos de
 * `REFRESH_REUSE_GRACE_SECONDS` ainda são aceitos (ver acima); o
 * `COALESCE` mantém a data original, então a folga não se renova.
 */
export async function consumeRefreshToken(db: Db, token: string): Promise<string | null> {
  const result = await db
    .getRepository(AuthTokenEntity)
    .createQueryBuilder()
    .update()
    .set({ consumed_at: () => "COALESCE(consumed_at, now())" })
    .where("token_hash = :hash", { hash: hashToken(token) })
    .andWhere("kind = 'refresh'")
    .andWhere("expires_at > now()")
    .andWhere(
      `(consumed_at IS NULL OR consumed_at > now() - interval '${REFRESH_REUSE_GRACE_SECONDS} seconds')`
    )
    .returning(["user_id"])
    .execute();

  return firstUserId(result.raw);
}

/** Invalida todos os tokens ainda válidos de um tipo para o usuário. */
export async function revokeUserTokens(db: Db, userId: string, kinds: AuthTokenKind[]): Promise<void> {
  for (const kind of kinds) {
    await db
      .getRepository(AuthTokenEntity)
      .update({ user_id: userId, kind, consumed_at: IsNull() }, { consumed_at: new Date() });
  }
}

function firstUserId(raw: unknown): string | null {
  const rows = Array.isArray(raw) ? (raw as Array<{ user_id?: string }>) : [];
  return rows[0]?.user_id ?? null;
}
