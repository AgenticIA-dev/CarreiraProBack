export const metadata = {
  title: "CarreiraPro API",
  description: "Backend do CarreiraPro — ver /api/health.",
};

/**
 * Este projeto é só API (Route Handlers) — não serve páginas de interface.
 * O layout/página raiz existem apenas para satisfazer o App Router do
 * Next.js e oferecer um ponto de checagem rápida (`/`, `/api/health`).
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
