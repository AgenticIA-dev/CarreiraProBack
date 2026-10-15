/**
 * Popula a tabela `public.questions` a partir de `src/data/questions.seed.ts`.
 *
 * Uso:
 *   npx tsx scripts/seed-questions.ts
 *
 * Requer SUPABASE_SERVICE_ROLE_KEY e NEXT_PUBLIC_SUPABASE_URL configurados
 * (.env.local). Idempotente: usa a pergunta em si como chave lógica e evita
 * duplicar ao rodar mais de uma vez.
 */
import { createClient } from "@supabase/supabase-js";
import { questionsSeed } from "../src/data/questions.seed";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error(
      "Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de rodar o seed."
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey);

  for (const q of questionsSeed) {
    const { data: existing } = await supabase
      .from("questions")
      .select("id")
      .eq("question", q.question)
      .maybeSingle();

    if (existing) {
      console.log(`Já existe, pulando: "${q.question.slice(0, 50)}…"`);
      continue;
    }

    const { error } = await supabase.from("questions").insert({ ...q, is_published: true });
    if (error) {
      console.error(`Erro ao inserir "${q.question.slice(0, 50)}…":`, error.message);
    } else {
      console.log(`Inserida: "${q.question.slice(0, 50)}…"`);
    }
  }

  console.log("Seed concluído.");
}

main();
