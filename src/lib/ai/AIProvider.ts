/**
 * Camada de abstração de IA (PROMPT MESTRE §38).
 *
 * Nenhuma parte da aplicação deve importar um provedor concreto
 * diretamente — sempre use `getAIProvider()` (ver `index.ts`), para que o
 * provedor possa ser trocado no futuro sem tocar em regras de negócio.
 *
 * PRINCÍPIO ANTI-ALUCINAÇÃO (PROMPT MESTRE §19): toda implementação desta
 * interface deve, quando faltar informação fornecida pelo usuário, sinalizar
 * isso explicitamente em vez de preencher a lacuna silenciosamente.
 */

export interface StarInput {
  situation: string;
  task: string;
  action: string;
  result: string;
}

export interface StarOutput {
  /** Resposta estruturada, escrita a partir exclusivamente do que o usuário forneceu. */
  generatedResponse: string;
  /**
   * Observações da IA — por exemplo, apontando que falta um resultado
   * mensurável, sem inventar um número. Nunca vazio quando há lacunas.
   */
  notes: string[];
}

export interface InterviewQuestionSelection {
  questionId: string;
  question: string;
  category: string;
}

export interface EvaluateResponseInput {
  question: string;
  transcript: string;
}

export interface EvaluateResponseOutput {
  score: number; // 0-100, qualidade de treinamento — nunca empregabilidade
  breakdown: {
    estrutura: number;
    clareza: number;
    objetividade: number;
    resultado: number;
  };
  strengths: string[];
  improvements: string[];
  nextAction: string;
}

export interface AIProvider {
  readonly name: string;

  /** Estrutura uma resposta STAR a partir apenas do que o usuário informou. */
  generateStarResponse(input: StarInput): Promise<StarOutput>;

  /** Avalia a transcrição de uma resposta de entrevista simulada. */
  evaluateInterviewResponse(input: EvaluateResponseInput): Promise<EvaluateResponseOutput>;

  /**
   * Seleciona a próxima pergunta de um conjunto disponível. A escolha em si
   * é feita a partir das perguntas reais do banco (nunca inventadas pela IA).
   */
  generateInterviewQuestion(
    available: InterviewQuestionSelection[]
  ): Promise<InterviewQuestionSelection>;
}
