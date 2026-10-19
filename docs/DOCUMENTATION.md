# CarreiraPro — Backend (API)

> Este é o projeto **backend** do CarreiraPro, separado do frontend a pedido do usuário
> (15/10/2026). Antes, frontend e backend eram um único projeto Next.js; agora são dois
> deploys independentes que se comunicam por HTTP. Este documento descreve só o backend — o
> frontend tem seu próprio `docs/DOCUMENTATION.md`.

## 1. O que este projeto é

Um projeto Next.js 15 (App Router) **somente com Route Handlers** — não serve nenhuma página de
interface (as duas únicas páginas, `/` e nenhuma outra, existem só como checagem rápida). Toda a
lógica de negócio, integrações externas e acesso privilegiado ao banco (service role) vivem
aqui: checkout e pagamento (Mercado Pago), IA (STAR/feedback do simulador), transcrição de áudio,
banco de perguntas, conta do usuário e administração.

O projeto irmão, `carreirapro-frontend`, é quem serve a interface (páginas públicas, área do
usuário, admin). Ele chama este backend por HTTP para tudo — inclusive a autenticação — e não
tem nenhuma dependência do Supabase. Este backend é o único ponto que fala com o Supabase.

## 2. Por que a separação muda a autenticação

Quando era um projeto único, as rotas de API liam a sessão do usuário via cookies (o padrão
`@supabase/ssr`). Agora frontend e backend são origens diferentes, e cookies não atravessam
origens automaticamente (e não deveriam, por segurança). Por isso:

- Este backend **não usa cookies em nenhuma rota**. Toda rota autenticada exige o header
  `Authorization: Bearer <token>`, onde `<token>` é o access token da sessão Supabase do usuário
  (emitido por este backend em `/api/auth/login` ou `/api/auth/refresh`; o frontend o guarda em
  cookies do seu próprio domínio).
- `/api/auth/*` é o único lugar que fala com o Supabase Auth em nome do usuário (cliente anônimo,
  sem sessão persistida — `src/lib/supabase/authSession.ts`). Os links de e-mail (recuperação de
  senha e convite do webhook) usam o fluxo "implicit" e apontam para
  `FRONTEND_ORIGIN/redefinir-senha` — URL montada no servidor, nunca vinda do cliente; ela
  precisa estar nas Redirect URLs do Supabase Auth. O rate limit de login/recuperação é por
  e-mail, porque o login chega via servidor do frontend (mesmo IP para todos).
- `src/lib/supabase/apiAuth.ts` é o único lugar que decide autenticação/autorização:
  - `getAuthenticatedUser(request)` — exige um token válido (`supabase.auth.getUser(token)`
    verifica a assinatura contra o servidor do Supabase; nunca decodifica e confia sem validar).
  - `requireActiveApiUser(request)` — exige token válido **e** `status = "active"` no perfil
    (`public.users`). Esta checagem agora é feita explicitamente em cada rota de negócio, porque
    (diferente de antes) não há mais um middleware de página na frente destas rotas — esta API é
    alcançável diretamente, então a defesa em profundidade do PROMPT MESTRE (§11-12, §42) precisa
    estar na própria rota.
  - `requireAdminApiUser(request)` — igual, mas também exige `role = "admin"`.
- As consultas são feitas com um cliente Supabase construído com a chave anônima + esse mesmo
  token (`global.headers.Authorization`) — o Postgres aplica RLS exatamente como se o próprio
  usuário tivesse feito a consulta. A service role (que ignora RLS) só é usada em operações
  explicitamente administrativas (`/api/admin/**`, webhook, consulta de perfil para o middleware
  do frontend em `/api/account/me`) — nunca para "confiar" num usuário comum.
- Uma excepção técnica: `supabase.auth.updateUser()` (trocar senha) depende de uma sessão em
  memória (access + refresh token) que não temos aqui — só o access token chega do frontend. A
  rota `POST /api/account/password` por isso chama a API REST do GoTrue diretamente
  (`PUT /auth/v1/user` com `Authorization: Bearer <token>`), que aceita o access token sozinho.

## 3. Rotas de API

