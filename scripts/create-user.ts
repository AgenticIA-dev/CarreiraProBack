/**
 * Cria (ou atualiza) um usuário com acesso liberado — útil para criar o
 * primeiro administrador e contas de teste, já que não há cadastro público
 * (contas normalmente nascem do webhook de pagamento).
 *
 * Uso:
 *   npm run user:create -- --email admin@exemplo.com --password "senha-forte" [--admin] [--name "Nome"]
 *
 * Se o e-mail já existir, atualiza senha, status ("active") e, com --admin,
 * o role. Requer DATABASE_URL (lida de .env.local, se existir).
 */
import { parseArgs } from "node:util";
import { DataSource } from "typeorm";
import { buildDataSourceOptions } from "../src/lib/db/dataSource";
import { UserEntity } from "../src/lib/db/entities";
import { hashPassword } from "../src/lib/auth/password";

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      password: { type: "string" },
      name: { type: "string" },
      admin: { type: "boolean", default: false },
    },
  });

  const email = values.email?.trim().toLowerCase();
  if (!email || !values.password || values.password.length < 8) {
    console.error('Uso: npm run user:create -- --email <email> --password "<mín. 8 caracteres>" [--admin] [--name "Nome"]');
    process.exit(1);
  }

  const dataSource = await new DataSource(buildDataSourceOptions()).initialize();
  try {
    const users = dataSource.getRepository(UserEntity);
    const fields = {
      password_hash: await hashPassword(values.password),
      status: "active" as const,
      ...(values.admin ? { role: "admin" as const } : {}),
      ...(values.name ? { name: values.name } : {}),
    };

    const existing = await users.findOneBy({ email });
    if (existing) {
      await users.update({ id: existing.id }, fields);
      console.log(`Usuário atualizado: ${email}`);
    } else {
      await users.insert({ email, ...fields });
      console.log(`Usuário criado: ${email}${values.admin ? " (admin)" : ""}`);
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
