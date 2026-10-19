/**
 * Popula a tabela `questions` a partir de `src/data/questions.seed.ts`.
 *
 * Uso:
 *   npm run seed
 *
 * Requer DATABASE_URL (lida de .env.local, se existir) e as migrations
 * aplicadas (`npm run db:migrate`). Idempotente: usa a pergunta em si como
 * chave lógica e evita duplicar ao rodar mais de uma vez.
 */
import { DataSource } from "typeorm";
import { buildDataSourceOptions } from "../src/lib/db/dataSource";
import { QuestionEntity } from "../src/lib/db/entities";
import { questionsSeed } from "../src/data/questions.seed";

async function main() {
  const dataSource = await new DataSource(buildDataSourceOptions()).initialize();
  const questions = dataSource.getRepository(QuestionEntity);

  try {
    for (const q of questionsSeed) {
      const label = `"${q.question.slice(0, 50)}…"`;
      if (await questions.existsBy({ question: q.question })) {
        console.log(`Já existe, pulando: ${label}`);
        continue;
      }
      try {
        await questions.insert({ ...q, is_published: true });
        console.log(`Inserida: ${label}`);
      } catch (err) {
        console.error(`Erro ao inserir ${label}:`, err instanceof Error ? err.message : err);
      }
    }
    console.log("Seed concluído.");
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
