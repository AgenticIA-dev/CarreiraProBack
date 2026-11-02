import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Registro de uso por usuário (`usage_events`): logins, transcrições, análises
 * do simulador e gerações STAR, com tokens/minutos e custo estimado em US$.
 *
 * Base do relatório "Admin › Uso e custos" (custo por usuário, sinais de
 * upsell e evidência de uso em disputas de reembolso/chargeback).
 * `ip` e `user_agent` ficam guardados pelo prazo da Política de Privacidade.
 */
export class UsageEvents1793500000000 implements MigrationInterface {
  name = "UsageEvents1793500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create table if not exists public.usage_events (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references public.users(id) on delete cascade,
        kind text not null,
        provider text,
        model text,
        input_tokens integer,
        output_tokens integer,
        audio_seconds integer,
        cost_usd numeric(12, 6) not null default 0,
        ip text,
        user_agent text,
        meta jsonb,
        created_at timestamptz not null default now()
      )
    `);
    await queryRunner.query(
      `create index if not exists usage_events_user_created_idx on public.usage_events (user_id, created_at)`
    );
    await queryRunner.query(`create index if not exists usage_events_kind_idx on public.usage_events (kind)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop table if exists public.usage_events`);
  }
}
