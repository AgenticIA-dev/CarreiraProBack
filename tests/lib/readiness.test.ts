import { describe, expect, it } from "vitest";
import { calculateReadiness } from "@/lib/scoring/readiness";
import type { InterviewSessionRow, StarResponseRow } from "@/types/database";

function makeSession(score: number): InterviewSessionRow {
  return {
    id: "s1",
    user_id: "u1",
    question_id: null,
    transcript: "texto",
    audio_duration_seconds: 30,
    score,
    score_breakdown: { estrutura: 10, clareza: 10, objetividade: 10, resultado: score - 30 },
    feedback: "feedback",
    status: "completed",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe("calculateReadiness", () => {
  it("retorna score 0 e nível iniciante sem nenhuma prática", () => {
    const result = calculateReadiness({ completedSessions: [], starResponses: [] });
    expect(result.score).toBe(0);
    expect(result.level).toBe("iniciante");
  });

  it("nunca ultrapassa 100", () => {
    const sessions = Array.from({ length: 20 }, () => makeSession(100));
    const responses = Array.from({ length: 20 }, () => ({} as StarResponseRow));
    const result = calculateReadiness({ completedSessions: sessions, starResponses: responses });
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("aumenta com mais sessões completadas e melhores notas", () => {
    const low = calculateReadiness({
      completedSessions: [makeSession(40)],
      starResponses: [],
    });
    const high = calculateReadiness({
      completedSessions: [makeSession(90), makeSession(85)],
      starResponses: [{} as StarResponseRow],
    });
    expect(high.score).toBeGreaterThan(low.score);
  });
});