| Rota | Método | Autenticação | O que faz |
|---|---|---|---|
| `/api/health` | GET | nenhuma | checagem de disponibilidade |
| `/api/checkout/create-preference` | POST | nenhuma (rate limit por IP) | cria preferência de pagamento no Mercado Pago |
| `/api/webhooks/mercadopago` | POST | assinatura do Mercado Pago (`x-signature`) | processa notificação de pagamento, concede/revoga acesso |
| `/api/auth/login` | POST | nenhuma (rate limit por e-mail) | e-mail/senha → `{ session: { access_token, refresh_token, expires_in } }` |
| `/api/auth/refresh` | POST | refresh token no corpo | sessão nova (tokens rotacionados) |
| `/api/auth/logout` | POST | Bearer | revoga a sessão no Supabase Auth |
| `/api/auth/forgot-password` | POST | nenhuma (rate limit por e-mail) | envia e-mail de recuperação; resposta sempre genérica |
| `/api/auth/reset-password` | POST | Bearer (token do link de e-mail) | define nova senha (recuperação ou convite) |
| `/api/account/me` | GET | Bearer | devolve o perfil (status/role) — usado pelo frontend para gating |
| `/api/account/profile` | PATCH | Bearer + active | atualiza o nome |
| `/api/account/password` | POST | Bearer + active | altera a senha |
| `/api/account/data-requests` | GET/POST | Bearer + active | solicitações LGPD (art. 18) |
| `/api/consent` | POST | Bearer opcional | registra consentimento de cookies (aceita anônimo) |
| `/api/questions` | GET | Bearer + active | lista perguntas publicadas + favoritos do usuário |
| `/api/questions/[id]/favorite` | POST/DELETE | Bearer + active | favoritar/desfavoritar |
| `/api/star/generate` | POST | Bearer + active | gera resposta STAR (anti-alucinação) |
| `/api/interview/question` | POST | Bearer + active | inicia sessão do simulador |
| `/api/interview/transcribe` | POST | Bearer + active | transcreve áudio da resposta |
| `/api/interview/feedback` | POST | Bearer + active | gera feedback/pontuação |
| `/api/dashboard/readiness` | GET | Bearer + active | calcula a "prontidão de treinamento" do usuário |
| `/api/admin/stats` | GET | Bearer + active + admin | contagens para a home do admin |
| `/api/admin/users` | GET | Bearer + active + admin | lista usuários (service role) |
| `/api/admin/questions` | GET | Bearer + active + admin | lista todas as perguntas (service role) |

## 4. CORS

`src/middleware.ts` intercepta `/api/:path*` e aplica CORS globalmente: só a origem definida em
`FRONTEND_ORIGIN` pode chamar esta API pelo navegador (`Access-Control-Allow-Origin`), e o
preflight `OPTIONS` é respondido diretamente. Sem `FRONTEND_ORIGIN` configurada, o CORS falha de
forma fechada em produção (nenhuma origem liberada) e aberta (`*`) em desenvolvimento, para não
travar `npm run dev`. O webhook do Mercado Pago não passa por isso — é uma chamada
servidor-a-servidor, não afetada por CORS.

## 5. Stack

Next.js 15 (App Router, só Route Handlers) · TypeScript 5 (strict) · `@supabase/supabase-js` ·
Zod · Vitest.

## 6. Estrutura de diretórios

```
src/
  app/
    api/            checkout, webhooks, account, consent, questions, star, interview,
                     dashboard, admin, health
    layout.tsx, page.tsx   mínimos, só para satisfazer o App Router (ver seção 1)
  lib/
    ai/             AIProvider → MockAIProvider (padrão) ou OpenAIProvider
    transcription/  TranscriptionProvider → MockTranscriptionProvider ou WhisperTranscriptionProvider
    mercadopago/    client (preferências/pagamentos), verifyWebhook, mapStatus, types
    supabase/       serviceRole.ts (service role) e apiAuth.ts (autenticação via Bearer)
    security/       rateLimit.ts
    validation/     schemas.ts (Zod)
    scoring/        readiness.ts
  types/database.ts tipos do schema (mesmo arquivo do frontend — ver nota na seção 9)
  data/questions.seed.ts  fallback local se o Supabase não estiver configurado
supabase/migrations/      0001_init.sql — schema completo com RLS (fonte da verdade)
scripts/seed-questions.ts popula a tabela questions
tests/lib/                testes unitários (Vitest) dos fluxos críticos
```

## 7. Banco de dados

Ver `supabase/migrations/0001_init.sql` (fonte da verdade — inalterado pela separação dos
projetos). Tabelas: `users`, `purchases`, `questions`, `question_favorites`, `star_responses`,
`interview_sessions`, `consent_records`, `data_requests`, `webhook_events`. Todas com RLS
habilitado.

## 8. Checkout e webhook do Mercado Pago

Inalterado em relação à versão unificada, exceto que as `back_urls` da preferência agora apontam
para o domínio do **frontend** (`FRONTEND_ORIGIN`, páginas `/comprar/*`) e a `notification_url`
aponta para este próprio backend (`NEXT_PUBLIC_APP_URL` + `/api/webhooks/mercadopago`) — por isso
este projeto precisa conhecer as duas URLs.

**Pendência de verificação real — leia antes de produção.** A montagem exata da string
"manifest" assinada (`id:<data.id>;request-id:<x-request-id>;ts:<ts>;`) foi confirmada por uma
fonte secundária, não lida integralmente na documentação oficial (ver comentário em
`src/lib/mercadopago/types.ts`). Reconfirme em
`https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks`
antes de produção.

## 9. Nota sobre `src/types/database.ts` duplicado

Este arquivo existe idêntico nos dois projetos (backend e frontend), porque o frontend precisa
dos tipos para tipar a UI, mas não deve importar nenhum código do backend. Isso é duplicação
deliberada, não um erro — ao gerar tipos reais do Supabase (`npm run db:types`), gere nos dois
projetos e mantenha-os em sincronia manualmente (ou extraia para um pacote npm privado
compartilhado, se o projeto crescer a ponto de justificar um monorepo com workspaces).

