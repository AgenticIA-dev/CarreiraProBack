import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Nova competência do banco de perguntas: "aumento_promocao" — preparação
 * para conversas de carreira dentro da empresa atual (pedir aumento, pedir
 * promoção, negociar e lidar com respostas negativas).
 *
 * Também cria um índice para o simulador encontrar rapidamente as perguntas
 * que o usuário já respondeu (para não repetir).
 *
 * Observação: o PostgreSQL não remove valores de um enum. O `down` apenas
 * apaga as perguntas dessa categoria e o índice; o valor do enum continua
 * existindo, sem efeito colateral.
 */
export class AumentoPromocao1793300000000 implements MigrationInterface {
  name = "AumentoPromocao1793300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `alter type public.question_category add value if not exists 'aumento_promocao'`
    );
    await queryRunner.query(
      `create index if not exists interview_sessions_user_question_idx
         on public.interview_sessions (user_id, question_id)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop index if exists public.interview_sessions_user_question_idx`);
    await queryRunner.query(
      `delete from public.questions where category::text = 'aumento_promocao'`
    );
  }
}
