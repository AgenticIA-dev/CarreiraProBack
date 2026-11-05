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
  /** Pergunta de entrevista ou competência que a história deve responder (opcional). */
  targetQuestion?: string;
  /** Cargo/nível pretendido, para calibrar o tom e os sinais de senioridade (opcional). */
  targetRole?: string;
}

export interface StarChecklistItem {
  criterion: string;
  ok: boolean;
  /** Como corrigir/elevar, quando `ok` é false. */
  tip?: string;
}

/** Entrega completa do gerador STAR no padrão de um coach sênior. */
export interface StarAnalysis {
  /** Versão curta (30–45 s) para respostas rápidas ou abertura. */
  pitch: string;
  sections: {
    situacao: string;
    tarefa: string;
    acao: string;
    resultado: string;
    aprendizado: string;
  };
  /** Competências que a história demonstra (ex.: liderança, priorização). */
  competencies: string[];
  checklist: StarChecklistItem[];
  /** Como elevar a história ao nível sênior, sem inventar fatos. */
  seniorEnhancements: string[];
  /** Perguntas objetivas para o usuário completar as lacunas com dados reais. */
  missingData: string[];
  /** Perguntas de aprofundamento que o entrevistador provavelmente fará. */
  followUpQuestions: string[];
  /** Nota de qualidade da história (0–100) — não é previsão de contratação. */
  qualityScore: number;
  engine: "ai" | "heuristic";
}

export interface StarOutput {
  /** Resposta estruturada (versão falada completa), escrita a partir exclusivamente do que o usuário forneceu. */
  generatedResponse: string;
  /**
   * Observações da IA — por exemplo, apontando que falta um resultado
   * mensurável, sem inventar um número. Nunca vazio quando há lacunas.
   */
  notes: string[];
  analysis?: StarAnalysis;
}

export interface InterviewQuestionSelection {
  questionId: string;
  question: string;
  category: string;
}

export interface EvaluateResponseInput {
  question: string;
  transcript: string;
  /**
   * "entrevista" (padrão): processo seletivo.
   * "aumento_promocao": conversa de aumento/promoção na empresa atual — a
   * avaliação passa a ser a de um gestor/RH recebendo o pedido.
   */
  context?: "entrevista" | "aumento_promocao";
  /**
   * Nível de experiência declarado pelo usuário (perfil) — calibra a régua:
   * um júnior não é avaliado pelo padrão sênior exigente de hoje. Ausente
   * (usuário não informou) = comportamento de sempre, sem calibração.
   */
  experienceLevel?: "junior" | "pleno" | "senior";
}

export type CriterionKey = "estrutura" | "clareza" | "objetividade" | "resultado";

export interface CriterionAnalysis {
  key: CriterionKey;
  score: number; // 0-25
  /** Por que essa nota — citando o que o candidato disse (ou deixou de dizer). */
  justification: string;
  /** Trecho literal da resposta que sustenta a avaliação (quando houver). */
  evidence?: string;
}

/**
 * Análise detalhada no padrão de um entrevistador sênior. Avalia a
 * MATURIDADE DA RESPOSTA de treinamento — nunca prevê contratação.
 */
export interface InterviewAnalysis {
  /** Nível de maturidade que a resposta demonstra (não do candidato). */
  answerMaturity: "inicial" | "em desenvolvimento" | "sólida" | "sênior";
  /** Parecer executivo de 2–3 frases, como um avaliador escreveria. */
  verdict: string;
  criteria: CriterionAnalysis[];
  starCoverage: { situacao: boolean; tarefa: boolean; acao: boolean; resultado: boolean };
  /** Sinais de senioridade presentes (protagonismo, impacto, trade-offs, métricas…). */
  seniorSignals: string[];
  /** Pontos que um entrevistador experiente veria como alerta. */
  redFlags: string[];
  /**
   * Versão reescrita da resposta usando SOMENTE os fatos ditos pelo
   * candidato; lacunas aparecem como [colchetes] para ele preencher.
   */
  improvedAnswer: string;
  /** Perguntas de aprofundamento que o entrevistador provavelmente faria. */
  followUpQuestions: string[];
  /** Origem da análise (IA real ou heurística local). */
  engine: "ai" | "heuristic";
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
  analysis?: InterviewAnalysis;
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
