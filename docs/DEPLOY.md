# Deploy do CarreiraPro em servidor próprio

> Esta cópia do guia está no projeto **backend**; uma cópia idêntica vive no projeto
> **frontend** (`carreirapro-frontend/docs/DEPLOY.md`), porque o deploy envolve os dois
> projetos juntos.

Tudo roda em servidor(es) seus: o backend (Node.js), o frontend (Next.js, rodando com
`next start`) e o PostgreSQL. Este guia usa um único servidor Linux (Ubuntu) com Nginx na frente
dos dois apps e PM2 para mantê-los rodando — dá para separar em mais servidores depois, os
passos são os mesmos. O domínio continua registrado onde está (ex.: Hostinger), apontando para
o servidor via DNS.

## 0. Pré-requisitos

- Um servidor Linux com acesso SSH e IP público fixo (ex.: VPS da Hostinger ou máquina
  própria), com as portas 80 e 443 liberadas.
- Acesso ao painel DNS do domínio (ex.: hPanel → Domínios → DNS).
- Conta no Mercado Pago com uma aplicação criada (access token e segredo do webhook).
- Um servidor SMTP para os e-mails de convite pós-compra e recuperação de senha (o e-mail do
  próprio domínio serve).

## 1. Decidir os subdomínios

| Projeto | Subdomínio sugerido | Porta local | O que serve |
|---|---|---|---|
| `carreirapro-frontend` | `app.seudominio.com.br` (ou a raiz `seudominio.com.br`) | 3000 | a interface que o usuário acessa |
| `carreirapro-backend` | `api.seudominio.com.br` | 3001 | a API chamada pelo frontend e pelo Mercado Pago |

## 2. DNS

No painel DNS do domínio, crie registros **A** apontando para o IP do servidor:

- `app` (ou `@`, se o frontend ficar na raiz) → IP do servidor
- `api` → IP do servidor

Remova registros antigos em conflito para esses nomes. A propagação costuma levar de alguns
minutos a algumas horas — faça isso primeiro, porque o HTTPS (seção 7) depende dela.

## 3. Preparar o servidor

```bash
# Node.js 22, Nginx, PostgreSQL, Git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx postgresql git
sudo npm install -g pm2
```

## 4. Banco de dados (PostgreSQL)

```bash
sudo -u postgres psql -c "CREATE USER carreirapro WITH PASSWORD 'troque-esta-senha';"
sudo -u postgres psql -c "CREATE DATABASE carreirapro OWNER carreirapro;"
```

`DATABASE_URL` do backend fica `postgres://carreirapro:troque-esta-senha@localhost:5432/carreirapro`
(com `DATABASE_SSL=false`, já que a conexão é local). O PostgreSQL vem configurado para aceitar
só conexões locais — mantenha assim.

Faça backup regularmente, ex. com um cron diário:
`pg_dump -U carreirapro carreirapro | gzip > /var/backups/carreirapro-$(date +%F).sql.gz`.

## 5. Backend

```bash
git clone <repositório do backend> ~/carreirapro-backend && cd ~/carreirapro-backend
cp .env.example .env    # preencha (lista abaixo)
npm ci && npm run build
npm run db:migrate
npm run seed
npm run user:create -- --email voce@exemplo.com --password "senha-forte" --admin

pm2 start npm --name carreirapro-backend -- start
```

Variáveis do `.env` do backend (todas descritas em `.env.example`):

- `NODE_ENV=production`
- `DATABASE_URL` (seção 4)
- `JWT_SECRET` → segredo aleatório longo: `openssl rand -base64 48`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `EMAIL_FROM`
- `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `CHECKOUT_PRODUCT_PRICE_BRL` (após
  confirmar a seção 8 de `docs/DOCUMENTATION.md` do backend)
- `API_PUBLIC_URL` → `https://api.seudominio.com.br`
- `FRONTEND_ORIGIN` → `https://app.seudominio.com.br` (exata — sem isso, o CORS bloqueia todas
  as chamadas do navegador)
- `PORT=3001`, `HOST=127.0.0.1` (só o Nginx acessa a porta diretamente)
- `AI_PROVIDER_API_KEY` / `TRANSCRIPTION_PROVIDER_API_KEY` (opcionais; sem elas, usa os mocks)

## 6. Frontend

```bash
git clone <repositório do frontend> ~/carreirapro-frontend && cd ~/carreirapro-frontend
cp .env.example .env.local    # preencha (lista abaixo)
npm ci && npm run build

PORT=3000 pm2 start npm --name carreirapro-frontend -- start -- -H 127.0.0.1
pm2 save && pm2 startup       # os dois apps voltam sozinhos após reboot
```

Variáveis do `.env.local` do frontend:

- `NEXT_PUBLIC_API_URL` → `https://api.seudominio.com.br`
- `NEXT_PUBLIC_APP_URL` → `https://app.seudominio.com.br`
- `NEXT_PUBLIC_GA_ID` / `NEXT_PUBLIC_GTM_ID` / `NEXT_PUBLIC_META_PIXEL_ID` (opcionais)

**Importante:** variáveis `NEXT_PUBLIC_*` são gravadas no código durante o `npm run build`.
Mudou alguma? Rode `npm run build` de novo e `pm2 restart carreirapro-frontend`.

## 7. Nginx e HTTPS

`/etc/nginx/sites-available/carreirapro`:

```nginx
server {
  server_name api.seudominio.com.br;
  client_max_body_size 26m;   # upload de áudio do simulador (até 25 MB)
  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

server {
  server_name app.seudominio.com.br;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/carreirapro /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# HTTPS gratuito (Let's Encrypt), depois que o DNS da seção 2 propagar
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.seudominio.com.br -d app.seudominio.com.br
```

O `certbot` configura o redirecionamento HTTP → HTTPS e a renovação automática do certificado.

O backend usa o `X-Forwarded-For` definido pelo Nginx para o rate limit do checkout — por isso a
porta 3001 só deve ser acessível localmente (`HOST=127.0.0.1`, seção 5).

## 8. Verificar

- `https://api.seudominio.com.br/api/health` responde `{"ok":true,...}`.
- `https://app.seudominio.com.br` carrega, e o login com o admin criado na seção 5 funciona (o
  que confirma que o frontend está falando com o backend).
- `pm2 status` mostra os dois apps `online`; `pm2 logs` mostra os logs.

## 9. Pós-deploy

- No painel do Mercado Pago, configure o webhook com a URL do **backend**:
  `https://api.seudominio.com.br/api/webhooks/mercadopago`.
- Para atualizar cada projeto:
  - backend: `cd ~/carreirapro-backend && git pull && npm ci && npm run build && npm run db:migrate && pm2 restart carreirapro-backend`
  - frontend: `cd ~/carreirapro-frontend && git pull && npm ci && npm run build && pm2 restart carreirapro-frontend`

  Os dois são independentes — atualizar um não exige mexer no outro.

## Por que não a hospedagem compartilhada

A hospedagem compartilhada (PHP/estático) não mantém processos Node.js rodando — é só execução de
PHP e arquivos estáticos. Os dois projetos precisam de um processo Node sempre ativo (o backend
para a API e o webhook do Mercado Pago; o frontend para as páginas, o middleware de autenticação
e as rotas `/api/session/*`), por isso o servidor precisa ser uma VPS ou máquina própria.
