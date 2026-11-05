import type {
  AIProvider,
  CriterionAnalysis,
  EvaluateResponseInput,
  EvaluateResponseOutput,
  InterviewQuestionSelection,
  StarChecklistItem,
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

  /**
   * Estruturação STAR local (sem IA), já no formato de um coach sênior:
   * monta a versão falada com transições, a versão curta, o checklist de
   * senioridade e as perguntas para completar lacunas. Nunca adiciona fatos,
   * números ou experiências — o texto do usuário é usado literalmente e o que
   * falta vira [marcador entre colchetes].
   */
  async generateStarResponse(input: StarInput): Promise<StarOutput> {
    const situation = input.situation.trim();
    const task = input.task.trim();
    const action = input.action.trim();
    const result = input.result.trim();
    const notes: string[] = [];

    if (!situation) notes.push("Situação não foi informada — adicione o contexto antes de usar esta resposta.");
    if (!task) notes.push("Tarefa/desafio não foi informado.");
    if (!action) notes.push("Ação não foi informada — descreva o que você efetivamente fez.");
    if (!result) {
      notes.push("Resultado não foi informado. Se você tiver uma métrica real, considere adicioná-la aqui.");
    }

    if (!situation && !task && !action && !result) {
      return {
        generatedResponse:
          "Nenhuma informação foi fornecida ainda. Preencha Situação, Tarefa, Ação e Resultado para gerar sua resposta.",
        notes,
      };
    }

    const all = fold([situation, task, action, result].join(" "));
    const sent = (t: string) => (/[.!?…]$/.test(t) ? t : `${t}.`);
    const learningGiven = /aprendi|aprendizado|licao|faria diferente|hoje eu/.test(all);

    const sections = {
      situacao: situation ? sent(situation) : "[Situação: em uma ou duas frases, onde você estava, qual era o problema e o tamanho dele]",
      tarefa: task ? sent(task) : "[Tarefa: qual era a SUA responsabilidade e o que estava em jogo]",
      acao: action ? sent(action) : "[Ação: de dois a quatro passos que VOCÊ executou, em ordem, e por que escolheu cada um]",
      resultado: result ? sent(result) : "[Resultado: o que mudou depois da sua ação, de preferência com um número real de antes e depois]",
      aprendizado: learningGiven ? "" : "[Aprendizado: feche com o que você aprendeu ou faria diferente]",
    };

    const generatedResponse = [
      situation ? `O contexto era o seguinte: ${sections.situacao}` : sections.situacao,
      task ? `A minha responsabilidade era: ${sections.tarefa}` : sections.tarefa,
      action ? `O que eu fiz: ${sections.acao}` : sections.acao,
      result ? `Como resultado: ${sections.resultado}` : sections.resultado,
      sections.aprendizado,
    ]
      .filter(Boolean)
      .join("\n\n");

    const firstSentence = (t: string) => sent(t.split(/(?<=[.!?])\s+/)[0] ?? t);
    const pitch = [situation && firstSentence(situation), action && firstSentence(action), result && firstSentence(result)]
      .filter(Boolean)
      .join(" ");

    const check = (criterion: string, ok: boolean, tip: string): StarChecklistItem => (ok ? { criterion, ok } : { criterion, ok, tip });
    const checklist: StarChecklistItem[] = [
      check("Contexto curto e com escala do problema", Boolean(situation) && situation.split(/\s+/).length <= 60, situation ? "Enxugue o contexto para no máximo duas frases e diga o tamanho do problema (quantas pessoas, clientes, valor ou prazo)." : "Descreva o contexto em uma ou duas frases."),
      check("Responsabilidade individual explícita", Boolean(task) && /\b(eu|meu|minha|fui|precisava)\b/.test(fold(task)), 'Deixe claro o SEU papel: "minha responsabilidade era…", "eu precisava…".'),
      check("Ações concretas em primeira pessoa", /\beu\b|\b[a-z]{3,}ei\b|\b(decidi|propus|fiz|resolvi|criei|conduzi)\b/.test(fold(action)), 'Reescreva a ação com verbos em primeira pessoa ("eu mapeei…", "eu propus…") e em passos ordenados.'),
      check("Decisões justificadas (por quê / trade-offs)", /porque|para que|com o objetivo|optei|priorizei|em vez de|ao inves de|escolhi/.test(fold(action)), "Explique o porquê de cada decisão e que alternativa você descartou — é o principal sinal de senioridade."),
      check("Influência sobre pessoas/stakeholders", /stakeholder|gestor|diretor|cliente|lideranca|alinhei|negociei|convenci|apresentei|equipe|time|areas?/.test(fold(action)), "Mostre como você envolveu ou convenceu pessoas (gestor, outras áreas, clientes)."),
      check("Resultado mensurável (antes × depois)", /\d/.test(result), result ? "Inclua um número real: antes × depois, %, prazo, valor ou volume. Se não tiver o exato, use uma estimativa honesta." : "Informe o resultado, de preferência com um número real."),
      check("Impacto para o negócio/time", /receita|custo|economi|cliente|prazo|produtividade|satisfa|qualidade|venda|retrabalho|tempo|dias|horas|semanas|meses|%|por cento/.test(fold(result)), "Conecte o resultado a algo que importa para a empresa: custo, receita, prazo, cliente ou qualidade."),
      check("Aprendizado ou reflexão", learningGiven, 'Feche com uma frase de aprendizado ("o que aprendi foi…").'),
    ];
    const qualityScore = Math.round((checklist.filter((c) => c.ok).length / checklist.length) * 100);

    const competencyRules: [RegExp, string][] = [
      [/liderei|coordenei|gerenciei|equipe|time/, "Liderança"],
      [/negociei|convenci|alinhei|stakeholder/, "Influência e negociação"],
      [/resolvi|analisei|causa|diagnost|investiguei/, "Resolução de problemas"],
      [/priorizei|prioridade|prazo/, "Priorização e gestão do tempo"],
      [/dados|indicador|metrica|kpi|planilha|\d/, "Orientação a dados"],
      [/apresentei|comuniquei|reuniao|expliquei/, "Comunicação"],
      [/automatizei|criei|implementei|novo processo|melhorei/, "Melhoria contínua e inovação"],
      [/cliente/, "Foco no cliente"],
    ];
    const competencies = competencyRules.filter(([re]) => re.test(all)).map(([, label]) => label);

    const missingData = checklist
      .filter((c) => !c.ok)
      .map((c) => {
        switch (c.criterion) {
          case "Resultado mensurável (antes × depois)":
            return "Qual era o número antes e depois da sua ação (tempo, custo, volume, satisfação)?";
          case "Responsabilidade individual explícita":
            return "Qual era exatamente a SUA responsabilidade nesse caso?";
          case "Decisões justificadas (por quê / trade-offs)":
            return "Por que você escolheu esse caminho? Que alternativa você descartou?";
          case "Influência sobre pessoas/stakeholders":
            return "Quem você precisou envolver ou convencer, e como fez isso?";
          case "Impacto para o negócio/time":
            return "Que diferença isso fez para a empresa, o time ou o cliente?";
          case "Aprendizado ou reflexão":
            return "O que você aprendeu ou faria diferente hoje?";
          case "Contexto curto e com escala do problema":
            return "Qual era o tamanho do problema (pessoas, clientes, valor ou prazo envolvido)?";
          default:
            return "Quais passos você executou, em ordem?";
        }
      });

    return {
      generatedResponse,
      notes,
      analysis: {
        pitch,
        sections,
        competencies,
        checklist,
        seniorEnhancements: checklist.filter((c) => !c.ok && c.tip).map((c) => c.tip!),
        missingData,
        followUpQuestions: [
          "Qual foi a decisão mais difícil nesse caso e quais alternativas você considerou?",
          "Como você mediu o resultado?",
          "O que teria acontecido se você não tivesse agido?",
          "O que você faria diferente hoje?",
        ],
        qualityScore,
        engine: "heuristic",
      },
    };
  }

  /**
   * Avaliação heurística local (sem IA): transparente e determinística, mas
   * já no formato de um avaliador sênior — aponta o QUE falta e COMO
   * corrigir, com base em sinais objetivos do texto. Nunca inventa fatos.
   */
  async evaluateInterviewResponse(input: EvaluateResponseInput): Promise<EvaluateResponseOutput> {
    const transcript = input.transcript.trim();
    const lower = fold(transcript);
    const words = transcript ? transcript.split(/\s+/) : [];
    const wordCount = words.length;
    const sentences = transcript.split(/[.!?]+/).map((x) => x.trim()).filter(Boolean);
    const avgSentence = sentences.length ? wordCount / sentences.length : wordCount;

    const has = (re: RegExp) => re.test(lower);
    const star = {
      situacao: has(/\b(quando|na epoca|no meu (antigo )?(trabalho|emprego|time)|na empresa|trabalhava|contexto|cenario|situacao)\b/),
      tarefa: has(/\b(precisava|meu papel|minha responsabilidade|objetivo|meta|desafio|tarefa|fui (designad|responsavel)|me pediram)/),
      acao: has(/\b(eu (fiz|criei|decidi|organizei|propus|implementei|conversei|liderei|analisei|montei|estruturei|negociei)|decidi|implementei|propus|liderei|criei|analisei)/),
      resultado: has(/\b(resultado|consegui|conseguimos|reduzi|reduzimos|aumentei|aumentamos|melhorei|entreguei|economi|gerou|atingi|bati)/),
    };
    const metrics = transcript.match(/\d+([.,]\d+)?\s*(%|por cento|mil|milh|dias|semanas|meses|horas|reais|r\$|pessoas|clientes)?/gi) ?? [];
    const firstPersonSingular = (lower.match(/\beu\b|\bfiz\b|\bdecidi\b|\bpropus\b|\bliderei\b/g) ?? []).length;
    const firstPersonPlural = (lower.match(/\ba gente\b|\b(fizemos|decidimos|conseguimos|implementamos|criamos|resolvemos)\b/g) ?? []).length;
    const fillers = lower.match(/\b(tipo|ne|ai|entao|basicamente|meio que|sabe)\b/g) ?? [];
    const hypothetical = has(/\beu faria\b|\bfaria\b|\bse acontecesse\b|\bnormalmente eu\b/);
    const blame = has(/culpa (dele|dela|deles|do|da)|nao era minha responsabilidade|ninguem ajudava/);
    const learning = has(/aprendi|aprendizado|licao|faria diferente|hoje eu/);
    const tradeoff = has(/\b(prioriz|trade-?off|em vez de|ao inves de|optei|escolhi|risco|custo-beneficio)/);
    const stakeholders = has(/\b(stakeholders?|diretor|gestor|clientes?|lideranca|alinhei|negociei|convenci|areas?)\b/);

    const starCount = Object.values(star).filter(Boolean).length;
    const estrutura = !transcript ? 0 : Math.min(25, 5 + starCount * 4 + (learning ? 2 : 0) + (hypothetical ? -4 : 0));
    const clarezaBase = wordCount === 0 ? 0 : wordCount < 40 ? 8 : 17;
    const clareza = !transcript ? 0 : Math.max(0, Math.min(25, clarezaBase + (avgSentence <= 25 ? 4 : -2) - Math.min(8, Math.floor(fillers.length / 2))));
    const lengthScore = wordCount === 0 ? 0 : wordCount < 60 ? 9 : wordCount <= 350 ? 19 : wordCount <= 500 ? 13 : 8;
    const objetividade = !transcript ? 0 : Math.max(0, Math.min(25, lengthScore + (firstPersonSingular >= firstPersonPlural ? 3 : -2)));
    const resultado = !transcript ? 0 : Math.min(25, (star.resultado ? 12 : 3) + Math.min(8, metrics.length * 4) + (learning ? 3 : 0));

    const breakdown = { estrutura, clareza, objetividade, resultado };
    const score = estrutura + clareza + objetividade + resultado;

    const strengths: string[] = [];
    const improvements: string[] = [];
    const missing = (Object.entries(star) as [keyof typeof star, boolean][])
      .filter(([, ok]) => !ok)
      .map(([k]) => ({ situacao: "Situação", tarefa: "Tarefa", acao: "Ação", resultado: "Resultado" })[k]);

    if (starCount >= 3) strengths.push(`Sua resposta cobre ${starCount} das 4 etapas do STAR — a narrativa tem começo, meio e fim.`);
    if (missing.length > 0 && transcript) {
      improvements.push(
        `Faltou deixar explícito: ${missing.join(", ")}. Abra com 1–2 frases de contexto, diga qual era a SUA responsabilidade, detalhe o que VOCÊ fez e feche com o resultado.`
      );
    }
    if (metrics.length > 0) strengths.push("Você trouxe números concretos — isso dá credibilidade ao resultado.");
    else if (transcript) improvements.push('Quantifique o resultado: "reduzi o prazo de X para Y", "aumentei em Z%", "atendemos N clientes". Se não tiver o número exato, use uma estimativa honesta.');
    if (firstPersonPlural > firstPersonSingular && transcript) improvements.push('Você usou mais "nós/a gente" do que "eu". O entrevistador quer saber o SEU papel: troque por "eu propus…", "eu decidi…".');
    else if (firstPersonSingular > 0) strengths.push("Bom protagonismo: fica claro o que você fez pessoalmente.");
    if (fillers.length >= 4) improvements.push(`Foram ${fillers.length} vícios de linguagem ("tipo", "né", "aí"…). Faça pausas curtas no lugar deles.`);
    if (wordCount > 0 && wordCount < 60) improvements.push("A resposta ficou curta demais para demonstrar competência. Mire em 1:30–2:30 min, com foco maior na Ação.");
    if (wordCount > 450) improvements.push("A resposta ficou longa. Corte detalhes do contexto e mantenha ~50% do tempo na Ação.");
    if (hypothetical) improvements.push('Evite respostas hipotéticas ("eu faria…"). Conte um caso real que você viveu.');
    if (!learning && transcript) improvements.push('Feche com um aprendizado: "o que aprendi foi…" ou "hoje eu faria diferente…" — é um forte sinal de maturidade.');
    if (!transcript) improvements.push("Não identificamos conteúdo na resposta — grave novamente ou digite sua resposta.");

    const seniorSignals: string[] = [];
    if (tradeoff) seniorSignals.push("Explicou escolhas/prioridades (trade-offs).");
    if (stakeholders) seniorSignals.push("Envolveu stakeholders/outras áreas.");
    if (metrics.length > 0) seniorSignals.push("Usou dados para sustentar o resultado.");
    if (learning) seniorSignals.push("Demonstrou aprendizado e autocrítica.");
    if (firstPersonSingular > firstPersonPlural) seniorSignals.push("Protagonismo claro (ownership).");

    const redFlags: string[] = [];
    if (hypothetical) redFlags.push("Resposta hipotética em vez de experiência real.");
    if (blame) redFlags.push("Atribui o problema a terceiros sem mostrar o próprio papel na solução.");
    if (transcript && !star.resultado) redFlags.push("Não há resultado — o entrevistador fica sem saber se a ação funcionou.");

    // Calibração por nível de experiência (item C da avaliação de UX, 04/11/2026).
    // Ausente = sem calibração (comportamento de sempre). A nota numérica não
    // muda (fica comparável); o que muda é a exigência sobre sinais de
    // senioridade e os limiares de "maturidade da resposta".
    const level = input.experienceLevel;
    if (transcript && level === "junior") {
      strengths.push(
        "Pelo seu nível (júnior), o que mais importa agora é estrutura e clareza — sinais de senioridade (ownership, trade-offs, visão de negócio) vêm com o tempo e não pesam contra você ainda."
      );
    } else if (transcript && level === "senior" && seniorSignals.length === 0) {
      improvements.push(
        "Para o nível sênior, a resposta precisa mostrar sinais claros de senioridade — ownership, trade-offs explicados, visão de negócio ou influência sobre outras áreas. Sem isso, a resposta soa junior/pleno mesmo bem estruturada."
      );
    }

    // Modo aumento/promoção: sinais específicos de uma boa conversa de carreira.
    const career = input.context === "aumento_promocao";
    if (career && transcript) {
      // Troca as mensagens típicas de entrevista pelas de uma conversa com o gestor.
      const swap = (list: string[], from: RegExp, to: string | null) => {
        const i = list.findIndex((m) => from.test(m));
        if (i >= 0) {
          if (to) list[i] = to;
          else list.splice(i, 1);
        }
      };
      swap(improvements, /^Faltou deixar explícito/, "Organize o argumento: contexto em uma frase → o que você entrega hoje (escopo atual × escopo de quando entrou) → impacto com evidência → pedido claro → próximo passo.");
      swap(improvements, /^Feche com um aprendizado/, 'Feche com um próximo passo: "podemos combinar uma data para decidir?" ou "quais critérios eu preciso cumprir?".');
      swap(improvements, /curta demais para demonstrar competência/, "A resposta ficou curta demais para sustentar o pedido. Mire em 1–2 minutos, com exemplos concretos do seu impacto.");
      swap(improvements, /^Evite respostas hipotéticas/, null);
      swap(redFlags, /^Não há resultado/, "Sem evidência de resultado — o gestor fica sem argumento para defender o seu pedido junto a quem aprova.");
      const hasAsk = /aumento|reajuste|promoc|salario|faixa|cargo|nivel|remunerac/.test(lower);
      const hasMarket = /mercado|pesquisa salarial|faixa salarial|politica de cargos|plano de carreira/.test(lower);
      const hasImpact = metrics.length > 0 || /resultado|entreguei|reduzi|aumentei|economi|meta|cliente/.test(lower);
      const ultimatum = /senao (eu )?(vou|saio)|vou sair|outra proposta|outra empresa me ofereceu|ou entao eu/.test(lower);
      const comparesPeers = /(fulano|ele|ela|meu colega|minha colega) ganha|ganha mais (do )?que eu/.test(lower);
      const personalNeed = /minhas contas|minhas despesas|preciso pagar|aluguel|custo de vida|estou precisando/.test(lower);
      if (hasAsk) strengths.push("Você deixou claro o que está pedindo — isso facilita a decisão do gestor.");
      else improvements.push('Diga explicitamente o que você está pedindo: o cargo, ou um valor/faixa ("gostaria de ir para o meio da faixa de analista pleno").');
      if (hasMarket) strengths.push("Você trouxe uma referência de mercado ou da política da empresa.");
      else improvements.push("Ancore o pedido em uma referência: faixa de mercado do cargo (pesquisas salariais) ou a política de cargos e salários da empresa.");
      if (!hasImpact) improvements.push("Mostre o valor que você entregou para a empresa — de preferência com um número de antes e depois.");
      if (ultimatum) redFlags.push("Tom de ultimato/ameaça de sair: tende a fechar a conversa. Use propostas externas só como referência de mercado.");
      if (comparesPeers) redFlags.push("Comparar seu salário com o de colegas enfraquece o pedido — fale do seu escopo e do mercado.");
      if (personalNeed) redFlags.push("Necessidades pessoais como argumento principal: o gestor precisa justificar o pedido com o valor que você entrega.");
      if (hasAsk && hasMarket) seniorSignals.push("Pedido específico e embasado em referência externa.");
      if (/alternativa|data para rever|revisao|proximo ciclo|criterios/.test(lower)) seniorSignals.push("Abertura para alternativas com data e critérios.");
    }

    const quote = (re: RegExp) => sentences.find((x) => re.test(fold(x)));
    const criteria: CriterionAnalysis[] = ([
      { key: "estrutura", score: estrutura, justification: `${starCount}/4 etapas do STAR identificadas${missing.length ? ` (faltou: ${missing.join(", ")})` : ""}.` },
      { key: "clareza", score: clareza, justification: `${sentences.length} frase(s), média de ${Math.round(avgSentence)} palavras por frase; ${fillers.length} vício(s) de linguagem.` },
      { key: "objetividade", score: objetividade, justification: `${wordCount} palavras (ideal: 150–350). Uso de "eu": ${firstPersonSingular} × "nós": ${firstPersonPlural}.` },
      { key: "resultado", score: resultado, justification: star.resultado ? `Resultado mencionado${metrics.length ? ` com ${metrics.length} dado(s) numérico(s)` : ", mas sem número"}.` : "Nenhum resultado explícito." },
    ] as CriterionAnalysis[]).map((c) => {
      const ev = c.key === "resultado" ? quote(/result|consegui|reduzi|aumentei|melhorei|entreguei/) : c.key === "estrutura" ? quote(/quando|na epoca|contexto|situacao/) : undefined;
      return ev ? { ...c, evidence: ev } : c;
    });

    const improvedAnswer = career && transcript
      ? [
          "[Abertura: o objetivo da conversa em uma frase — ex.: quero conversar sobre a minha evolução e a revisão do meu cargo/salário]",
          "[Evolução do escopo: o que você fazia quando entrou × o que faz hoje]",
          metrics.length ? "[Impacto: retome os números que você citou e o que eles significam para a empresa]" : "[Impacto: de dois a três resultados concretos, de preferência com número de antes e depois]",
          "[Pedido: o cargo e/ou o valor ou faixa, e a referência usada — mercado ou política da empresa]",
          "[Próximo passo: combinar uma data para a decisão e os critérios, caso não seja possível agora]",
        ].join("\n")
      : transcript
      ? [
          star.situacao ? "[Situação: resuma em 1–2 frases o contexto que você descreveu]" : "[Situação: onde você estava e qual era o contexto — 1 a 2 frases]",
          star.tarefa ? "[Tarefa: retome qual era a SUA responsabilidade]" : "[Tarefa: qual era o seu objetivo ou responsabilidade específica]",
          star.acao ? "[Ação: detalhe, em primeira pessoa, os 2–3 passos que você mencionou, explicando por que escolheu cada um]" : "[Ação: o que VOCÊ fez, passo a passo, e por quê]",
          star.resultado ? (metrics.length ? "[Resultado: retome os números que você citou e o impacto para o negócio]" : "[Resultado: inclua o resultado medido — %, prazo, valor ou volume]") : "[Resultado: o que mudou depois da sua ação — idealmente com um número]",
          "[Aprendizado: o que você aprendeu ou faria diferente]",
        ].join("\n")
      : "";

    return {
      score,
      breakdown,
      strengths,
      improvements,
      nextAction:
        improvements.length > 0
          ? `Grave de novo esta mesma pergunta corrigindo primeiro: ${improvements[0]?.split(".")[0]}.`
          : "Pratique outra pergunta de categoria diferente para manter a consistência.",
      analysis: {
        answerMaturity: maturityLabel(score, level),
        verdict: !transcript
          ? "Não houve conteúdo para avaliar."
          : career
            ? `${score >= 70 ? "Pedido bem encaminhado." : "O pedido ainda não está pronto para ser defendido pelo gestor."} ${
                redFlags.length > 0
                  ? "Corrija primeiro os pontos de atenção — eles tendem a fechar a conversa."
                  : "Reforce as evidências de impacto e deixe o pedido e o próximo passo explícitos."
              }`
          : `Resposta com ${starCount}/4 etapas do STAR${metrics.length ? " e resultado quantificado" : " e sem resultado quantificado"}. ${
              score >= 70 ? "Boa base; refine os detalhes apontados para chegar ao nível sênior." : "Para soar sênior, deixe claro o seu papel, as decisões tomadas e o impacto medido."
            }`,
        criteria,
        starCoverage: star,
        seniorSignals,
        redFlags,
        improvedAnswer,
        followUpQuestions: !transcript
          ? []
          : career
            ? [
                "O orçamento deste ano já está fechado. O que você propõe?",
                "O que você já faz hoje que é do nível do cargo que está pedindo?",
                "Como você chegou a esse valor?",
              ]
            : [
                "Qual foi a decisão mais difícil nesse caso e quais alternativas você considerou?",
                "Como você mediu o resultado? Qual era o número antes e depois?",
                "O que você faria diferente hoje?",
              ],
        engine: "heuristic",
      },
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

/**
 * Rótulo de "maturidade da resposta" a partir da nota (0–100), com os
 * limiares deslocados pelo nível de experiência declarado: mesma nota lê
 * como um rótulo mais generoso para quem é júnior e mais exigente para quem
 * é sênior — a nota numérica em si não muda. Sem nível informado, usa os
 * limiares padrão (mesmo comportamento de antes desta calibração).
 */
function maturityLabel(
  score: number,
  level?: "junior" | "pleno" | "senior"
): "inicial" | "em desenvolvimento" | "sólida" | "sênior" {
  const t =
    level === "junior"
      ? { senior: 75, solida: 55, dev: 30 }
      : level === "senior"
        ? { senior: 90, solida: 75, dev: 55 }
        : { senior: 85, solida: 70, dev: 45 };
  return score >= t.senior ? "sênior" : score >= t.solida ? "sólida" : score >= t.dev ? "em desenvolvimento" : "inicial";
}

/** Minúsculas e sem acentos — `\b` do JavaScript não reconhece letras acentuadas. */
function fold(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
