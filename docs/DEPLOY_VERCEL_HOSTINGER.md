# Deploy do CarreiraPro (backend + frontend) na Vercel, com domínio na Hostinger

> Esta cópia do guia está no projeto **backend**; uma cópia idêntica vive no projeto
> **frontend** (`carreirapro-frontend/docs/DEPLOY_VERCEL_HOSTINGER.md`), porque o deploy envolve
> os dois projetos juntos. Depois da separação em dois projetos (15/10/2026), cada um é um
> **projeto Vercel próprio**, com sua própria URL — este guia cobre os dois.

Este guia cobre o caminho escolhido: os dois projetos rodam na Vercel (criadora do Next.js —
suporte nativo a Server Components, rotas de API, middleware e webhooks, sem necessidade de
servidor customizado), e o domínio comprado/registrado na Hostinger continua lá, apontando para
a Vercel via DNS — um subdomínio para cada projeto. Você não precisa transferir o domínio nem
mudar de registrador.

## 0. Pré-requisitos

- Conta na [vercel.com](https://vercel.com) (plano gratuito "Hobby" é suficiente para começar;
  você vai criar **dois projetos Vercel**, um para `carreirapro-backend` e outro para
  `carreirapro-frontend`).
- Projeto Supabase criado, com `supabase/migrations/0001_init.sql` aplicado (ver
  `docs/DOCUMENTATION.md` do backend, seções 7 e 14).
- Acesso ao painel da Hostinger onde o domínio está registrado (hPanel → Domínios → DNS /
  Nameservers).
- Conta no Mercado Pago com uma aplicação criada (para o access token e o segredo do webhook).

## 1. Decidir os subdomínios

Cada projeto precisa da sua própria URL. Sugestão (ajuste ao seu domínio real):

| Projeto | Subdomínio sugerido | O que serve |
|---|---|---|
| `carreirapro-frontend` | `app.seudominio.com.br` (ou a raiz `seudominio.com.br`) | a interface que o usuário acessa |
| `carreirapro-backend` | `api.seudominio.com.br` | a API chamada pelo frontend e pelo Mercado Pago |

## 2. Subir o código para repositórios Git

Os dois projetos são independentes — cada um com seu próprio repositório (ou duas pastas no
mesmo repositório, apontadas como **Root Directory** diferentes em dois projetos Vercel; ambas
as formas funcionam, a Vercel lida bem com as duas).

```bash
# backend
cd carreirapro-backend
git init && git add . && git commit -m "CarreiraPro backend — versão inicial"
# crie um repositório vazio no GitHub e siga as instruções de git remote add origin / git push

# frontend
cd ../carreirapro-frontend
git init && git add . && git commit -m "CarreiraPro frontend — versão inicial"
# idem, em outro repositório
```

## 3. Deploy do backend na Vercel

