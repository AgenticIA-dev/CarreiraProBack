import { createClient, type Session } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getAnonConfig } from "./apiAuth";

/**
 * Cliente Supabase (chave anônima) para as rotas `/api/auth/*`, que são o
 * ÚNICO ponto do sistema que fala com o Supabase Auth em nome do usuário
 * (login, renovação, logout, recuperação de senha). O frontend não tem mais
 * nenhuma dependência do Supabase — ele só guarda os tokens devolvidos aqui.
 *
 * `persistSession: false` porque este cliente vive só durante uma
 * requisição; o fluxo padrão do supabase-js ("implicit") é o que queremos
 * para os e-mails de recuperação/convite: o link do Supabase redireciona o
 * usuário para o frontend com os tokens no fragmento da URL (`#access_token=`),
 * sem exigir um `code_verifier` guardado (PKCE), que este backend sem estado
 * não teria onde guardar.
 */
export function createAnonAuthClient() {
  const { url, anonKey } = getAnonConfig();
  return createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

/** Formato de sessão devolvido pelo backend ao frontend (login e refresh). */
export interface SessionPayload {
  access_token: string;
  refresh_token: string;
  /** Segundos até o access token expirar. */
  expires_in: number;
}

export function toSessionPayload(session: Session): SessionPayload {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
  };
}

/**
 * URL do frontend para onde os links de e-mail (recuperação de senha e
 * convite pós-compra) levam o usuário. Montada sempre no servidor — nunca
 * aceita do cliente, para não virar um redirecionamento aberto. Precisa
 * estar na lista de "Redirect URLs" do Supabase Auth.
 */
export function getPasswordSetupUrl(): string | undefined {
  const frontendUrl = process.env.FRONTEND_ORIGIN?.trim().replace(/\/+$/, "");
  return frontendUrl ? `${frontendUrl}/redefinir-senha` : undefined;
}