## 10. Variáveis de ambiente

Ver `.env.example`. Nenhum valor real está commitado.

| Variável | Efeito se ausente |
|---|---|
| `FRONTEND_ORIGIN` | CORS rejeita todas as origens em produção (API fica inacessível pelo navegador do frontend). |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Toda rota autenticada falha ao validar o token. |
| `SUPABASE_SERVICE_ROLE_KEY` | Webhook e rotas `/api/admin/**` não funcionam. |
| `MERCADOPAGO_ACCESS_TOKEN` | Criação de preferência e consulta de pagamento falham. |
| `MERCADOPAGO_WEBHOOK_SECRET` | Webhook responde 503 (rejeita tudo) até ser configurado. |
| `CHECKOUT_PRODUCT_PRICE_BRL` | Rota de criação de preferência responde 500. |
| `NEXT_PUBLIC_APP_URL` | `notification_url` do Mercado Pago fica inválida; criação de preferência responde 500. |
| `AI_PROVIDER` / `AI_PROVIDER_API_KEY` | Sem chave, usa `MockAIProvider`. |
| `TRANSCRIPTION_PROVIDER` / `TRANSCRIPTION_PROVIDER_API_KEY` | Sem chave, usa `MockTranscriptionProvider`. |

## 11. Segurança

Autenticação por Bearer token (nunca cookies) com validação server-side a cada chamada (seção 2);
service role restrita a `serviceRole.ts` e usada só em rotas explicitamente administrativas;
preço do checkout sempre definido no servidor; validação de todo input com Zod; CORS fechado por
origem (seção 4); webhook com validação de assinatura + idempotência + rate limiting; comparação
de tokens em tempo constante (`timingSafeEqual`); mensagens de erro sempre genéricas para o
cliente.

**Limitação conhecida:** o rate limiting (`src/lib/security/rateLimit.ts`) é em memória do
processo — adequado para uma única instância, mas não compartilhado entre instâncias serverless
em produção.

## 12. Testes

`tests/lib/*.test.ts` (Vitest): validação de assinatura/idempotência do webhook
(`verifyWebhook.test.ts`), mapeamento de status (`mapStatus.test.ts`), anti-alucinação da IA
(`mockAIProvider.test.ts`), cálculo de prontidão (`readiness.test.ts`), rate limiting
(`rateLimit.test.ts`) e schemas de validação (`validation.test.ts`). Rodar com `npm test`.

**Não executados neste ambiente** — ver seção 14.

## 13. Deploy

1. Criar um projeto Supabase e rodar `supabase/migrations/0001_init.sql`.
2. Preencher as variáveis de `.env.example` no ambiente de deploy deste backend.
3. Rodar `npx tsx scripts/seed-questions.ts` para popular o banco de perguntas.
4. Criar a aplicação no painel do Mercado Pago, configurar o webhook apontando para
   `https://SEU_DOMINIO_DO_BACKEND/api/webhooks/mercadopago`.
5. Fazer o deploy deste projeto (Vercel ou outro host Node) **separadamente** do frontend —
   cada um é seu próprio projeto/deploy, com sua própria URL.
6. No projeto **frontend**, configurar `NEXT_PUBLIC_API_URL` com a URL deste backend.
7. Aqui no backend, configurar `FRONTEND_ORIGIN` com a URL exata do frontend.

Ver `docs/DEPLOY_VERCEL_HOSTINGER.md` para o passo a passo completo de hospedagem (Vercel +
domínio na Hostinger), agora cobrindo os dois projetos.

## 14. Pendências que dependem de credenciais/decisão humana

- **Supabase**: nenhum projeto real foi criado neste ambiente (sem acesso de rede). Schema e RLS
  prontos em `supabase/migrations/0001_init.sql`.
- **Mercado Pago**: `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` e o preço real
  (`CHECKOUT_PRODUCT_PRICE_BRL`) precisam ser configurados; reconfirmar o manifest assinado (seção
  8) contra a doc oficial antes de produção.
- **Provedor de IA/transcrição**: sem credenciais, roda inteiramente sobre os providers mock.
- **Instalação de dependências e build/lint/test**: este ambiente de desenvolvimento teve acesso
  de rede ao `registry.npmjs.org` bloqueado (403), então não foi possível rodar `npm install`,
  `npm run build/lint/test` aqui. Em substituição, todo o código foi verificado com um checker de
  sintaxe TypeScript (compilador oficial, modo transpile), sem nenhum erro — mas isso não
  substitui `tsc --noEmit`, `next build`, `eslint` e `vitest run` reais, que precisam rodar no
  ambiente do usuário ou no build da hospedagem.

## 15. Como executar

```bash
npm install
cp .env.example .env.local   # preencher com valores reais
npm run dev                  # http://localhost:3001

npm run lint
npm run typecheck
npm test
npm run build && npm start
```
