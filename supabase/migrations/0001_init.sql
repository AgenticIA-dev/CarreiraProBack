-- =============================================================================
-- CarreiraPro — Schema inicial
-- =============================================================================
-- Convenções:
--  * Toda tabela tem RLS habilitado.
--  * Usuários finais só enxergam/alteram seus próprios dados.
--  * Escrita em tabelas sensíveis (purchases, status de usuário, perguntas)
--    é feita exclusivamente pelo backend com a service role key (que ignora RLS),
--    nunca pelo cliente autenticado diretamente.
--  * "auth.users" é a tabela de autenticação nativa do Supabase; "public.users"
--    é o perfil de aplicação (1:1 com auth.users via mesmo id).
-- =============================================================================

create extension if not exists "pgcrypto";

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

-- Valores documentados pela API do Mercado Pago (campo `status` do recurso
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
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text,
  status public.user_status not null default 'pending',
  role public.user_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

comment on table public.users is 'Perfil de aplicação do usuário. Acesso é controlado por "status", nunca por um campo enviado pelo cliente.';

alter table public.users enable row level security;

create policy "users_select_own"
  on public.users for select
  using (auth.uid() = id);

create policy "users_update_own_limited"
  on public.users for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    -- Usuário comum nunca pode alterar o próprio status ou role via RLS.
    -- (Aplicação também reforça isso no backend; RLS é defesa em profundidade.)
  );

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

alter table public.purchases enable row level security;

create policy "purchases_select_own"
  on public.purchases for select
  using (auth.uid() = user_id);

-- Nenhuma policy de insert/update/delete para o cliente: somente a service role
-- (usada pelo endpoint de webhook) pode escrever nesta tabela.

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

comment on table public.questions is 'Biblioteca de perguntas de entrevista. Gerenciada por administradores; leitura pública para usuários autenticados e ativos.';

alter table public.questions enable row level security;

create policy "questions_select_published_for_authenticated"
  on public.questions for select
  to authenticated
  using (is_published = true);

-- Escrita restrita a admins (checado via public.users.role na aplicação/policy).
create policy "questions_all_for_admins"
  on public.questions for all
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'admin'
    )
  );

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

alter table public.question_favorites enable row level security;

create policy "favorites_all_own"
  on public.question_favorites for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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

alter table public.star_responses enable row level security;

create policy "star_responses_all_own"
  on public.star_responses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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

alter table public.interview_sessions enable row level security;

create policy "interview_sessions_all_own"
  on public.interview_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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

alter table public.consent_records enable row level security;

create policy "consent_records_select_own"
  on public.consent_records for select
  using (auth.uid() = user_id);

create policy "consent_records_insert_own"
  on public.consent_records for insert
  with check (user_id is null or auth.uid() = user_id);

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

alter table public.data_requests enable row level security;

create policy "data_requests_select_own"
  on public.data_requests for select
  using (auth.uid() = user_id);

create policy "data_requests_insert_own"
  on public.data_requests for insert
  with check (auth.uid() = user_id);

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

alter table public.webhook_events enable row level security;
-- Nenhuma policy de select/insert para roles authenticated/anon: tabela acessível
-- somente via service role (backend do webhook).

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

-- ---------------------------------------------------------------------------
-- Novo usuário do Supabase Auth -> cria perfil público automaticamente
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, status, role)
  values (new.id, new.email, 'pending', 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
