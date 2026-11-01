import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { closeDb } from "./lib/db/dataSource";

/**
 * Ponto de entrada do servidor HTTP.
 *
 *   npm run dev     # tsx watch, recarrega a cada edição
 *   npm start       # dist/server.js (gerado por `npm run build`)
 *
 * Porta: `PORT` (padrão 3001). Interface: `HOST` (padrão: todas as
 * interfaces, IPv4 e IPv6).
 *
 * Por que não "0.0.0.0" por padrão: no Windows (e em Node >= 17), `localhost`
 * resolve primeiro para o IPv6 `::1`. Escutando só em IPv4, toda chamada do
 * frontend para `http://localhost:3001` tentava `::1`, falhava e só então
 * caía para 127.0.0.1 — atraso em CADA requisição durante o desenvolvimento.
 * Sem `HOST`, o Node escuta em `::` (dual-stack), atendendo os dois.
 * Em produção continue usando `HOST=127.0.0.1` atrás do Nginx (docs/DEPLOY.md).
 */
const port = Number(process.env.PORT ?? 3001);
const hostname = process.env.HOST?.trim() || undefined;

const server = serve({ fetch: createApp().fetch, port, hostname }, (info) => {
  console.log(`VoceUP backend ouvindo em http://${hostname ?? "localhost"}:${info.port}`);
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
