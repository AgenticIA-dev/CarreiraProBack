import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Preço, duração do acesso e campanhas promocionais editáveis pelo Admin
 * (antes só por variável de ambiente — ver `src/lib/checkout/config.ts`).
 *
 * `checkout_settings`: uma única linha (a mais recente por `updated_at`
 * vale). Campo nulo = ainda não configurado pelo Admin; nesse caso o
 * sistema continua caindo para a variável de ambiente correspondente
 * (CHECKOUT_PRODUCT_PRICE_BRL/CHECKOUT_ACCESS_MONTHS/CHECKOUT_PRODUCT_TITLE),
 * então esta migration nunca interrompe uma loja já configurada só por env.
 *
 * `campaigns`: desconto promocional independente do programa de parceiros
 * (sem comissão). `code` nulo = desconto automático (aplicado direto no
 * preço, sem precisar digitar nada); `code` preenchido = cupom que o
 * visitante digita no checkout, igual ao cupom de parceiro. `starts_at`/
 * `ends_at` nulos = sem limite de data nessa ponta. Nunca acumula com o
 * cupom de parceiro nem entre campanhas — vale sempre o maior desconto
 * (ver `src/lib/checkout/discount.ts`).
 *
 * `purchases.campaign_id`: campanha usada na compra, só para auditoria/
 * relatório (campanha não gera comissão, ao contrário de parceiro).
 */
export class CheckoutSettingsAndCampaigns1794300000000 implements MigrationInterface {
  name = "CheckoutSettingsAndCampaigns1794300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create table if not exists public.checkout_settings (
        id uuid primary key default gen_random_uuid(),
        price_brl numeric(10, 2),
        access_months integer,
        access_lifetime boolean not null default false,
        title text,
        updated_at timestamptz not null default now()
      )
    `);

    await queryRunner.query(`
      create table if not exists public.campaigns (
        id uuid primary key default gen_random_uuid(),
        code text,
        discount_percent integer not null,
        active boolean not null default true,
        starts_at timestamptz,
        ends_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);
    await queryRunner.query(`
      create unique index if not exists campaigns_code_unique
        on public.campaigns (code) where code is not null
    `);

    await queryRunner.query(
      `alter table public.purchases add column if not exists campaign_id uuid references public.campaigns(id) on delete set null`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`alter table public.purchases drop column if exists campaign_id`);
    await queryRunner.query(`drop table if exists public.campaigns`);
    await queryRunner.query(`drop table if exists public.checkout_settings`);
  }
}
