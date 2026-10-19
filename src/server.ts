import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { closeDb } from "./lib/db/dataSource";

/**
 * Ponto de entrada do servidor HTTP.
 *
 *   npm run dev     # tsx watch, recarrega a cada edição
 *   npm start       # dist/server.js (gerado por `npm run build`)
 *
 * Porta: `PORT` (padrão 3001). Interface: `HOST` (padrão 0.0.0.0).
 */
const port = Number(process.env.PORT ?? 3001);
const hostname = process.env.HOST ?? "0.0.0.0";

const server = serve({ fetch: createApp().fetch, port, hostname }, (info) => {
  console.log(`CarreiraPro backend ouvindo em http://${hostname}:${info.port}`);
});

// Encerramento limpo (deploys, Ctrl+C): para de aceitar conexões, espera as
// requisições em andamento e fecha o pool do banco.
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} recebido, encerrando…`);

  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();

  server.close(() => {
    closeDb().finally(() => process.exit(0));
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
