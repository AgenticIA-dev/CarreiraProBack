/**
 * Aplica (ou desfaz) as migrations do banco.
 *
 * Uso:
 *   npm run db:migrate          # aplica as pendentes
 *   npm run db:migrate:revert   # desfaz a última
 *
 * Requer DATABASE_URL (lida de .env.local, se existir).
 */
import { DataSource } from "typeorm";
import { buildDataSourceOptions } from "../src/lib/db/dataSource";

async function main() {
  const revert = process.argv.includes("--revert");
  const dataSource = new DataSource({ ...buildDataSourceOptions(), logging: ["error", "migration"] });
  await dataSource.initialize();

  try {
    if (revert) {
      await dataSource.undoLastMigration({ transaction: "each" });
      console.log("Última migration desfeita.");
    } else {
      const applied = await dataSource.runMigrations({ transaction: "each" });
      console.log(
        applied.length > 0
          ? `Migrations aplicadas: ${applied.map((m) => m.name).join(", ")}`
          : "Nenhuma migration pendente."
      );
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
