# CarreiraPro — Backend (API)

> Este é o projeto **backend** do CarreiraPro, separado do frontend a pedido do usuário
> (15/10/2026). Antes, frontend e backend eram um único projeto Next.js; agora são dois
> deploys independentes que se comunicam por HTTP. Este documento descreve só o backend — o
> frontend tem seu próprio `docs/DOCUMENTATION.md`.

## 1. O que este projeto é

Um servidor HTTP **Node.js** (framework [Hono](https://hono.dev) sobre `@hono/node-server`) que
só expõe uma API JSON — não serve nenhuma página de interface. Toda a lógica de negócio,
integrações externas, a autenticação e todo o acesso ao banco (PostgreSQL, via TypeORM) vivem
aqui: checkout e pagamento (Mercado Pago), IA (STAR/feedback do simulador), transcrição de
áudio, banco de perguntas, conta do usuário e administração.

O projeto irmão, `carreirapro-frontend`, é quem serve a interface (páginas públicas, área do
usuário, admin). Ele chama este backend por HTTP para tudo — inclusive a autenticação — e não
acessa o banco. Este backend é o único ponto que fala com o PostgreSQL.

> **Migração Supabase → PostgreSQL/TypeORM (19/10/2026).** O projeto usava o Supabase para o
> banco (com RLS) e para a autenticação (Supabase Auth). Agora o banco é um PostgreSQL comum,
> acessado via TypeORM, e a autenticação é própria (seção 2). O contrato da API com o frontend
> não mudou, exceto em `POST /api/auth/reset-password`, que recebe o token do link no corpo.

> **Next.js removido (19/10/2026).** Até então este backend era um projeto Next.js só com Route
> Handlers. Agora é uma aplicação Node.js comum: sem Next.js, React, páginas ou build do Next.
> As rotas, os caminhos (`/api/...`) e o formato das respostas são os mesmos.

## 2. Autenticação

Frontend e backend são origens diferentes, então este backend **não usa cookies em nenhuma
rota**: toda rota autenticada exige `Authorization: Bearer <access_token>`. O frontend guarda os
tokens em cookies do seu próprio domínio.

Peças (todas em `src/lib/auth/`):

- **Senhas** (`password.ts`): hash bcrypt (custo 12) em `users.password_hash`. A coluna é
  `select: false` na entidade, então nunca é carregada (nem devolvida pela API) sem pedido
  explícito. O login gasta o mesmo tempo para e-mail inexistente, para não revelar contas.
- **Access token** (`accessToken.ts`): JWT HS256 assinado com `JWT_SECRET`, válido por 1 hora
  (`sub` = id do usuário). Validado pela assinatura e expiração, sem consulta ao banco.
- **Refresh token e links de e-mail** (`authTokens.ts`): tokens opacos aleatórios (256 bits) na
  tabela `auth_tokens`, que guarda só o SHA-256 de cada um.
  - `refresh` (30 dias): rotacionado a cada `/api/auth/refresh`. O token antigo ainda é aceito
    por 10 segundos, porque o frontend pode renovar em paralelo várias requisições com o mesmo
    token. `/api/auth/logout` revoga todos os refresh tokens do usuário.
  - `password_reset` (1 hora) e `invite` (7 dias): de uso único (consumidos por um `UPDATE ...
    WHERE consumed_at IS NULL` atômico). Pedir um link novo invalida os de recuperação
    anteriores. Redefinir a senha pelo link encerra todas as sessões abertas.
- **Links de e-mail** (`session.ts` → `buildPasswordSetupUrl`): apontam para
  `FRONTEND_ORIGIN/redefinir-senha#token=<token>`. A URL é montada no servidor, nunca vinda do
  cliente. O token vai no fragmento, que não é enviado a servidores nem aparece em logs.
- **E-mails** (`src/lib/email/mailer.ts`): SMTP via nodemailer (`SMTP_*`, `EMAIL_FROM`). Sem
  `SMTP_HOST`, em desenvolvimento o e-mail é impresso no console; em produção é erro.
- **Autorização** (`apiAuth.ts`), o único lugar que decide acesso:
  - `getAuthenticatedUser(request)`: token válido **e** usuário existente (perfil relido do
    banco a cada chamada).
  - `requireActiveApiUser(request)`: além disso, exige `status = "active"`. A checagem é feita
    em cada rota de negócio, porque esta API é alcançável diretamente, sem o middleware do
    frontend (PROMPT MESTRE §11-12, §42).
  - `requireAdminApiUser(request)`: também exige `role = "admin"`.

**Sem RLS.** O banco é acessado só por este backend, com um único usuário de conexão, e não sabe
quem é o usuário final. O isolamento entre usuários é responsabilidade das rotas: **toda consulta
a dados do usuário filtra por `auth.userId`** (ex.: `findOneBy({ id, user_id: auth.userId })`).
Ao criar uma rota nova, mantenha esse padrão.

O rate limit de login/recuperação é por e-mail, porque o login chega via servidor do frontend
(mesmo IP para todos).

## 3. Rotas de API

| Rota | Método | Autenticação | O que faz |
|---|---|---|---|
| `/api/health` | GET | nenhuma | checagem de disponibilidade |
| `/api/checkout/create-preference` | POST | nenhuma (rate limit por IP) | cria preferência de pagamento no Mercado Pago |
| `/api/webhooks/mercadopago` | POST | assinatura do Mercado Pago (`x-signature`) | processa notificação de pagamento, concede/revoga acesso |
| `/api/auth/login` | POST | nenhuma (rate limit por e-mail) | e-mail/senha → `{ session: { access_token, refresh_token, expires_in } }` |
| `/api/auth/refresh` | POST | refresh token no corpo | sessão nova (tokens rotacionados) |
| `/api/auth/logout` | POST | Bearer | revoga todos os refresh tokens do usuário |
| `/api/auth/forgot-password` | POST | nenhuma (rate limit por e-mail) | envia e-mail de recuperação; resposta sempre genérica |
| `/api/auth/reset-password` | POST | `token` do link de e-mail no corpo | define nova senha (recuperação ou convite) |
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
| `/api/admin/users` | GET | Bearer + active + admin | lista usuários |
| `/api/admin/questions` | GET | Bearer + active + admin | lista todas as perguntas |

## 4. CORS

O middleware `cors` (`src/lib/http/cors.ts`, registrado em `src/app.ts`) intercepta `/api/*` e
aplica CORS globalmente: só a origem definida em
`FRONTEND_ORIGIN` pode chamar esta API pelo navegador (`Access-Control-Allow-Origin`), e o
preflight `OPTIONS` é respondido diretamente. Sem `FRONTEND_ORIGIN` configurada, o CORS falha de
forma fechada em produção (nenhuma origem liberada) e aberta (`*`) em desenvolvimento, para não
travar `npm run dev`. O webhook do Mercado Pago não passa por isso — é uma chamada
servidor-a-servidor, não afetada por CORS.

## 5. Stack

Node.js 20+ · Hono (`@hono/node-server`) · TypeScript 5 (strict) · PostgreSQL 13+ · TypeORM
(`EntitySchema`, sem decorators) · `pg` · bcryptjs · jose (JWT) · nodemailer · Zod · Vitest.
Build com tsup (esbuild); desenvolvimento com tsx.

**Como as rotas são montadas.** Cada arquivo em `src/routes/` exporta funções `GET`/`POST`/...
que recebem um `Request` e devolvem um `Response` (APIs web padrão, sem dependência do Hono).
`src/app.ts` só associa caminho e método a cada uma, e aplica o que vale para todas: CORS,
cabeçalhos de segurança (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`), limite
de tamanho do corpo (1 MB; 25 MB em `/api/interview/transcribe`), 404 e erro 500 genérico em JSON.
Para criar uma rota: escreva o handler em `src/routes/` e registre-o em `src/app.ts`.

## 6. Estrutura de diretórios

```
src/
  server.ts         ponto de entrada: sobe o servidor HTTP (PORT/HOST) e encerra com limpeza
  app.ts            aplicação Hono: middlewares globais + tabela de rotas
  routes/           handlers (Request → Response): auth, account, admin, checkout, consent,
                     dashboard, interview, questions, star, webhooks
  lib/
    http/           cors.ts (CORS e cabeçalhos de segurança)
    db/             dataSource.ts (conexão), entities.ts (EntitySchemas), migrations/
    auth/           apiAuth.ts, accessToken.ts, authTokens.ts, password.ts, session.ts
    email/          mailer.ts (SMTP + modelos de e-mail)
    ai/             AIProvider → MockAIProvider (padrão) ou OpenAIProvider
    transcription/  TranscriptionProvider → MockTranscriptionProvider ou WhisperTranscriptionProvider
    mercadopago/    client (preferências/pagamentos), verifyWebhook, mapStatus, types
    security/       rateLimit.ts
    validation/     schemas.ts (Zod)
    scoring/        readiness.ts
  types/database.ts tipos das linhas do banco (ver nota na seção 9)
  data/questions.seed.ts  conteúdo das perguntas (seed e fallback se o banco não estiver acessível)
scripts/
  migrate.ts        aplica/desfaz migrations (npm run db:migrate / db:migrate:revert)
  seed-questions.ts popula a tabela questions (npm run seed)
  create-user.ts    cria/atualiza um usuário ativo, ex.: o primeiro admin (npm run user:create)
tests/lib/          testes unitários (Vitest) dos fluxos críticos
```

## 7. Banco de dados

PostgreSQL 13+ (usa `gen_random_uuid()` nativo, `jsonb`, `text[]` e enums). O schema é definido
pelas migrations em `src/lib/db/migrations/` (fonte da verdade). A primeira,
`1760900000000-Init.ts`, foi portada do antigo `supabase/migrations/0001_init.sql`, com estas
diferenças:

- `users.id` é gerado pelo próprio banco (antes vinha de `auth.users`), e há uma coluna nova
  `users.password_hash`.
- Tabela nova `auth_tokens` (seção 2).
- Sem RLS, policies e o trigger de criação de perfil do Supabase Auth.

Tabelas: `users`, `auth_tokens`, `purchases`, `questions`, `question_favorites`,
`star_responses`, `interview_sessions`, `consent_records`, `data_requests`, `webhook_events`
(mais `typeorm_migrations`, que registra as migrations aplicadas).

As entidades (`src/lib/db/entities.ts`) usam os mesmos nomes de coluna (snake_case) como nomes
de propriedade, então o JSON da API tem o mesmo formato da época do Supabase. `synchronize` fica
sempre desligado: para mudar o schema, crie uma migration nova em `src/lib/db/migrations/` e
adicione-a à lista `migrations` em `dataSource.ts`.

```bash
npm run db:migrate          # aplica as migrations pendentes
npm run db:migrate:revert   # desfaz a última
npm run seed                # popula as perguntas
npm run user:create -- --email admin@exemplo.com --password "..." --admin
```

Os scripts leem `.env.local` automaticamente, se existir.

## 8. Checkout e webhook do Mercado Pago

Inalterado em relação à versão unificada, exceto que as `back_urls` da preferência agora apontam
para o domínio do **frontend** (`FRONTEND_ORIGIN`, páginas `/comprar/*`) e a `notification_url`
aponta para este próprio backend (`API_PUBLIC_URL` + `/api/webhooks/mercadopago`) — por isso
este projeto precisa conhecer as duas URLs.

**Pendência de verificação real — leia antes de produção.** A montagem exata da string
"manifest" assinada (`id:<data.id>;request-id:<x-request-id>;ts:<ts>;`) foi confirmada por uma
fonte secundária, não lida integralmente na documentação oficial (ver comentário em
`src/lib/mercadopago/types.ts`). Reconfirme em
`https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks`
antes de produção.

## 9. Nota sobre `src/types/database.ts` duplicado

Os tipos das linhas existem nos dois projetos (backend e frontend), porque o frontend precisa
deles para tipar a UI, mas não deve importar nenhum código do backend. Duplicação deliberada.
Diferenças: no backend as datas são `Date | string` (o TypeORM devolve `Date`), e há tipos só
internos (`UserWithPasswordRow`, `AuthTokenRow`). No frontend, as datas são `string` (formato
JSON). Ao mudar o schema, atualize os dois manualmente.

## 10. Variáveis de ambiente

Ver `.env.example`. Nenhum valor real está commitado. O servidor e os scripts (`npm run ...`)
leem `.env` e depois `.env.local` (que tem precedência); variáveis já definidas no ambiente do
processo têm precedência sobre os dois arquivos.

| Variável | Efeito se ausente |
|---|---|
| `FRONTEND_ORIGIN` | CORS rejeita todas as origens em produção (API fica inacessível pelo navegador do frontend). |
| `DATABASE_URL` | Nenhuma rota que usa o banco funciona (`/api/questions` cai no conteúdo semente local). |
| `DATABASE_SSL` / `DATABASE_SSL_REJECT_UNAUTHORIZED` | Conexão sem SSL (adequado para banco na mesma máquina; defina `DATABASE_SSL=true` se o banco estiver em outro servidor). |
| `DATABASE_POOL_MAX` | Pool de 5 conexões por instância. |
| `JWT_SECRET` | Login, refresh e toda rota autenticada falham (erro de configuração). Mínimo de 32 caracteres. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_SECURE` / `EMAIL_FROM` | Sem `SMTP_HOST`: em produção, e-mails de recuperação e convite não são enviados (erro no log); em desenvolvimento, são impressos no console. |
| `MERCADOPAGO_ACCESS_TOKEN` | Criação de preferência e consulta de pagamento falham. |
| `MERCADOPAGO_WEBHOOK_SECRET` | Webhook responde 503 (rejeita tudo) até ser configurado. |
| `CHECKOUT_PRODUCT_PRICE_BRL` | Rota de criação de preferência responde 500. |
| `API_PUBLIC_URL` (nome antigo, ainda aceito: `NEXT_PUBLIC_APP_URL`) | `notification_url` do Mercado Pago fica inválida; criação de preferência responde 500. |
| `PORT` / `HOST` | Servidor escuta em `0.0.0.0:3001`. |
| `AI_PROVIDER` / `AI_PROVIDER_API_KEY` | Sem chave, usa `MockAIProvider`. |
| `TRANSCRIPTION_PROVIDER` / `TRANSCRIPTION_PROVIDER_API_KEY` | Sem chave, usa `MockTranscriptionProvider`. |

## 11. Segurança

Autenticação por Bearer token (nunca cookies) com validação server-side a cada chamada (seção 2);
senhas com bcrypt; refresh tokens e links guardados só como hash, com rotação e uso único;
isolamento entre usuários feito nas rotas, filtrando sempre por `user_id` (não há RLS); preço do
checkout sempre definido no servidor; validação de todo input com Zod; CORS fechado por origem
(seção 4); webhook com validação de assinatura, idempotência e rate limiting; comparação de
tokens em tempo constante (`timingSafeEqual`); mensagens de erro sempre genéricas para o cliente.

**Limitações conhecidas:**

- O rate limiting (`src/lib/security/rateLimit.ts`) é em memória do processo: adequado para uma
  única instância, mas não compartilhado entre várias instâncias.
- O IP usado no rate limit do checkout vem do header `X-Forwarded-For`. Rode o servidor atrás de
  um proxy reverso (Nginx) que defina esse header, com a porta do app acessível só localmente;
  exposto diretamente, um cliente pode forjá-lo e contornar o limite.
- O access token não é revogável antes de expirar (1 hora): logout e troca de senha revogam os
  refresh tokens, mas um access token já emitido continua válido até expirar.

## 12. Testes

`tests/lib/*.test.ts` (Vitest): validação de assinatura/idempotência do webhook
(`verifyWebhook.test.ts`), mapeamento de status (`mapStatus.test.ts`), anti-alucinação da IA
(`mockAIProvider.test.ts`), cálculo de prontidão (`readiness.test.ts`), rate limiting
(`rateLimit.test.ts`) e schemas de validação (`validation.test.ts`). Rodar com `npm test`.

Os fluxos de banco e autenticação foram verificados manualmente contra um PostgreSQL real
durante a migração (login, refresh, logout, recuperação de senha por SMTP, webhook com convite,
isolamento entre usuários), mas não há testes automatizados de integração com o banco.

## 13. Deploy

Roda em servidor próprio com Node.js 20+ (VPS ou máquina própria), com PM2 e Nginx na frente.
O passo a passo completo, incluindo PostgreSQL, frontend, DNS e HTTPS, está em `docs/DEPLOY.md`.
Em resumo:

1. Criar um banco PostgreSQL 13+ e definir `DATABASE_URL` (e `DATABASE_SSL=true`, se o banco
   estiver em outra máquina e exigir SSL).
2. Preencher as variáveis de `.env.example` num `.env` ao lado do projeto, incluindo `JWT_SECRET` (ex.: `openssl rand -base64 48`),
   as credenciais SMTP, `FRONTEND_ORIGIN` (URL exata do frontend) e `API_PUBLIC_URL` (URL
   pública deste backend).
3. `npm ci && npm run build`
4. `npm run db:migrate` (a cada deploy; aplica só as migrations novas) e, na primeira vez,
   `npm run seed` e `npm run user:create -- --email ... --password ... --admin`.
5. `npm start` (escuta em `PORT`, padrão 3001), mantido por um gerenciador de processos (PM2
   ou systemd), atrás de um proxy reverso com HTTPS (Nginx).
6. No painel do Mercado Pago, configurar o webhook para
   `https://SEU_DOMINIO_DO_BACKEND/api/webhooks/mercadopago`.
7. No projeto **frontend**, configurar `NEXT_PUBLIC_API_URL` com a URL deste backend.

O servidor trata `SIGTERM`/`SIGINT`: para de aceitar conexões, termina as requisições em
andamento e fecha o pool do banco (com limite de 10 segundos).

## 14. Pendências que dependem de credenciais/decisão humana

- **Banco de dados**: criar o PostgreSQL de produção no servidor (`docs/DEPLOY.md`, seção 4).
- **SMTP**: escolher um provedor de e-mail transacional (ex.: Resend, SendGrid, Amazon SES,
  Brevo, ou o SMTP da Hostinger) e configurar `SMTP_*`/`EMAIL_FROM`. Sem isso, compradores não
  recebem o convite para criar a senha.
- **Mercado Pago**: `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` e o preço real
  (`CHECKOUT_PRODUCT_PRICE_BRL`) precisam ser configurados; reconfirmar o manifest assinado (seção
  8) contra a doc oficial antes de produção.
- **Provedor de IA/transcrição**: sem credenciais, roda inteiramente sobre os providers mock.
- **Webhook com erro não é reprocessado**: se o processamento de um evento falha (500), o
  reenvio do Mercado Pago cai na checagem de idempotência e é ignorado (comportamento anterior à
  migração, mantido). Eventos com `status = 'error'` em `webhook_events` precisam de
  reprocessamento manual.

## 15. Como executar

```bash
npm install
cp .env.example .env         # preencher DATABASE_URL, JWT_SECRET etc.
npm run db:migrate
npm run seed
npm run user:create -- --email voce@exemplo.com --password "senha-forte" --admin
npm run dev                  # http://localhost:3001 (recarrega a cada edição)

npm run lint
npm run typecheck
npm test
npm run build && npm start   # build de produção em dist/
```

Para um PostgreSQL local rápido: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres
-e POSTGRES_DB=carreirapro postgres:17` e
`DATABASE_URL=postgres://postgres:postgres@localhost:5432/carreirapro`.