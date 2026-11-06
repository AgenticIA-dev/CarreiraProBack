import { z } from "zod";
import { In } from "typeorm";
import { requireActiveApiUser } from "@/lib/auth/apiAuth";
import { rateLimit } from "@/lib/security/rateLimit";
import { InterviewSessionEntity, QuestionEntity } from "@/lib/db/entities";
import { getAIProvider } from "@/lib/ai";
import { questionsSeed } from "@/data/questions.seed";
import type { QuestionCategory, QuestionDifficulty } from "@/types/database";

const CATEGORIES = [
  "comportamental",
  "star",
  "tecnica",
  "situacional",
  "fit_cultural",
  "lideranca",
  "aumento_promocao",
] as const satisfies readonly QuestionCategory[];
const DIFFICULTIES = ["iniciante", "intermediaria", "avancada"] as const satisfies readonly QuestionDifficulty[];

/**
 * Corpo opcional:
 *  - mode: "entrevista" (padrão: as 6 competências de entrevista) ou
 *    "aumento_promocao" (conversa de aumento/promoção na empresa atual).
 *  - category / difficulty: filtros opcionais.
 *  - questionId: treinar uma pergunta específica (vinda do banco de perguntas).
 */
const bodySchema = z
  .object({
    mode: z.enum(["entrevista", "aumento_promocao"]).optional(),
    category: z.enum(CATEGORIES).nullish(),
    difficulty: z.enum(DIFFICULTIES).nullish(),
    questionId: z.string().uuid().nullish(),
  })
  .default({});

interface PoolItem {
  questionId: string;
  question: string;
  category: string;
  difficulty: string;
}

/**
 * Seleciona a próxima pergunta do simulador e cria uma sessão de entrevista
 * em status "in_progress". A pergunta vem sempre do banco real (nunca
 * inventada pela IA — ver AIProvider.generateInterviewQuestion).
 *
 * Sem repetição: dentro do filtro escolhido, sorteia primeiro entre as
 * perguntas que o usuário ainda não respondeu; quando todas já foram
 * respondidas, sorteia entre as respondidas há mais tempo.
 */
