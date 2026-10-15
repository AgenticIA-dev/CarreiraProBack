import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Cliente Supabase com a service role key — ignora RLS.
 *
 * USO RESTRITO a rotas server-side de confiança (webhook do Mercado Pago, jobs
 * internos, middleware). NUNCA importar este módulo em código que possa ser
 * incluído no bundle do cliente.
 *
 * Este arquivo é isolado de `server.ts` (que depende de `next/headers`) de
 * propósito: `next/headers` não é suportado em Middleware (Edge Runtime), e
 * `src/middleware.ts` precisa deste cliente para checar status/role sem
 * arrastar essa dependência para o bundle do middleware.
 */
export function createSupabaseServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase (service role) não configurado: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
