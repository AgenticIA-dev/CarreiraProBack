import { NextResponse, type NextRequest } from "next/server";

/**
 * CORS para as rotas de API deste backend.
 *
 * Agora que o frontend é um projeto/deploy separado (outra origem), o
 * navegador do usuário só consegue chamar esta API se ela responder com os
 * headers de CORS liberando essa origem. Em vez de repetir isso em cada
 * rota, é centralizado aqui.
 *
 * Por padrão, só a origem definida em `FRONTEND_ORIGIN` é liberada — nunca
 * um wildcard em produção, para não permitir que qualquer site chame esta
 * API em nome de um usuário logado. Sem `FRONTEND_ORIGIN` configurada, o
 * CORS não libera nenhuma origem (falha de forma segura/fechada) — exceto
 * em desenvolvimento (`NODE_ENV !== "production"`), onde libera `*` para
 * não travar o `npm run dev` antes de configurar a variável.
 *
 * O webhook do Mercado Pago (`/api/webhooks/mercadopago`) nunca é chamado
 * pelo navegador — é uma chamada servidor-a-servidor do Mercado Pago, que
 * não é afetada por CORS (CORS é uma restrição do navegador).
 */
function resolveAllowedOrigin(): string {
  const configured = process.env.FRONTEND_ORIGIN?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? "" : "*";
}

function corsHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };

  const allowedOrigin = resolveAllowedOrigin();
  if (allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
  }

  return headers;
}

export function middleware(request: NextRequest) {
  const headers = corsHeaders();

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers });
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
