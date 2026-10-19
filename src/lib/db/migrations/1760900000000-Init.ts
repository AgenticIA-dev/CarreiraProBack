import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Schema inicial do CarreiraPro (PostgreSQL 13+).
 *
 * Portado de `supabase/migrations/0001_init.sql`, com as diferenças da saída
 * do Supabase:
 *  - `users` não depende mais de `auth.users`: o id é gerado aqui e a senha
 *    (hash bcrypt) fica em `users.password_hash`.
 *  - Nova tabela `auth_tokens` (refresh tokens, links de senha e convite).
 *  - Sem RLS/policies: o banco é acessado apenas pelo backend, com um único
 *    usuário de conexão. O controle de acesso por usuário (cada um só vê seus
 *    próprios dados) é feito nas rotas, sempre filtrando por `user_id`.
 */
export class Init1760900000000 implements MigrationInterface {
  name = "Init1760900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      -- gen_random_uuid() é nativo a partir do PostgreSQL 13 (sem extensão).

      -- ---------------------------------------------------------------------------
      -- Enums
      -- ---------------------------------------------------------------------------

      create type public.user_status as enum (
        'pending',    -- criado, aguardando confirmação de pagamento
        'active',     -- acesso liberado
        'inactive',   -- acesso expirado/não renovado
        'refunded',   -- reembolsado
        'cancelled',  -- cancelado pelo usuário ou pelo Mercado Pago
        'blocked'     -- bloqueado manualmente (ex.: fraude, chargeback)
      );

      create type public.user_role as enum ('user', 'admin');

