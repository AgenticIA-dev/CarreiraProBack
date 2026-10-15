import type {
  AIProvider,
  EvaluateResponseInput,
  EvaluateResponseOutput,
  InterviewQuestionSelection,
  StarInput,
  StarOutput,
} from "../AIProvider";

/**
 * Provedor determinístico, sem chamadas externas — usado quando nenhuma
 * credencial de IA está configurada (AI_PROVIDER_API_KEY vazio).
 *
 * Aplica o princípio anti-alucinação de forma literal: reorganiza apenas o
 * texto fornecido pelo usuário, nunca adiciona fatos, números ou
 * experiências que não estejam no input.
 */
export class MockAIProvider implements AIProvider {
  readonly name = "mock";

  async generateStarResponse(input: StarInput): Promise<StarOutput> {
    const notes: string[] = [];
    const parts: string[] = [];

    if (input.situation.trim()) {
      parts.push(input.situation.trim());
    } else {
      notes.push("Situação não foi informada — adicione o contexto antes de usar esta resposta.");
    }

    if (input.task.trim()) {
      parts.push(input.task.trim());
    } else {
      notes.push("Tarefa/desafio não foi informado.");
    }

    if (input.action.trim()) {
      parts.push(input.action.trim());
    } else {
      notes.push("Ação não foi informada — descreva o que você efetivamente fez.");
    }

    if (input.result.trim()) {
      parts.push(input.result.trim());
    } else {
      notes.push(
        "Resultado não foi informado. Se você tiver uma métrica real, considere adicioná-la aqui."
      );
    }

    const generatedResponse = parts.length > 0
      ? parts.join(" ")
      : "Nenhuma informação foi fornecida ainda. Preencha Situação, Tarefa, Ação e Resultado para gerar sua resposta.";

    return { generatedResponse, notes };
  }

  async evaluateInterviewResponse(input: EvaluateResponseInput): Promise<EvaluateResponseOutput> {
    const transcript = input.transcript.trim();
    const wordCount = transcript ? transcript.split(/\s+/).length : 0;

    // Heurística simples e transparente (não é um modelo de IA real): serve
    // como comportamento de fallback determinístico e testável.
    const hasStructureMarkers = /situa|contexto|tarefa|resultado|então|depois/i.test(transcript);
    const estrutura = hasStructureMarkers ? 18 : 10;
    const clareza = wordCount > 20 ? 18 : Math.max(6, Math.round(wordCount / 2));
    const objetividade = wordCount > 0 && wordCount < 250 ? 18 : 12;
    const resultado = /result|consegui|entreguei|reduzi|aumentei|melhorei/i.test(transcript) ? 18 : 8;

    const breakdown = { estrutura, clareza, objetividade, resultado };
    const score = Math.round(
      ((estrutura + clareza + objetividade + resultado) / 100) * 100
    );

    const strengths: string[] = [];
    const improvements: string[] = [];

    if (estrutura >= 15) strengths.push("Sua resposta tem uma estrutura perceptível.");
    else improvements.push("Tente organizar a resposta em Situação, Tarefa, Ação e Resultado.");

    if (clareza >= 15) strengths.push("A resposta está clara e com bom nível de detalhe.");
    else improvements.push("Adicione mais contexto para deixar a resposta mais clara.");

    if (resultado >= 15) strengths.push("Você mencionou um resultado concreto.");
    else improvements.push("Inclua o resultado da sua ação, mesmo que qualitativo.");

    if (!transcript) {
      improvements.push("Não identificamos conteúdo na transcrição — tente responder novamente.");
    }

    return {
      score,
      breakdown,
      strengths,
      improvements,
      nextAction:
        improvements.length > 0
          ? "Pratique novamente aplicando as melhorias sugeridas acima."
          : "Continue praticando outras perguntas para manter a consistência.",
    };
  }

  async generateInterviewQuestion(
    available: InterviewQuestionSelection[]
  ): Promise<InterviewQuestionSelection> {
    if (available.length === 0) {
      throw new Error("Nenhuma pergunta disponível no banco de perguntas.");
    }
    const index = Math.floor(Math.random() * available.length);
    return available[index]!;
  }
}
