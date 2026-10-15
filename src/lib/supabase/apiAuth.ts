import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, UserRow } from "@/types/database";

/**
 * Autenticação das rotas de API deste backend.
 *
 * Como o frontend agora é um projeto/deploy separado (origem diferente),
 * não há cookies compartilhados entre os dois — a sessão do Supabase vive
 * no navegador (frontend), e cada chamada a este backend carrega o token de
 * acesso da sessão no header `Authorization: Bearer <token>`.
 *
 * Este módulo nunca confia no token sem validá-lo: `supabase.auth.getUser()`
 * verifica a assinatura/validade do JWT contra o servidor de autenticação do
 * Supabase antes de devolver o usuário. As consultas feitas com o cliente
 * retornado aqui usam a chave anônima + esse mesmo token, então o Postgres
 * continua decidindo tudo por RLS como o próprio usuário autenticado — nunca
 * pela service role (essa é usada apenas em operações administrativas
 * explícitas, nunca para "confiar" num usuário).
 */

function getAnonConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  return { url, anonKey };
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export interface ApiAuthContext {
  authId: string;
  email: string;
  /** Cliente Supabase escopado ao usuário (chave anônima + seu token) — respeita RLS. */
  supabase: SupabaseClient<Database>;
  /**
   * Token de acesso original enviado pelo cliente. Exposto porque alguns
   * métodos do SDK de auth (ex.: `auth.updateUser`) dependem de uma sessão
   * em memória em vez de aceitar o token diretamente — quando isso é
   * necessário, a rota chama a API REST do GoTrue diretamente com este
   * token, em vez de tentar reconstruir uma sessão a partir de um único
   * access token (não temos refresh token aqui).
   */
  accessToken: string;
}

/** Autentica a requisição (token válido), sem exigir nenhum status/role específico. */
export async function getAuthenticatedUser(request: Request): Promise<ApiAuthContext | null> {
  const token = extractBearerToken(request);
  if (!token) return null;

  const { url, anonKey } = getAnonConfig();
  const supabase = createClient<Database>(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) return null;

  return { authId: user.id, email: user.email ?? "", supabase, accessToken: token };
}

export interface ActiveApiUser extends ApiAuthContext {
  profile: UserRow;
}

/**
 * Autentica e exige que o perfil exista e esteja com status "active" — a
 * mesma regra aplicada pelo middleware do frontend, mas reforçada aqui
 * porque esta API é alcançável diretamente, sem depender daquele middleware
 * (defesa em profundidade — PROMPT MESTRE §11-12, §42).
 */
export async function requireActiveApiUser(request: Request): Promise<ActiveApiUser | null> {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return null;

  const { data: profile, error } = await auth.supabase
    .from("users")
    .select("*")
    .eq("id", auth.authId)
    .single();

  if (error || !profile || profile.status !== "active") return null;

  return { ...auth, profile };
}

/** Igual a requireActiveApiUser, mas também exige role "admin". */
export async function requireAdminApiUser(request: Request): Promise<ActiveApiUser | null> {
  const active = await requireActiveApiUser(request);
  if (!active || active.profile.role !== "admin") return null;
  return active;
}