      -- Valores documentados pela API do Mercado Pago (campo \`status\` do recurso
      -- "payment"): pending, approved, authorized, in_process, in_mediation,
      -- rejected, cancelled, refunded, charged_back.
      create type public.purchase_status as enum (
        'pending',
        'approved',
        'authorized',
        'in_process',
        'in_mediation',
        'rejected',
        'cancelled',
        'refunded',
        'charged_back'
      );

      -- ---------------------------------------------------------------------------
      -- users (perfil de aplicação)
      -- ---------------------------------------------------------------------------

      create table public.users (
        id uuid primary key default gen_random_uuid(),
        -- Sempre em minúsculas (normalizado pela aplicação).
        email text not null unique,
        name text,
        -- Hash bcrypt. Nulo até o usuário definir a senha pelo link do convite.
        password_hash text,
        status public.user_status not null default 'pending',
        role public.user_role not null default 'user',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        last_login_at timestamptz
      );

      comment on table public.users is 'Perfil de aplicação do usuário. Acesso é controlado por "status", nunca por um campo enviado pelo cliente.';

      -- ---------------------------------------------------------------------------
      -- auth_tokens (refresh tokens, links de recuperação de senha e de convite)
      -- ---------------------------------------------------------------------------

      create table public.auth_tokens (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references public.users (id) on delete cascade,
        kind text not null check (kind in ('refresh', 'password_reset', 'invite')),
        -- SHA-256 do token. O token em si nunca é guardado.
        token_hash text not null unique,
        expires_at timestamptz not null,
        -- Preenchido quando o token é usado (links) ou rotacionado/revogado (refresh).
        consumed_at timestamptz,
        created_at timestamptz not null default now()
      );

      comment on table public.auth_tokens is 'Tokens opacos de autenticação. Só o hash é armazenado; tokens de link são de uso único.';

      create index auth_tokens_user_kind_idx on public.auth_tokens (user_id, kind);

      -- ---------------------------------------------------------------------------
      -- purchases (histórico de pagamentos recebidos via webhook do Mercado Pago)
      -- ---------------------------------------------------------------------------

      create table public.purchases (
        id uuid primary key default gen_random_uuid(),
        user_id uuid references public.users (id) on delete set null,
        -- id do pagamento no Mercado Pago (campo "id" do recurso /v1/payments/{id}).
        external_transaction_id text not null,
        -- id da preferência de checkout que originou o pagamento, quando disponível.
        external_product_id text,
        status public.purchase_status not null,
        -- "action" da notificação de webhook (ex.: "payment.created", "payment.updated").
        event_type text not null,
        raw_payload jsonb,
        purchased_at timestamptz,
        updated_at timestamptz not null default now(),
        created_at timestamptz not null default now(),

        -- Idempotência: o mesmo evento (transação + tipo de evento) nunca é
        -- processado duas vezes.
        unique (external_transaction_id, event_type)
      );

      comment on table public.purchases is 'Registro de eventos de pagamento recebidos via webhook do Mercado Pago. Chave de idempotência: (external_transaction_id, event_type).';

      -- Escrita somente pelo endpoint de webhook do Mercado Pago.

      -- ---------------------------------------------------------------------------
      -- questions (banco de perguntas)
      -- ---------------------------------------------------------------------------

      create type public.question_category as enum (
        'comportamental',
        'star',
        'tecnica',
        'situacional',
        'fit_cultural',
        'lideranca'
      );

      create type public.question_difficulty as enum ('iniciante', 'intermediaria', 'avancada');

      create table public.questions (
        id uuid primary key default gen_random_uuid(),
        category public.question_category not null,
        question text not null,
        evaluates text, -- o que o entrevistador está avaliando
        ideal_structure text,
        tips text[],
        things_to_avoid text[],
        difficulty public.question_difficulty not null default 'intermediaria',
        is_published boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      comment on table public.questions is 'Biblioteca de perguntas de entrevista. Gerenciada por administradores; leitura para usuários autenticados e ativos.';

      create index questions_category_idx on public.questions (category);
      create index questions_difficulty_idx on public.questions (difficulty);

      -- ---------------------------------------------------------------------------
      -- favorites (perguntas favoritas do usuário)
      -- ---------------------------------------------------------------------------

      create table public.question_favorites (
        user_id uuid not null references public.users (id) on delete cascade,
        question_id uuid not null references public.questions (id) on delete cascade,
        created_at timestamptz not null default now(),
        primary key (user_id, question_id)
      );

      -- ---------------------------------------------------------------------------
      -- star_responses (respostas estruturadas pelo método STAR)
      -- ---------------------------------------------------------------------------

      create table public.star_responses (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references public.users (id) on delete cascade,
        question_id uuid references public.questions (id) on delete set null,
        situation text not null default '',
        task text not null default '',
        action text not null default '',
        result text not null default '',
        generated_response text,
        ai_notes text[], -- observações da IA (ex.: "faltam dados de resultado mensurável")
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      comment on table public.star_responses is 'Rascunhos e respostas geradas pelo usuário via método STAR. generated_response nunca deve conter fatos não fornecidos pelo usuário (princípio anti-alucinação).';

      -- ---------------------------------------------------------------------------
      -- interview_sessions (simulador de entrevista)
      -- ---------------------------------------------------------------------------

      create table public.interview_sessions (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references public.users (id) on delete cascade,
        question_id uuid references public.questions (id) on delete set null,
        transcript text,
        audio_duration_seconds integer,
        score integer check (score is null or (score >= 0 and score <= 100)),
        score_breakdown jsonb, -- { estrutura, clareza, objetividade, resultado }
        feedback text,
        status text not null default 'in_progress', -- in_progress | transcribing | scoring | completed | failed
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      comment on table public.interview_sessions is 'Sessões do simulador de entrevista. score é uma métrica de qualidade de treinamento, nunca uma previsão de contratação.';

      create index interview_sessions_user_idx on public.interview_sessions (user_id, created_at desc);

      -- ---------------------------------------------------------------------------
      -- consent_records (LGPD — registro de consentimento de cookies/preferências)
      -- ---------------------------------------------------------------------------

      create table public.consent_records (
        id uuid primary key default gen_random_uuid(),
        user_id uuid references public.users (id) on delete cascade,
        -- Para visitantes não autenticados, um identificador anônimo de dispositivo/sessão.
        anonymous_id text,
        necessary boolean not null default true,
        analytics boolean not null default false,
        marketing boolean not null default false,
        created_at timestamptz not null default now(),
        constraint consent_records_subject_chk check (user_id is not null or anonymous_id is not null)
      );

      comment on table public.consent_records is 'Histórico de decisões de consentimento de cookies, para fins de auditoria (LGPD/ANPD).';

      -- ---------------------------------------------------------------------------
      -- data_requests (LGPD — solicitações do titular: acesso, correção, exclusão)
      -- ---------------------------------------------------------------------------

      create type public.data_request_type as enum ('access', 'correction', 'deletion');
      create type public.data_request_status as enum ('open', 'in_review', 'completed', 'rejected');

      create table public.data_requests (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references public.users (id) on delete cascade,
        type public.data_request_type not null,
        details text,
        status public.data_request_status not null default 'open',
        created_at timestamptz not null default now(),
        resolved_at timestamptz
      );

      comment on table public.data_requests is 'Solicitações do titular de dados (art. 18 LGPD): acesso, correção e eliminação.';

      -- ---------------------------------------------------------------------------
      -- webhook_events (log/idempotência bruta de eventos recebidos)
      -- ---------------------------------------------------------------------------

      create table public.webhook_events (
        id uuid primary key default gen_random_uuid(),
        provider text not null default 'mercadopago',
        event_type text not null,
        external_id text not null,
        idempotency_key text not null unique,
        payload jsonb not null,
        processed_at timestamptz,
        status text not null default 'received', -- received | processed | ignored | error
        error_message text,
        created_at timestamptz not null default now()
      );

      comment on table public.webhook_events is 'Log bruto de todo evento de webhook recebido, usado para idempotência, auditoria e reprocessamento.';

      -- ---------------------------------------------------------------------------
      -- Triggers: updated_at automático
      -- ---------------------------------------------------------------------------

      create or replace function public.set_updated_at()
      returns trigger
      language plpgsql
      as $$
      begin
        new.updated_at = now();
        return new;
      end;
      $$;

      create trigger users_set_updated_at before update on public.users
        for each row execute function public.set_updated_at();

      create trigger purchases_set_updated_at before update on public.purchases
        for each row execute function public.set_updated_at();

      create trigger questions_set_updated_at before update on public.questions
        for each row execute function public.set_updated_at();

      create trigger star_responses_set_updated_at before update on public.star_responses
        for each row execute function public.set_updated_at();

      create trigger interview_sessions_set_updated_at before update on public.interview_sessions
        for each row execute function public.set_updated_at();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      drop table if exists public.webhook_events;
      drop table if exists public.data_requests;
      drop table if exists public.consent_records;
      drop table if exists public.interview_sessions;
      drop table if exists public.star_responses;
      drop table if exists public.question_favorites;
      drop table if exists public.questions;
      drop table if exists public.purchases;
      drop table if exists public.auth_tokens;
      drop table if exists public.users;
      drop function if exists public.set_updated_at();
      drop type if exists public.data_request_status;
      drop type if exists public.data_request_type;
      drop type if exists public.question_difficulty;
      drop type if exists public.question_category;
      drop type if exists public.purchase_status;
      drop type if exists public.user_role;
      drop type if exists public.user_status;
    `);
  }
}
