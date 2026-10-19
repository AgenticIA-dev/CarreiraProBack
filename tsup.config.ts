import { defineConfig } from "tsup";

/**
 * Build de produção: empacota `src/server.ts` (e os aliases `@/`) num único
 * `dist/server.js` ESM. As dependências de `package.json` ficam fora do
 * pacote e são carregadas de node_modules em tempo de execução.
 */
export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  sourcemap: true,
  clean: true,
});
