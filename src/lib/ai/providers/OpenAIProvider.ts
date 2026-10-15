import type {
  AIProvider,
  EvaluateResponseInput,
  EvaluateResponseOutput,
  InterviewQuestionSelection,
  StarInput,
  StarOutput,
} from "../AIProvider";

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
const SYSTEM_PROMPT = `Você é um assistente de preparação de entrevistas de emprego do CarreiraPro.

Regras obrigatórias:
- Nunca invente fatos sobre o usuário: empresas, cargos, resultados, métricas, experiências ou certificações que não tenham sido fornecidos explicitamente.
- Se faltar uma informação (ex.: resultado mensurável), diga isso claramente em vez de preencher a lacuna. Nunca invente um número.
- Preserve a voz e os fatos do usuário; sua função é melhorar clareza, organizar cronologia e eliminar redundância — não substituir o conteúdo.
- Nunca prometa ou insinue que a preparação garante contratação, aprovação ou qualquer resultado profissional.
- Use linguagem profissional, construtiva e sem julgamento.`;

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";

  constructor(
    private readonly apiKey: string,
    private readonly model: string = "gpt-4o-mini"
  ) {}

  private async chat(userPrompt: string): Promise<string> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Provedor de IA respondeu com status ${response.status}.`);
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };

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

    const prompt = `Organize a resposta abaixo no método STAR, usando apenas os fatos fornecidos.
Se algum campo estiver vazio, não invente conteúdo para ele — apenas mencione no final, em uma lista de observações separada por "---NOTES---", que a informação está faltando.

Situação: ${input.situation || "(não informado)"}
Tarefa: ${input.task || "(não informado)"}
Ação: ${input.action || "(não informado)"}
Resultado: ${input.result || "(não informado)"}

Responda no formato:
<resposta estruturada>
---NOTES---
<uma observação por linha, ou "nenhuma" se não houver lacunas>`;

    const raw = await this.chat(prompt);
    const [responseText, notesText] = raw.split("---NOTES---");

    const notes = (notesText ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && l.toLowerCase() !== "nenhuma" && l !== "-");

    return {
      generatedResponse: (responseText ?? raw).trim(),
      notes: notes.length > 0 ? notes : missing.map((m) => `Campo "${m}" não foi informado.`),
    };
  }

  async evaluateInterviewResponse(input: EvaluateResponseInput): Promise<EvaluateResponseOutput> {
    const prompt = `Avalie a transcrição de uma resposta de entrevista de treinamento (não avalie empregabilidade, apenas qualidade de treinamento).

Pergunta: ${input.question}
Transcrição: ${input.transcript || "(vazia)"}

Responda estritamente em JSON, sem markdown, no formato:
{"estrutura": 0-25, "clareza": 0-25, "objetividade": 0-25, "resultado": 0-25, "strengths": ["..."], "improvements": ["..."], "nextAction": "..."}`;

    const raw = await this.chat(prompt);
    const parsed = JSON.parse(raw) as {
      estrutura: number;
      clareza: number;
      objetividade: number;
      resultado: number;
      strengths: string[];
      improvements: string[];
      nextAction: string;
    };

    const score = parsed.estrutura + parsed.clareza + parsed.objetividade + parsed.resultado;

    return {
      score,
      breakdown: {
        estrutura: parsed.estrutura,
        clareza: parsed.clareza,
        objetividade: parsed.objetividade,
        resultado: parsed.resultado,
      },
      strengths: parsed.strengths,
      improvements: parsed.improvements,
      nextAction: parsed.nextAction,
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
