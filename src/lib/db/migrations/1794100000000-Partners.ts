import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Programa de parcerias com influenciadores.
 *
 * `partners`: cadastro do parceiro (nome/e-mail de contato, cupom de
 * desconto que ele divulga e o percentual de desconto do cupom).
 *
 * `partner_commission_tiers`: faixas de comissão por meta de vendas do
 * parceiro (ex.: 20% até a venda 20, 25% da 21 à 30, 30% acima de 30).
 * `max_sale_number null` = sem limite superior (faixa "acima de X").
 *
 * `partner_commissions`: uma linha por venda aprovada atribuída a um
 * parceiro, com o percentual da faixa aplicada naquele momento e o valor
 * da comissão (sobre o preço já com desconto do cupom). `sale_number` é a
 * posição da venda entre as vendas daquele parceiro (1ª, 2ª, ...),
 * usada para decidir a faixa. `status` controla o pagamento via Payouts.
 *
 * `users.referred_by_partner_id`: parceiro que indicou o usuário (setado
 * no cadastro da amostra grátis ou no checkout com cupom), usado para
 * atribuir a comissão mesmo que o pagamento não repita o cupom.
 * `users.is_trial`: usuário em amostra grátis (acesso restrito).
 * `purchases.partner_id`: parceiro atribuído à compra, para auditoria.
 */
export class Partners1794100000000 implements MigrationInterface {
  name = "Partners1794100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create table if not exists public.partners (
        id uuid primary key default gen_random_uuid(),
        name text not null,
        email text,
        coupon_code text not null unique,
        discount_percent integer not null,
        active boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);

    await queryRunner.query(`
      create table if not exists public.partner_commission_tiers (
        id uuid primary key default gen_random_uuid(),
        partner_id uuid not null references public.partners(id) on delete cascade,
        min_sale_number integer not null,
        max_sale_number integer,
        percent integer not null,
        created_at timestamptz not null default now()
      )
    `);
    await queryRunner.query(`
      create index if not exists partner_commission_tiers_partner_id_idx
        on public.partner_commission_tiers(partner_id)
    `);

    await queryRunner.query(`
      create table if not exists public.partner_commissions (
        id uuid primary key default gen_random_uuid(),
        partner_id uuid not null references public.partners(id) on delete cascade,
        user_id uuid not null references public.users(id) on delete set null,
        purchase_id uuid references public.purchases(id) on delete set null,
        sale_number integer not null,
        percent_applied integer not null,
        amount_brl numeric(10, 2) not null,
        status text not null default 'pending',
        paid_at timestamptz,
        created_at timestamptz not null default now()
      )
    `);
    await queryRunner.query(`
      create index if not exists partner_commissions_partner_id_idx
        on public.partner_commissions(partner_id)
    `);

    await queryRunner.query(
      `alter table public.users add column if not exists referred_by_partner_id uuid references public.partners(id) on delete set null`
    );
    await queryRunner.query(`alter table public.users add column if not exists is_trial boolean not null default false`);

    await queryRunner.query(
      `alter table public.purchases add column if not exists partner_id uuid references public.partners(id) on delete set null`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`alter table public.purchases drop column if exists partner_id`);
    await queryRunner.query(`alter table public.users drop column if exists is_trial`);
    await queryRunner.query(`alter table public.users drop column if exists referred_by_partner_id`);
    await queryRunner.query(`drop table if exists public.partner_commissions`);
    await queryRunner.query(`drop table if exists public.partner_commission_tiers`);
    await queryRunner.query(`drop table if exists public.partners`);
  }
}
