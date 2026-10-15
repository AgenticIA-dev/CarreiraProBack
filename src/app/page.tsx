/** Página raiz mínima — este projeto é só API. Ver /api/health. */
export default function RootPage() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: 24 }}>
      <h1>CarreiraPro — backend</h1>
      <p>Este serviço expõe apenas rotas de API em /api/**. Ver /api/health.</p>
    </main>
  );
}
