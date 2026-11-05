import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Áudio (texto-para-voz) da pergunta e da resposta ideal/sugerida, pré-gerado
 * e guardado no banco — não no disco do contêiner, que é apagado a cada
 * deploy no Easypanel. Gerado sob demanda na primeira vez que alguém pede
 * (rota `GET /api/questions/:id/audio/:kind`) e reaproveitado depois: custo
 * único por pergunta, não por usuário/reprodução.
 */
export class QuestionAudio1793900000000 implements MigrationInterface {
  name = "QuestionAudio1793900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create table public.question_audio (
        id uuid primary key default gen_random_uuid(),
        question_id uuid not null references public.questions(id) on delete cascade,
        -- 'question': lê a pergunta em voz alta. 'ideal': lê a estrutura recomendada (resposta ideal/sugerida).
        kind text not null check (kind in ('question', 'ideal')),
        mp3 bytea not null,
        voice text not null,
        provider text not null,
        model text not null,
        created_at timestamptz not null default now(),
        unique (question_id, kind)
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop table if exists public.question_audio;`);
  }
}
