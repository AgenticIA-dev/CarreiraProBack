import type { InterviewSessionRow, StarResponseRow } from "@/types/database";

export interface ReadinessInput {
  completedSessions: InterviewSessionRow[];
  starResponses: StarResponseRow[];
}

export interface ReadinessResult {
  /** Métrica interna de treinamento, 0–100. NUNCA é probabilidade de contratação. */
  score: number;
  level: "iniciante" | "em progresso" | "consistente" | "avançado";
  practicedQuestions: number;
  starDrafts: number;
}

/**
 * Calcula a "prontidão de treinamento" — uma métrica interna que reflete o
 * volume e a qualidade da prática do usuário, nunca a chance de ser
 * contratado (PROMPT MESTRE §15, §58).
 */
export function calculateReadiness(input: ReadinessInput): ReadinessResult {
  const { completedSessions, starResponses } = input;

  const practicedQuestions = completedSessions.length;
  const starDrafts = starResponses.length;

  const avgSessionScore =
    completedSessions.length > 0
      ? completedSessions.reduce((sum, s) => sum + (s.score ?? 0), 0) / completedSessions.length
      : 0;

  // Metade do peso vem da qualidade média das sessões, metade do volume de
  // prática (com teto, para não recompensar volume infinito sobre qualidade).
  const volumeComponent = Math.min(practicedQuestions * 6 + starDrafts * 4, 50);
  const qualityComponent = avgSessionScore * 0.5;

  const score = Math.round(Math.min(volumeComponent + qualityComponent, 100));

  let level: ReadinessResult["level"] = "iniciante";
  if (score >= 80) level = "avançado";
  else if (score >= 55) level = "consistente";
  else if (score >= 25) level = "em progresso";

  return { score, level, practicedQuestions, starDrafts };
}
