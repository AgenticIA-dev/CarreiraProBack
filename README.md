# CarreiraPro — Backend

API do CarreiraPro: checkout/pagamento (Mercado Pago), IA (STAR/feedback do simulador),
transcrição de áudio, banco de perguntas, conta e administração. Projeto Next.js somente com
Route Handlers — não serve nenhuma página de interface.

> Este projeto trabalha em conjunto com o **`carreirapro-frontend`**, que serve a interface e a
> autenticação e chama esta API por HTTP. Os dois são deploys independentes.

## Documentação

Arquitetura, autenticação por Bearer token, lista de rotas, banco de dados, variáveis de
ambiente, segurança e pendências: [`docs/DOCUMENTATION.md`](./docs/DOCUMENTATION.md).

Deploy (Vercel + domínio na Hostinger, cobrindo os dois projetos):
[`docs/DEPLOY_VERCEL_HOSTINGER.md`](./docs/DEPLOY_VERCEL_HOSTINGER.md).

## Quick start

```bash
npm install
cp .env.example .env.local   # preencher com valores reais
npm run dev                  # http://localhost:3001
```

Stack: Next.js 15 (API-only) · TypeScript · `@supabase/supabase-js` · Zod · Vitest.