export async function POST(request: Request) {
  const auth = await requireActiveApiUser(request);
  if (!auth) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  // Amostra grátis: só 1 simulação. A mensagem de limite aparece aqui (ao
  // tentar iniciar a 2ª), não no meio da 1ª.
  if (auth.profile.is_trial) {
    const alreadyUsed = await auth.db
      .getRepository(InterviewSessionEntity)
      .existsBy({ user_id: auth.userId, status: "completed" });
    if (alreadyUsed) {
      return Response.json(
        {
          error: "Você já usou sua simulação grátis. Assine o VoceUP para continuar praticando.",
          trialLimitReached: true,
        },
        { status: 403 }
      );
    }
  }

  // Limite diário por usuário: protege o custo de IA/transcrição contra abuso.
  if (!rateLimit(`sim:question:${auth.userId}`, 150, 24 * 60 * 60 * 1000).allowed) {
    return Response.json(
      { error: "Você atingiu o limite diário de uso desta função. Tente novamente amanhã." },
      { status: 429 }
    );
  }

  const raw = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return Response.json({ error: "Filtro inválido." }, { status: 400 });
  }
  const { mode = "entrevista", category, difficulty, questionId } = parsed.data;

  try {
    const questionRepo = auth.db.getRepository(QuestionEntity);
    const sessions = auth.db.getRepository(InterviewSessionEntity);

    // Categorias permitidas para o modo escolhido.
    const allowedCategories: QuestionCategory[] =
      mode === "aumento_promocao"
        ? ["aumento_promocao"]
        : category && category !== "aumento_promocao"
          ? [category]
          : CATEGORIES.filter((c) => c !== "aumento_promocao");

    let pool: PoolItem[];
    let usedFallback = false;

    if (questionId) {
      const specific = await questionRepo.findOne({
        select: { id: true, question: true, category: true, difficulty: true },
        where: { id: questionId, is_published: true },
      });
      if (!specific) {
        return Response.json({ error: "Pergunta não encontrada." }, { status: 404 });
      }
      pool = [toPoolItem(specific)];
    } else {
      const rows = await questionRepo.find({
        select: { id: true, question: true, category: true, difficulty: true },
        where: {
          is_published: true,
          category: In(allowedCategories),
          ...(difficulty ? { difficulty } : {}),
        },
      });
      pool = rows.map(toPoolItem);

      if (pool.length === 0) {
        // Banco ainda sem seed (ou sem perguntas nesse filtro): usa o conteúdo local.
        usedFallback = true;
        pool = questionsSeed
          .map((q, i) => ({ questionId: `seed-${i}`, question: q.question, category: q.category, difficulty: q.difficulty }))
          .filter((q) => allowedCategories.includes(q.category as QuestionCategory))
          .filter((q) => !difficulty || q.difficulty === difficulty);
      }
    }

    if (pool.length === 0) {
      return Response.json({ error: "Nenhuma pergunta disponível com esse filtro." }, { status: 404 });
    }

    // Histórico do usuário nesse conjunto: quando respondeu cada pergunta pela última vez.
    const realIds = pool.map((p) => p.questionId).filter((id) => !id.startsWith("seed-"));
    const lastAnswered = new Map<string, number>();
    if (realIds.length > 0 && !questionId) {
      const history = await sessions.find({
        select: { question_id: true, created_at: true },
        where: { user_id: auth.userId, question_id: In(realIds), status: "completed" },
      });
      for (const h of history) {
        if (!h.question_id) continue;
        const t = new Date(h.created_at).getTime();
        if (t > (lastAnswered.get(h.question_id) ?? 0)) lastAnswered.set(h.question_id, t);
      }
    }

    const unanswered = pool.filter((p) => !lastAnswered.has(p.questionId));
    let candidates: PoolItem[];
    if (questionId || unanswered.length > 0) {
      candidates = questionId ? pool : unanswered;
    } else {
      // Todas já respondidas: escolhe entre o terço respondido há mais tempo.
      const sorted = [...pool].sort(
        (a, b) => (lastAnswered.get(a.questionId) ?? 0) - (lastAnswered.get(b.questionId) ?? 0)
      );
      candidates = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 3)));
    }

    const provider = getAIProvider();
    const selected = await provider.generateInterviewQuestion(
      candidates.map(({ questionId: id, question, category: cat }) => ({ questionId: id, question, category: cat }))
    );
    const selectedFull = candidates.find((c) => c.questionId === selected.questionId) ?? candidates[0]!;

    const session = await sessions.save(
      sessions.create({
        user_id: auth.userId,
        question_id: selected.questionId.startsWith("seed-") ? null : selected.questionId,
        status: "in_progress",
      })
    );

    return Response.json({
      session,
      question: {
        questionId: selectedFull.questionId,
        question: selectedFull.question,
        category: selectedFull.category,
        difficulty: selectedFull.difficulty,
      },
      pool: {
        total: pool.length,
        // Quantas ainda não respondidas restam DEPOIS desta (para a UI).
        remainingUnanswered: Math.max(0, unanswered.length - (lastAnswered.has(selectedFull.questionId) ? 0 : 1)),
        allAnswered: !questionId && unanswered.length === 0,
        fallback: usedFallback,
      },
    });
  } catch (err) {
    console.error("[interview/question] Falha ao iniciar simulação:", err);
    return Response.json(
      { error: "Não foi possível iniciar uma nova simulação agora. Tente novamente em instantes." },
      { status: 502 }
    );
  }
}

function toPoolItem(q: { id: string; question: string; category: string; difficulty: string }): PoolItem {
  return { questionId: q.id, question: q.question, category: q.category, difficulty: q.difficulty };
}
