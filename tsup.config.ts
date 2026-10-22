import { defineConfig } from "tsup";

/**
 * Build de produção: empacota `src/server.ts` (e os aliases `@/`) num único
 * `dist/server.js` ESM. As dependências de `package.json` ficam fora do
 * pacote e são carregadas de node_modules em tempo de execução.
 *
 * Os scripts de banco também são empacotados (`dist/migrate.js`,
 * `dist/seed.js`, `dist/create-user.js`), para rodarem com `node` puro em
 * produção (ex.: na imagem Docker), sem precisar do `tsx`.
 */
export default defineConfig({
  entry: {
    server: "src/server.ts",
    migrate: "scripts/migrate.ts",
    seed: "scripts/seed-questions.ts",
    "create-user": "scripts/create-user.ts",
  },
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  sourcemap: true,
  clean: true,
});
