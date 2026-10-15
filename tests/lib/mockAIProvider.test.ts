import { describe, expect, it } from "vitest";
import { MockAIProvider } from "@/lib/ai/providers/MockAIProvider";

describe("MockAIProvider — princípio anti-alucinação (PROMPT MESTRE §19)", () => {
  const provider = new MockAIProvider();

  it("nunca inclui texto que o usuário não forneceu na resposta gerada", async () => {
    const output = await provider.generateStarResponse({
      situation: "Projeto atrasado no time de vendas",
      task: "",
      action: "Reorganizei as prioridades com o time",
      result: "",
    });

    expect(output.generatedResponse).toContain("Projeto atrasado no time de vendas");
    expect(output.generatedResponse).toContain("Reorganizei as prioridades com o time");
    // Não deve conter nenhum número ou métrica inventada.
    expect(output.generatedResponse).not.toMatch(/\d+%/);
  });

  it("sinaliza explicitamente quando um campo obrigatório está vazio, em vez de preencher a lacuna", async () => {
    const output = await provider.generateStarResponse({
      situation: "Situação real",
      task: "Tarefa real",
      action: "Ação real",
      result: "", // faltando propositalmente
    });

    expect(output.notes.some((n) => /resultado/i.test(n))).toBe(true);
    expect(output.notes.join(" ")).not.toMatch(/\d+%/); // nunca inventa métrica
  });

  it("não gera nenhum número/métrica quando resultado está vazio", async () => {
    const output = await provider.generateStarResponse({
      situation: "S",
      task: "T",
      action: "A",
      result: "",
    });
    expect(output.generatedResponse).not.toMatch(/\d/);
  });

  it("evaluateInterviewResponse nunca retorna score de empregabilidade fora da escala 0-100", async () => {
    const result = await provider.evaluateInterviewResponse({
      question: "Fale sobre um desafio.",
      transcript: "Eu enfrentei um desafio no meu time e consegui resolver o problema.",
    });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(
      result.breakdown.estrutura +
        result.breakdown.clareza +
        result.breakdown.objetividade +
        result.breakdown.resultado
    ).toBe(result.score);
  });

  it("generateInterviewQuestion sempre escolhe de um conjunto real, nunca inventa uma pergunta nova", async () => {
    const pool = [
      { questionId: "1", question: "Pergunta A", category: "comportamental" },
      { questionId: "2", question: "Pergunta B", category: "star" },
    ];
    const selected = await provider.generateInterviewQuestion(pool);
    expect(pool.map((p) => p.questionId)).toContain(selected.questionId);
  });

  it("lança erro claro quando não há perguntas disponíveis, em vez de inventar uma", async () => {
    await expect(provider.generateInterviewQuestion([])).rejects.toThrow();
  });
});
