import type { QuestionCategory, QuestionDifficulty } from "@/types/database";

export interface SeedQuestion {
  category: QuestionCategory;
  question: string;
  evaluates: string;
  ideal_structure: string;
  tips: string[];
  things_to_avoid: string[];
  difficulty: QuestionDifficulty;
}

/**
 * Conteúdo real de partida para o banco de perguntas (PROMPT MESTRE §16).
 *
 * São perguntas amplamente reconhecidas em processos seletivos e uma
 * estrutura recomendada de resposta — não respostas prontas apresentadas
 * como universais, e nada aqui simula depoimento, estatística ou avaliação
 * fabricada. Este arquivo é usado por `supabase/seed.sql`-equivalente via
 * script de seed (ver docs/DOCUMENTATION.md) para popular a tabela
 * `questions` em um ambiente com Supabase configurado.
 */
export const questionsSeed: SeedQuestion[] = [
  {
    category: "comportamental",
    question: "Fale sobre um desafio profissional difícil que você enfrentou.",
    evaluates: "Resiliência, capacidade de análise e como você reage sob pressão.",
    ideal_structure:
      "Descreva o contexto do desafio, o que estava em jogo, as ações que você tomou e o que aprendeu ou o resultado alcançado.",
    tips: [
      "Escolha um exemplo real e específico, não uma generalização.",
      "Foque no que você fez, não apenas no que a equipe fez.",
      "Termine com o aprendizado, mesmo que o resultado não tenha sido perfeito.",
    ],
    things_to_avoid: [
      "Culpar terceiros sem assumir sua parte na situação.",
      "Escolher um exemplo trivial demais para a vaga.",
    ],
    difficulty: "iniciante",
  },
  {
    category: "star",
    question: "Descreva uma vez em que você teve que tomar uma decisão sem todas as informações.",
    evaluates: "Julgamento, autonomia e tolerância à ambiguidade.",
    ideal_structure:
      "Situação: o contexto e a limitação de informação. Tarefa: o que precisava ser decidido. Ação: como você reuniu o que era possível e decidiu. Resultado: o que aconteceu depois.",
    tips: [
      "Explique o raciocínio por trás da decisão, não só o resultado.",
      "Se o resultado não foi ideal, mostre o que você ajustaria.",
    ],
    things_to_avoid: ["Inventar uma métrica de resultado que você não tem certeza."],
    difficulty: "intermediaria",
  },
  {
    category: "star",
    question: "Conte sobre uma vez em que você melhorou um processo ou resultado no seu trabalho.",
    evaluates: "Iniciativa, senso de dono e capacidade de gerar impacto mensurável.",
    ideal_structure:
      "Situação: como o processo funcionava antes. Tarefa: o problema que você identificou. Ação: o que você mudou. Resultado: o impacto, idealmente com um número real — se não tiver um número exato, descreva o impacto qualitativamente.",
    tips: [
      "Se você tiver uma métrica real, inclua-a. Se não tiver, descreva o impacto sem inventar um número.",
      "Mostre que a mudança foi sua iniciativa, não apenas uma ordem recebida.",
    ],
    things_to_avoid: ["Atribuir a si um resultado que foi conquistado por outra pessoa."],
    difficulty: "intermediaria",
  },
  {
    category: "tecnica",
    question: "Como você garante a qualidade do seu trabalho antes de entregá-lo?",
    evaluates: "Rigor técnico, atenção a detalhes e processo de trabalho.",
    ideal_structure:
      "Explique seu processo (revisão, testes, checklist, pares) com um exemplo concreto de quando isso evitou um problema.",
    tips: ["Use um exemplo real da sua área técnica específica."],
    things_to_avoid: ["Respostas genéricas sem nenhum exemplo prático."],
    difficulty: "intermediaria",
  },
  {
    category: "situacional",
    question: "O que você faria se discordasse de uma decisão do seu gestor?",
    evaluates: "Comunicação, maturidade profissional e capacidade de discordar com respeito.",
    ideal_structure:
      "Descreva como você buscaria entender o racional da decisão, como apresentaria seu ponto de vista com dados, e como agiria caso a decisão original fosse mantida.",
    tips: ["Se você já viveu essa situação, use o exemplo real em vez de uma resposta hipotética."],
    things_to_avoid: ["Sugerir que ignoraria a decisão do gestor."],
    difficulty: "iniciante",
  },
  {
    category: "fit_cultural",
    question: "O que te motiva no dia a dia de trabalho?",
    evaluates: "Alinhamento entre seus valores e a cultura da empresa.",
    ideal_structure:
      "Seja específico sobre o que genuinamente te engaja (ex.: resolver problemas complexos, colaborar em equipe, ver impacto direto no cliente) e conecte com exemplos reais.",
    tips: ["Pesquise a cultura da empresa antes da entrevista para conectar sua resposta com ela, sem soar decorado."],
    things_to_avoid: ["Respostas genéricas como 'gosto de desafios' sem contexto."],
    difficulty: "iniciante",
  },
  {
    category: "lideranca",
    question: "Descreva uma vez em que você precisou influenciar alguém sem ter autoridade formal sobre essa pessoa.",
    evaluates: "Capacidade de liderança horizontal, persuasão e colaboração.",
    ideal_structure:
      "Situação: o contexto e por que a influência era necessária. Tarefa: o que você precisava alcançar. Ação: como você construiu confiança e argumentou. Resultado: o desfecho.",
    tips: ["Foque em como você ouviu a outra pessoa, não apenas em como convenceu."],
    things_to_avoid: ["Descrever a situação como uma imposição em vez de uma influência genuína."],
    difficulty: "avancada",
  },
  {
    category: "lideranca",
    question: "Conte sobre uma vez em que precisou dar um feedback difícil a alguém.",
    evaluates: "Maturidade emocional, comunicação direta e cuidado com a relação.",
    ideal_structure:
      "Situação: o contexto do feedback. Tarefa: por que era necessário. Ação: como você conduziu a conversa. Resultado: o que mudou depois.",
    tips: ["Mostre empatia na forma como conduziu a conversa, sem perder a objetividade do feedback."],
    things_to_avoid: ["Focar apenas na falha da outra pessoa, sem mostrar sua própria condução da conversa."],
    difficulty: "avancada",
  },
  {
    category: "comportamental",
    question: "Fale sobre uma vez em que você cometeu um erro no trabalho. Como você lidou com isso?",
    evaluates: "Honestidade, responsabilidade e capacidade de aprender com erros.",
    ideal_structure:
      "Situação e o erro em si. Ação: como você comunicou e corrigiu o erro. Resultado: o que mudou na sua forma de trabalhar depois.",
    tips: ["Escolha um erro real, mas que você já superou — mostre aprendizado, não fragilidade não resolvida."],
    things_to_avoid: ["Minimizar o erro a ponto de parecer que você não assumiu responsabilidade real."],
    difficulty: "intermediaria",
  },
  {
    category: "situacional",
    question: "Como você prioriza tarefas quando tudo parece urgente?",
    evaluates: "Organização, julgamento de prioridades e comunicação de expectativas.",
    ideal_structure:
      "Explique seu método de priorização (ex.: impacto x esforço, urgência x importância) com um exemplo real de quando isso foi testado.",
    tips: ["Mencione como você comunica prazos e riscos a outras pessoas quando reprioriza."],
    things_to_avoid: ["Dizer que 'dá conta de tudo' sem um método real por trás."],
    difficulty: "intermediaria",
  },
];
