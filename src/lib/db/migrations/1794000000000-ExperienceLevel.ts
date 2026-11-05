import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Nível de experiência declarado pelo usuário (júnior/pleno/sênior) — item C
 * da avaliação de UX (04/11/2026): "nivelar o feedback por experiência".
 *
 * Usado para calibrar a régua de avaliação da IA no simulador (um júnior não
 * é avaliado pelo padrão sênior de hoje) e para pré-selecionar a dificuldade
 * padrão das perguntas sorteadas. Nulo = não informado: comportamento igual
 * a antes desta mudança (régua sênior exigente, sem sugestão de dificuldade).
 */
export class ExperienceLevel1794000000000 implements MigrationInterface {
  name = "ExperienceLevel1794000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`create type public.user_experience_level as enum ('junior', 'pleno', 'senior')`);
    await queryRunner.query(
      `alter table public.users add column if not exists experience_level public.user_experience_level`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`alter table public.users drop column if exists experience_level`);
    await queryRunner.query(`drop type if exists public.user_experience_level`);
  }
}
