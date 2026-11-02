import type {
  AIProvider,
  CriterionAnalysis,
  CriterionKey,
  EvaluateResponseInput,
  EvaluateResponseOutput,
  InterviewAnalysis,
  InterviewQuestionSelection,
  StarAnalysis,
  StarInput,
  StarOutput,
} from "../AIProvider";
import { reportAiUsage } from "@/lib/usage/meter";

/**
 * Implementação real via API compatível com a Chat Completions da OpenAI.
 *
 * PENDENTE DE CREDENCIAIS: só é instanciado quando `AI_PROVIDER_API_KEY`
 * está definido (ver `../index.ts`). Sem a chave, a aplicação usa
 * `MockAIProvider` automaticamente.
 *
 * O prompt de sistema abaixo reforça o princípio anti-alucinação exigido em
 * todas as funcionalidades de IA (PROMPT MESTRE §19, §39): a IA nunca deve
 * inventar fatos, experiências, empresas, cargos, métricas ou resultados que
 * não tenham sido fornecidos pelo usuário.
 */
const SYSTEM_PROMPT = `Você é um assistente de preparação de entrevistas de emprego do VoceUP.

Regras obrigatórias:
- Nunca invente fatos sobre o usuário: empresas, cargos, resultados, métricas, experiências ou certificações que não tenham sido fornecidos explicitamente.
- Se faltar uma informação (ex.: resultado mensurável), diga isso claramente em vez de preencher a lacuna. Nunca invente um número.
- Preserve a voz e os fatos do usuário; sua função é melhorar clareza, organizar cronologia e eliminar redundância — não substituir o conteúdo.
- Nunca prometa ou insinue que a preparação garante contratação, aprovação ou qualquer resultado profissional.
- Use linguagem profissional, construtiva e sem julgamento.`;

/** Rubrica do modo entrevista de emprego. */
const INTERVIEW_GUIDE = `Avalie esta resposta de TREINAMENTO como um entrevistador sênior (Head/Diretor com 15+ anos conduzindo entrevistas comportamentais e por competências em empresas de alta performance). Seja rigoroso, específico e acionável — feedback genérico ("seja mais claro") é inaceitável: sempre diga O QUE mudar e COMO, apontando o trecho.

RÚBRICA (0–25 cada, total 0–100):
- estrutura: cobertura e equilíbrio de Situação → Tarefa → Ação → Resultado; contexto curto (≤20%), foco na Ação (~50%), fechamento com Resultado + aprendizado. Responde de fato à pergunta feita?
- clareza: narrativa cronológica, frases objetivas, ausência de vícios de linguagem ("tipo", "né", "aí", "então"), termos técnicos explicados, fácil de seguir por quem não conhece o contexto.
- objetividade: vai direto ao ponto, duração adequada (≈1:30–2:30 min / 150–350 palavras), sem rodeios nem divagações, protagonismo claro ("eu fiz" × "a gente fez").
- resultado: impacto concreto e, idealmente, mensurável (números, %, prazo, receita, custo, NPS); conexão entre ação e resultado; aprendizado ou o que faria diferente.
Calibração: 0–8 ausente/fraco · 9–15 parcial · 16–20 bom · 21–25 excelente (nível sênior). Notas acima de 20 exigem evidência explícita na resposta. Não infle notas.

SINAIS DE SENIORIDADE a procurar: protagonismo e ownership; decisões com trade-offs explicados; influência sobre stakeholders/liderança sem autoridade; pensamento sistêmico e visão de negócio; uso de dados; escala/complexidade do problema; aprendizado e autocrítica.
RED FLAGS a apontar: culpar terceiros; resposta hipotética ("eu faria") quando a pergunta pede experiência real; ausência de resultado; "nós" sem explicitar o próprio papel; exageros sem sustentação; falar mal de empresa anterior; fugir da pergunta.`;

