import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Acesso de cortesia (testadores convidados pelo admin, sem pagamento).
 *
 * `users.is_courtesy = true` marca quem recebeu acesso gratuito: o relatório
 * "Uso e custos" mostra o uso e o custo de IA dessas pessoas, mas deixa a
 * conta fora da receita e da margem. Se a pessoa comprar depois, o webhook
 * do Mercado Pago desmarca a cortesia.
 */
export class Courtesy1793600000000 implements MigrationInterface {
  name = "Courtesy1793600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `alter table public.users add column if not exists is_courtesy boolean not null default false`
    );
    await queryRunner.query(`alter table public.users add column if not exists courtesy_granted_at timestamptz`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`alter table public.users drop column if exists courtesy_granted_at`);
    await queryRunner.query(`alter table public.users drop column if exists is_courtesy`);
  }
}
