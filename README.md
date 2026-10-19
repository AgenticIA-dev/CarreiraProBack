# CarreiraPro — Backend

API do CarreiraPro: checkout/pagamento (Mercado Pago), IA (STAR/feedback do simulador),
transcrição de áudio, banco de perguntas, conta e administração. Servidor HTTP Node.js (Hono)
que só expõe uma API JSON — não serve nenhuma página de interface.

> Este projeto trabalha em conjunto com o **`carreirapro-frontend`**, que serve a interface e
> chama esta API por HTTP (inclusive para login). Os dois são deploys independentes.

## Documentação

Arquitetura, autenticação por Bearer token, lista de rotas, banco de dados, variáveis de
ambiente, segurança e pendências: [`docs/DOCUMENTATION.md`](./docs/DOCUMENTATION.md).

Deploy em servidor próprio (backend, frontend e PostgreSQL, com Nginx e PM2):
[`docs/DEPLOY.md`](./docs/DEPLOY.md).

## Quick start

```bash
npm install
cp .env.example .env         # preencher DATABASE_URL, JWT_SECRET etc.
npm run db:migrate           # cria as tabelas no PostgreSQL
npm run seed                 # popula o banco de perguntas
npm run user:create -- --email voce@exemplo.com --password "senha-forte" --admin
npm run dev                  # http://localhost:3001
```

Stack: Node.js · Hono · TypeScript · PostgreSQL + TypeORM · bcryptjs · jose (JWT) · nodemailer ·
Zod · Vitest · tsup.