/** Rubrica do modo aumento/promoção (conversa com gestor/RH/comitê na empresa atual). */
const CAREER_GUIDE = `Contexto: o profissional JÁ trabalha na empresa e está treinando a conversa para pedir aumento ou promoção (com o gestor, o RH ou um comitê). A "pergunta" é o que o gestor perguntaria ou a objeção que ele faria.
Avalie esta resposta de TREINAMENTO como um gestor sênior e business partner de RH com 15+ anos conduzindo ciclos de avaliação, promoção e remuneração. Seja rigoroso, específico e acionável — sempre diga O QUE mudar e COMO, apontando o trecho.

RÚBRICA (0–25 cada, total 0–100):
- estrutura: a resposta segue um caminho convincente — contexto curto → contribuições e evolução do escopo → impacto/evidências → pedido claro (valor, faixa ou cargo) → próximo passo. Responde de fato à pergunta/objeção feita?
- clareza: argumentos fáceis de seguir, linguagem profissional, sem rodeios, sem vícios de linguagem; o gestor entenderia e conseguiria repassar o argumento para quem aprova.
- objetividade: vai direto ao ponto, faz um pedido específico (não "o que vocês acharem justo"), tamanho adequado (≈1–2 min), sem desabafo nem justificativas pessoais.
- resultado: evidências concretas e, idealmente, mensuráveis do impacto para a empresa (receita, custo, prazo, qualidade, clientes); referência de mercado ou da política salarial; demonstra que já atua no nível pedido.
Calibração: 0–8 ausente/fraco · 9–15 parcial · 16–20 bom · 21–25 excelente. Notas acima de 20 exigem evidência explícita na resposta. Não infle notas.

SINAIS DE MATURIDADE a procurar: foco no valor entregue à empresa (não na necessidade pessoal); pedido específico e embasado (mercado, política, escopo); comparação entre escopo antigo e atual; prontidão para o próximo nível com exemplos; abertura a alternativas (pacote, data de revisão, critérios); visão de sucessão/continuidade; tom colaborativo.
RED FLAGS a apontar: ultimato ou ameaça de sair; blefe com proposta externa; comparar salário com colegas; usar despesas pessoais ou tempo de casa como argumento principal; não dizer o que está pedindo; aceitar "vamos ver" sem data nem critério; números sem fonte; tom de cobrança ou vitimização.
Em "followUpQuestions", liste objeções e perguntas que o gestor/RH provavelmente faria em seguida (ex.: orçamento, prontidão, comparação com o time).
Em "nextAction", proponha um exercício concreto para a próxima conversa (ex.: montar o resumo de uma página com entregas e faixa de mercado).`;

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";

  constructor(
    private readonly apiKey: string,
    private readonly model: string = "gpt-4o"
  ) {}

  private async chat(
    userPrompt: string,
    options: { json?: boolean; temperature?: number; system?: string } = {}
  ): Promise<string> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: options.temperature ?? 0.3,
        ...(options.json ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: options.system ?? SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`[ai] OpenAI respondeu ${response.status}: ${detail.slice(0, 500)}`);
      throw new Error(`Provedor de IA respondeu com status ${response.status}.`);
    }

    const data = (await response.json()) as {
      model?: string;
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    // Tokens informados pela própria OpenAI → custo por usuário no admin.
    reportAiUsage({
      provider: this.name,
      model: data.model ?? this.model,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    });

    const content = data.choices[0]?.message.content;
    if (!content) throw new Error("Resposta vazia do provedor de IA.");
    return content;
  }

  async generateStarResponse(input: StarInput): Promise<StarOutput> {
    const missing: string[] = [];
    if (!input.situation.trim()) missing.push("situação");
    if (!input.task.trim()) missing.push("tarefa");
    if (!input.action.trim()) missing.push("ação");
    if (!input.result.trim()) missing.push("resultado");

    const prompt = `Transforme a experiência abaixo em uma resposta de entrevista pelo método STAR, no padrão que um candidato SÊNIOR apresentaria.

${input.targetQuestion?.trim() ? `PERGUNTA/COMPETÊNCIA QUE A HISTÓRIA DEVE RESPONDER: """${input.targetQuestion.trim()}"""\n` : ""}${input.targetRole?.trim() ? `CARGO/NÍVEL PRETENDIDO: """${input.targetRole.trim()}"""\n` : ""}
RELATO DO CANDIDATO:
Situação: """${input.situation || "(não informado)"}"""
Tarefa: """${input.task || "(não informado)"}"""
Ação: """${input.action || "(não informado)"}"""
Resultado: """${input.result || "(não informado)"}"""

COMO CONSTRUIR A RESPOSTA ("answer"):
- Primeira pessoa, tom profissional e natural para ser FALADO em ~2 minutos (180–300 palavras).
- Proporção: Situação ~15% (contexto enxuto, com escala/impacto do problema se informado) · Tarefa ~10% (a SUA responsabilidade e o que estava em jogo) · Ação ~50% (2–4 passos concretos, em ordem, com o PORQUÊ de cada decisão, alternativas consideradas e como lidou com pessoas/stakeholders) · Resultado ~20% (impacto para o negócio/time, comparação antes × depois) · Aprendizado ~5% (o que aprendeu ou faria diferente).
- Abra com uma frase-gancho que já sinalize o desafio e feche conectando o resultado à pergunta/cargo, quando informados.
- Elimine redundâncias, jargão vago e voz passiva; use verbos de ação fortes (liderei, estruturei, negociei, priorizei).
- Se o candidato usou "nós", mantenha "nós" para o time, mas deixe explícito o papel dele SOMENTE se ele informou; se não informou, sinalize em "missingData".

REGRAS ANTI-ALUCINAÇÃO (obrigatórias, acima de qualquer outra):
- Use EXCLUSIVAMENTE os fatos do relato. Nunca invente empresas, cargos, números, prazos, ferramentas, pessoas ou resultados.
- Onde faltar algo importante, escreva no próprio texto um marcador entre colchetes dizendo o que o candidato deve inserir, ex.: "[inclua o resultado medido: % de redução, prazo ou valor]". Nunca preencha com números de exemplo.
- Você pode melhorar redação, ordem, transições e clareza; não pode mudar o significado do que foi dito.

Responda SOMENTE com JSON válido (sem markdown), exatamente neste formato:
{
  "answer": "resposta completa para falar",
  "pitch": "versão de 30–45 segundos (60–100 palavras), mesmos fatos",
  "sections": {"situacao": "…", "tarefa": "…", "acao": "…", "resultado": "…", "aprendizado": "… ou [lacuna]"},
  "competencies": ["competência demonstrada", "…"],
  "checklist": [
    {"criterion": "Contexto curto e com escala do problema", "ok": true, "tip": "…"},
    {"criterion": "Responsabilidade individual explícita", "ok": true, "tip": "…"},
    {"criterion": "Ações concretas em primeira pessoa", "ok": true, "tip": "…"},
    {"criterion": "Decisões justificadas (por quê / trade-offs)", "ok": true, "tip": "…"},
    {"criterion": "Influência sobre pessoas/stakeholders", "ok": true, "tip": "…"},
    {"criterion": "Resultado mensurável (antes × depois)", "ok": true, "tip": "…"},
    {"criterion": "Impacto para o negócio/time", "ok": true, "tip": "…"},
    {"criterion": "Aprendizado ou reflexão", "ok": true, "tip": "…"}
  ],
  "seniorEnhancements": ["como elevar esta história ao nível sênior, de forma específica e sem inventar fatos", "…"],
  "missingData": ["pergunta direta para o candidato responder e completar a história", "…"],
  "followUpQuestions": ["pergunta de aprofundamento provável do entrevistador", "…"],
  "qualityScore": 0
}
"qualityScore" (0–100) mede a qualidade da HISTÓRIA como foi relatada (não a sua reescrita) e nunca a chance de contratação.`;

    const raw = await this.chat(prompt, {
      json: true,
      temperature: 0.3,
      system: `${SYSTEM_PROMPT}
- Você atua como coach sênior de carreira e ex-entrevistador de empresas de alta performance, especialista no método STAR e em entrevistas por competências. Escreva em português do Brasil.`,
    });
    const parsed = parseJsonObject(raw);

    const sectionsRaw = (parsed.sections ?? {}) as Record<string, unknown>;
    const checklist = Array.isArray(parsed.checklist)
      ? (parsed.checklist as Record<string, unknown>[])
          .filter((c) => c && typeof c.criterion === "string")
          .map((c) => ({
            criterion: asString(c.criterion),
            ok: Boolean(c.ok),
            ...(asString(c.tip) ? { tip: asString(c.tip) } : {}),
          }))
      : [];
    const qualityRaw = Number(parsed.qualityScore);

    const analysis: StarAnalysis = {
      pitch: asString(parsed.pitch),
      sections: {
        situacao: asString(sectionsRaw.situacao),
        tarefa: asString(sectionsRaw.tarefa),
        acao: asString(sectionsRaw.acao),
        resultado: asString(sectionsRaw.resultado),
        aprendizado: asString(sectionsRaw.aprendizado),
      },
      competencies: asStringArray(parsed.competencies),
      checklist,
      seniorEnhancements: asStringArray(parsed.seniorEnhancements),
      missingData: asStringArray(parsed.missingData),
      followUpQuestions: asStringArray(parsed.followUpQuestions),
      qualityScore: Number.isFinite(qualityRaw) ? Math.min(100, Math.max(0, Math.round(qualityRaw))) : 0,
      engine: "ai",
    };

    const answer = asString(parsed.answer);
    if (!answer) throw new Error("IA não devolveu a resposta STAR.");

    const notes = [
      ...missing.map((m) => `Campo "${m}" não foi informado.`),
      ...analysis.missingData,
    ];

    return { generatedResponse: answer, notes, analysis };
  }

  async evaluateInterviewResponse(input: EvaluateResponseInput): Promise<EvaluateResponseOutput> {
    const guide = input.context === "aumento_promocao" ? CAREER_GUIDE : INTERVIEW_GUIDE;
    const prompt = `PERGUNTA FEITA AO CANDIDATO:
"""${input.question}"""

RESPOSTA DO CANDIDATO (transcrição de áudio — pode conter pequenos erros de reconhecimento de fala; não penalize erros de transcrição, avalie o conteúdo):
"""${input.transcript || "(vazia)"}"""

${guide}

REGRAS ANTI-ALUCINAÇÃO (obrigatórias):
- Use apenas o que o candidato disse. Nunca invente empresas, números, cargos ou resultados.
- Em "improvedAnswer", reescreva a resposta em primeira pessoa no método STAR usando SOMENTE os fatos ditos; onde faltar informação, insira um marcador entre colchetes dizendo o que o candidato deve preencher (ex.: "[inclua o resultado medido: % de redução, prazo ou valor]"). Nunca preencha com números inventados.
- "evidence" deve ser um trecho LITERAL curto da resposta (ou omitido se não houver).
- Se a resposta estiver vazia ou não responder à pergunta, dê notas baixas e explique.

Responda SOMENTE com um JSON válido (sem markdown) exatamente neste formato:
{
  "criteria": [
    {"key": "estrutura", "score": 0, "justification": "…", "evidence": "…"},
    {"key": "clareza", "score": 0, "justification": "…", "evidence": "…"},
    {"key": "objetividade", "score": 0, "justification": "…", "evidence": "…"},
    {"key": "resultado", "score": 0, "justification": "…", "evidence": "…"}
  ],
  "starCoverage": {"situacao": true, "tarefa": true, "acao": true, "resultado": false},
  "answerMaturity": "inicial | em desenvolvimento | sólida | sênior",
  "verdict": "parecer executivo de 2–3 frases, direto, como um avaliador sênior escreveria",
  "strengths": ["ponto forte específico, citando o que foi dito", "…"],
  "improvements": ["melhoria específica: o que mudar + como + exemplo de frase", "…"],
  "seniorSignals": ["…"],
  "redFlags": ["…"],
  "improvedAnswer": "resposta reescrita (120–250 palavras), só com os fatos do candidato + [lacunas]",
  "followUpQuestions": ["pergunta de aprofundamento que um entrevistador faria", "…"],
  "nextAction": "um exercício prático e concreto para a próxima tentativa"
}`;

    const raw = await this.chat(prompt, {
      json: true,
      temperature: 0.2,
      system: `${SYSTEM_PROMPT}
- ${
        input.context === "aumento_promocao"
          ? "Você atua como um gestor sênior e business partner de RH experiente, avaliando como o profissional conduz um pedido de aumento ou promoção na empresa atual"
          : "Você atua como avaliador sênior de entrevistas comportamentais"
      }. Escreva em português do Brasil, com tom profissional, direto e construtivo.
- A nota mede apenas a qualidade desta resposta de treinamento — nunca a chance de contratação, aumento ou promoção.`,
    });
    const parsed = parseJsonObject(raw);

    const criteria = normalizeCriteria(parsed.criteria, parsed);
    const breakdown = {
      estrutura: criteria.find((c) => c.key === "estrutura")!.score,
      clareza: criteria.find((c) => c.key === "clareza")!.score,
      objetividade: criteria.find((c) => c.key === "objetividade")!.score,
      resultado: criteria.find((c) => c.key === "resultado")!.score,
    };
    const score = breakdown.estrutura + breakdown.clareza + breakdown.objetividade + breakdown.resultado;

    const star = (parsed.starCoverage ?? {}) as Record<string, unknown>;
    const analysis: InterviewAnalysis = {
      answerMaturity: normalizeMaturity(parsed.answerMaturity, score),
      verdict: asString(parsed.verdict),
      criteria,
      starCoverage: {
        situacao: Boolean(star.situacao),
        tarefa: Boolean(star.tarefa),
        acao: Boolean(star.acao),
        resultado: Boolean(star.resultado),
      },
      seniorSignals: asStringArray(parsed.seniorSignals),
      redFlags: asStringArray(parsed.redFlags),
      improvedAnswer: asString(parsed.improvedAnswer),
      followUpQuestions: asStringArray(parsed.followUpQuestions),
      engine: "ai",
    };

    return {
      score,
      breakdown,
      strengths: asStringArray(parsed.strengths),
      improvements: asStringArray(parsed.improvements),
      nextAction: asString(parsed.nextAction) || "Grave a resposta novamente aplicando as melhorias acima.",
      analysis,
    };
  }

  async generateInterviewQuestion(
    available: InterviewQuestionSelection[]
  ): Promise<InterviewQuestionSelection> {
    // A seleção em si permanece determinística e vinda do banco real de
    // perguntas — a IA não deve "inventar" uma pergunta nova. Mantido igual
    // ao MockAIProvider por design.
    if (available.length === 0) {
      throw new Error("Nenhuma pergunta disponível no banco de perguntas.");
    }
    const index = Math.floor(Math.random() * available.length);
    return available[index]!;
  }
}

