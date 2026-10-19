import type { DataSource, EntityManager } from "typeorm";
import { ACCESS_TOKEN_TTL_SECONDS, signAccessToken } from "./accessToken";
import { createAuthToken } from "./authTokens";

/**
 * Formato de sessão devolvido pelo backend ao frontend (login e refresh).
 * É o mesmo formato usado na época do Supabase Auth, então o frontend não
 * precisou mudar a forma de guardar os tokens.
 */
export interface SessionPayload {
  access_token: string;
  refresh_token: string;
  /** Segundos até o access token expirar. */
  expires_in: number;
}

/** Emite um access token (JWT) e um refresh token novo (guardado no banco). */
export async function issueSession(
  db: DataSource | EntityManager,
  user: { id: string; email: string }
): Promise<SessionPayload> {
  const [access_token, refresh_token] = await Promise.all([
    signAccessToken(user),
    createAuthToken(db, user.id, "refresh"),
  ]);
  return { access_token, refresh_token, expires_in: ACCESS_TOKEN_TTL_SECONDS };
}

/**
 * URL do frontend para onde os links de e-mail (recuperação de senha e
 * convite pós-compra) levam o usuário, com o token no fragmento (`#token=`)
 * — o fragmento nunca é enviado a servidores nem aparece em logs de acesso.
 * Montada sempre no servidor, nunca aceita do cliente, para não virar um
 * redirecionamento aberto.
 */
export function buildPasswordSetupUrl(token: string): string {
  const frontendUrl = process.env.FRONTEND_ORIGIN?.trim().replace(/\/+$/, "");
  if (!frontendUrl) {
    throw new Error("FRONTEND_ORIGIN não configurado: necessário para montar os links de e-mail.");
  }
  return `${frontendUrl}/redefinir-senha#token=${encodeURIComponent(token)}`;
}
