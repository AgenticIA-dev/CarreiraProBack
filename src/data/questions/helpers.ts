import type { QuestionCategory, QuestionDifficulty } from "@/types/database";
import type { SeedQuestion } from "../questions.seed";

/**
 * Atalho para declarar perguntas do banco de forma compacta e legível.
 *
 * Padrão de conteúdo (válido para todas as perguntas):
 *  - `evaluates`: o que o entrevistador realmente está medindo.
 *  - `ideal_structure`: como montar a resposta + um CENÁRIO REAL de exemplo
 *    compatível com o nível (iniciante = estudo/estágio/primeiro emprego;
 *    intermediária = profissional pleno, projetos e áreas parceiras;
 *    avançada = sênior/liderança, ambiguidade, estratégia e trade-offs).
 *  - `tips` e `things_to_avoid`: orientação prática e acionável.
 *
 * Os cenários são ilustrativos — nunca estatísticas, depoimentos ou
 * resultados apresentados como reais (PROMPT MESTRE §16 e §19).
 */
export function q(
  category: QuestionCategory,
  difficulty: QuestionDifficulty,
  question: string,
  evaluates: string,
  ideal_structure: string,
  tips: string[],
  things_to_avoid: string[]
): SeedQuestion {
  return { category, difficulty, question, evaluates, ideal_structure, tips, things_to_avoid };
}
