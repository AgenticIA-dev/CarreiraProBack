import type { NextConfig } from "next";

/**
 * Configuração do Next.js para o backend (somente API, sem páginas).
 *
 * Cabeçalhos de segurança básicos como defesa em profundidade. CORS é tratado
 * em `src/middleware.ts` (apenas a origem do frontend, definida por
 * `FRONTEND_ORIGIN`, pode chamar esta API pelo navegador). Nenhum segredo é
 * referenciado aqui — apenas variáveis de ambiente lidas em código
 * server-only.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    ignoreDuringBuilds: false,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
