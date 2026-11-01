import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Prazo do acesso comprado (`users.access_expires_at`).
 *
 * null = sem expiração (acesso vitalício ou usuários criados antes desta
 * migration). Preenchido pelo webhook do Mercado Pago na aprovação do
 * pagamento, conforme CHECKOUT_ACCESS_MONTHS (ver src/lib/checkout/config.ts).
 */
export class AccessExpiry1793400000000 implements MigrationInterface {
  name = "AccessExpiry1793400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`alter table public.users add column if not exists access_expires_at timestamptz`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`alter table public.users drop column if exists access_expires_at`);
  }
}