1. Em [vercel.com/new](https://vercel.com/new), importe o repositório do backend.
2. A Vercel detecta Next.js automaticamente.
3. Antes de clicar em **Deploy**, adicione as variáveis de ambiente (copie os nomes de
   `.env.example` deste projeto):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `CHECKOUT_PRODUCT_PRICE_BRL` (após
     confirmar a seção 8 de `docs/DOCUMENTATION.md`)
   - `NEXT_PUBLIC_APP_URL` → `https://api.seudominio.com.br` (a URL final deste backend)
   - `FRONTEND_ORIGIN` → `https://app.seudominio.com.br` (a URL final do frontend — sem isso, o
     CORS bloqueia todas as chamadas do navegador)
   - `AI_PROVIDER_API_KEY` / `TRANSCRIPTION_PROVIDER_API_KEY` (opcionais)
4. Clique em **Deploy**.
5. Em **Settings → Domains**, adicione `api.seudominio.com.br` e siga a seção 6 (DNS).

## 4. Deploy do frontend na Vercel

1. Em [vercel.com/new](https://vercel.com/new), importe o repositório do frontend (**um segundo
   projeto Vercel**, separado do backend).
2. Variáveis de ambiente (copie de `.env.example` do frontend):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_API_URL` → `https://api.seudominio.com.br` (a URL do backend do passo 3)
   - `NEXT_PUBLIC_APP_URL` → `https://app.seudominio.com.br` (a URL final deste frontend)
   - `NEXT_PUBLIC_GA_ID` / `NEXT_PUBLIC_GTM_ID` / `NEXT_PUBLIC_META_PIXEL_ID` (opcionais)
3. Clique em **Deploy**.
4. Em **Settings → Domains**, adicione `app.seudominio.com.br` (ou a raiz do domínio) e siga a
   seção 6 (DNS).

> Ordem importa pouco entre os passos 3 e 4, mas você só vai saber a URL final de cada um depois
> de criado o projeto na Vercel — por isso, se preferir, crie os dois projetos primeiro (sem as
> variáveis que dependem um do outro), anote as URLs, e só então preencha `NEXT_PUBLIC_API_URL`
> (no frontend) e `FRONTEND_ORIGIN` (no backend) e faça um novo deploy de cada.

## 5. Alternativa: deploy via CLI (sem GitHub)

```bash
npm install -g vercel

cd carreirapro-backend
vercel login
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL production
# repita vercel env add para cada variável de .env.example deste projeto
vercel --prod

cd ../carreirapro-frontend
vercel link
vercel env add NEXT_PUBLIC_API_URL production
# repita para cada variável de .env.example deste projeto
vercel --prod
```

## 6. Configurar o DNS no hPanel da Hostinger

Para cada subdomínio, a Vercel mostra (em **Settings → Domains** de cada projeto) o registro DNS
exato — use sempre o valor que a tela mostrar.

1. Acesse **hPanel → Domínios → [seu domínio] → DNS / Nameservers**.
2. Confirme que o domínio está usando os **nameservers da própria Hostinger** (não precisa
   trocar para os da Vercel — você vai editar os registros manualmente).
3. Na Zona DNS, adicione:
   - Para o **frontend** (ex.: raiz do domínio ou `app`): registro **A** (`@`) apontando para o
     IP que a Vercel mostrou (padrão `76.76.21.21`), ou **CNAME** (`app`) apontando para
     `cname.vercel-dns.com`, dependendo do subdomínio escolhido.
   - Para o **backend** (`api`): registro **CNAME**, host `api`, apontando para
     `cname.vercel-dns.com` (ou o valor exato que a Vercel mostrou para aquele projeto).
4. Remova registros antigos em conflito.
5. Salve. A propagação de DNS normalmente leva de alguns minutos a algumas horas.

## 7. Verificar

Em cada projeto na Vercel (**Settings → Domains**), aguarde o status mudar para "Valid
Configuration" — a Vercel confirma a propriedade do domínio e emite automaticamente o
certificado SSL (HTTPS). Depois disso, abra `https://app.seudominio.com.br` e confirme que a
página carrega e que o login funciona (o que já confirma que o frontend está conseguindo falar
com o backend).

## 8. Pós-deploy

- Atualize o webhook no painel do Mercado Pago com a URL final do **backend**:
  `https://api.seudominio.com.br/api/webhooks/mercadopago`.
- Rode `npx tsx scripts/seed-questions.ts` (no projeto backend, com `SUPABASE_SERVICE_ROLE_KEY`
  apontando para o Supabase de produção) para popular o banco de perguntas, se ainda não tiver
  feito.
- Cada novo `git push` na branch principal de cada repositório gera um novo deploy automático
  daquele projeto na Vercel — os dois são independentes (um push no frontend não rebuilda o
  backend, e vice-versa).

## Por que não a hospedagem compartilhada da Hostinger

A hospedagem compartilhada (PHP/estático) não mantém um processo Node.js rodando para atender
Server Components, rotas de API, middleware de autenticação e o webhook do Mercado Pago — é só
execução de PHP e arquivos estáticos. Isso vale para os dois projetos (frontend e backend). O
domínio continua 100% seu e continua registrado na Hostinger; só os dois apps rodam na Vercel,
que é a infraestrutura pensada para aplicações Next.js.
