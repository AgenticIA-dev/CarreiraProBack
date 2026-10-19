import "reflect-metadata";
import { DataSource, type DataSourceOptions } from "typeorm";
import { entities } from "./entities";
import { Init1760900000000 } from "./migrations/1760900000000-Init";

/**
 * Conexão com o PostgreSQL via TypeORM.
 *
 * Configurada por `DATABASE_URL` (ex.: postgres://user:senha@host:5432/carreirapro).
 * SSL é ligado com `DATABASE_SSL=true`; para provedores com certificado
 * autoassinado, `DATABASE_SSL_REJECT_UNAUTHORIZED=false`.
 *
 * As migrations são listadas aqui explicitamente (não por glob), para
 * funcionarem igual no servidor (bundle do tsup) e nos scripts `tsx`.
 * `synchronize` fica sempre desligado: o schema só muda por migration.
 */
export function buildDataSourceOptions(): DataSourceOptions {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Banco de dados não configurado: defina DATABASE_URL.");
  }

  const sslEnabled = process.env.DATABASE_SSL === "true";
  const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false";

  return {
    type: "postgres",
    url,
    ssl: sslEnabled ? { rejectUnauthorized } : false,
    entities,
    migrations: [Init1760900000000],
    migrationsTableName: "typeorm_migrations",
    synchronize: false,
    logging: process.env.DATABASE_LOGGING === "true" ? ["query", "error"] : ["error"],
    // Pool pequeno por padrão: cada instância do servidor abre o próprio pool.
    extra: { max: Number(process.env.DATABASE_POOL_MAX ?? 5) },
  };
}

const globalForDb = globalThis as unknown as { __carreiraproDb?: Promise<DataSource> };

/** Devolve a conexão inicializada (singleton por processo). */
export function getDb(): Promise<DataSource> {
  if (!globalForDb.__carreiraproDb) {
    const dataSource = new DataSource(buildDataSourceOptions());
    globalForDb.__carreiraproDb = dataSource.initialize().catch((err) => {
      // Permite nova tentativa na próxima requisição em vez de ficar preso
      // numa promise rejeitada para sempre.
      globalForDb.__carreiraproDb = undefined;
      throw err;
    });
  }
  return globalForDb.__carreiraproDb;
}

/** Fecha o pool, se ele chegou a ser aberto (usado no encerramento do servidor). */
export async function closeDb(): Promise<void> {
  const pending = globalForDb.__carreiraproDb;
  globalForDb.__carreiraproDb = undefined;
  const db = await pending?.catch(() => null);
  await db?.destroy();
}