// ---------------------------------------------------------------------------
// Helpers de parsing — a IA pode devolver JSON com cercas de markdown, campos
// faltando ou notas fora da escala; nada disso pode derrubar a rota.
// ---------------------------------------------------------------------------

function parseJsonObject(raw: string): Record<string, unknown> {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error("Resposta da IA não é um JSON válido.");
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim())
    : [];
}

function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(25, Math.max(0, Math.round(n)));
}

const CRITERIA_KEYS: CriterionKey[] = ["estrutura", "clareza", "objetividade", "resultado"];

function normalizeCriteria(value: unknown, flat: Record<string, unknown>): CriterionAnalysis[] {
  const list = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  return CRITERIA_KEYS.map((key) => {
    const item = list.find((c) => c && c.key === key);
    const evidence = asString(item?.evidence);
    return {
      key,
      // Compatível também com o formato antigo ({"estrutura": 18, ...}).
      score: clampScore(item?.score ?? flat[key]),
      justification: asString(item?.justification),
      ...(evidence ? { evidence } : {}),
    };
  });
}

function normalizeMaturity(value: unknown, score: number): InterviewAnalysis["answerMaturity"] {
  const v = asString(value).toLowerCase();
  if (v.includes("sênior") || v.includes("senior")) return "sênior";
  if (v.includes("sólida") || v.includes("solida")) return "sólida";
  if (v.includes("desenvolvimento")) return "em desenvolvimento";
  if (v.includes("inicial")) return "inicial";
  return score >= 85 ? "sênior" : score >= 70 ? "sólida" : score >= 45 ? "em desenvolvimento" : "inicial";
}
