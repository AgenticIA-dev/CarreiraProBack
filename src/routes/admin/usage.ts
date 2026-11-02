import type { DataSource } from "typeorm";
import { requireAdminApiUser } from "@/lib/auth/apiAuth";
import { UserEntity } from "@/lib/db/entities";
import { usdBrlRate } from "@/lib/usage/pricing";

/**
 * Relatório "Uso e custos" por usuário (admin).
 *
 *  GET /api/admin/usage              → JSON (tela do admin)
 *  GET /api/admin/usage?format=csv   → planilha CSV (abre no Excel/Google Planilhas)
 *
 * Junta: compra (valor, taxa do Mercado Pago, reembolso), acesso (vencimento),
 * uso (logins, dias ativos, simulações, STAR, favoritas, minutos de áudio),
 * custo estimado de IA (usage_events) e sinais de upsell/risco.
 *
 * O custo de IA só existe para o uso registrado a partir da criação de
 * `usage_events` (migration 1793500000000); uso anterior aparece sem custo.
 */

const DAY = 24 * 60 * 60 * 1000;

const CATEGORY_LABELS: Record<string, string> = {
  comportamental: "Comportamental",
  star: "Método STAR",
  tecnica: "Técnica",
  situacional: "Situacional",
  fit_cultural: "Fit cultural",
  lideranca: "Liderança",
  aumento_promocao: "Aumento e promoção",
};

export interface UsageReportRow {
  userId: string;
  name: string | null;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  purchasedAt: string | null;
  paymentMethod: string | null;
  installments: number | null;
  amountPaidBrl: number;
  mpFeeBrl: number;
  refunded: boolean;
  accessExpiresAt: string | null;
  daysLeft: number | null;
  logins: number;
  lastLoginAt: string | null;
  activeDays: number;
  simulationsInterview: number;
  simulationsRaise: number;
  audioMinutes: number;
  starCount: number;
  favorites: number;
  avgScore: number | null;
  weakestCompetency: string | null;
  usageFirst7Days: number;
  aiCostUsd: number;
  aiCostBrl: number;
  totalCostBrl: number;
  marginBrl: number;
  signals: string[];
}

type Num = string | number | null;
const num = (v: Num | undefined): number => (v === null || v === undefined ? 0 : Number(v) || 0);
const iso = (v: Date | string | null | undefined): string | null =>
  v ? (v instanceof Date ? v.toISOString() : new Date(v).toISOString()) : null;
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function GET(request: Request) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
    return Response.json({ error: "Acesso restrito." }, { status: 403 });
  }

  try {
    const report = await buildReport(admin.db);
    const format = new URL(request.url).searchParams.get("format");
    if (format === "csv") {
      const date = new Date().toISOString().slice(0, 10);
      return new Response(toCsv(report.users), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="voceup-uso-e-custos-${date}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return Response.json(report);
  } catch (err) {
    console.error("[admin/usage] Falha ao montar relatório:", err);
    return Response.json({ error: "Não foi possível montar o relatório agora." }, { status: 500 });
  }
}

async function buildReport(db: DataSource) {
  const rate = usdBrlRate();
  const now = Date.now();

  const users = await db.getRepository(UserEntity).find({ order: { created_at: "DESC" }, take: 5000 });

  const q = <T>(sql: string) => db.query(sql) as Promise<T[]>;
  const [purchases, events, early, sessions, competencies, stars, favorites, activeDays] = await Promise.all([
    q<{ user_id: string; external_transaction_id: string; status: string; raw_payload: Record<string, unknown> | null; purchased_at: Date | null; updated_at: Date }>(
      `select user_id, external_transaction_id, status, raw_payload, purchased_at, updated_at
         from public.purchases where user_id is not null order by updated_at asc`
    ),
    q<{ user_id: string; kind: string; n: Num; cost: Num; last_at: Date | null }>(
      `select user_id, kind, count(*) as n, coalesce(sum(cost_usd), 0) as cost, max(created_at) as last_at
         from public.usage_events group by user_id, kind`
    ),
    q<{ user_id: string; n: Num }>(
      `select e.user_id, count(*) as n
         from public.usage_events e
         join (select user_id, min(purchased_at) as first_at
                 from public.purchases
                where status = 'approved' and purchased_at is not null and user_id is not null
                group by user_id) f on f.user_id = e.user_id
        where e.kind in ('simulation_feedback', 'star')
          and e.created_at < f.first_at + interval '7 days'
        group by e.user_id`
    ),
    q<{ user_id: string; raise: Num; interview: Num; avg_score: Num; audio_s: Num }>(
      `select s.user_id,
              count(*) filter (where q.category = 'aumento_promocao') as raise,
              count(*) filter (where q.category is distinct from 'aumento_promocao') as interview,
              avg(s.score) as avg_score,
              coalesce(sum(s.audio_duration_seconds), 0) as audio_s
         from public.interview_sessions s
         left join public.questions q on q.id = s.question_id
        where s.status = 'completed'
        group by s.user_id`
    ),
    q<{ user_id: string; category: string; avg_score: Num }>(
      `select s.user_id, q.category::text as category, avg(s.score) as avg_score
         from public.interview_sessions s
         join public.questions q on q.id = s.question_id
        where s.status = 'completed' and s.score is not null
        group by s.user_id, q.category`
    ),
    q<{ user_id: string; n: Num }>(`select user_id, count(*) as n from public.star_responses group by user_id`),
    q<{ user_id: string; n: Num }>(`select user_id, count(*) as n from public.question_favorites group by user_id`),
    q<{ user_id: string; n: Num }>(
      `select user_id, count(distinct d) as n from (
         select user_id, (created_at at time zone 'America/Sao_Paulo')::date as d from public.usage_events
         union all
         select user_id, (created_at at time zone 'America/Sao_Paulo')::date from public.interview_sessions
         union all
         select user_id, (created_at at time zone 'America/Sao_Paulo')::date from public.star_responses
       ) x group by user_id`
    ),
  ]);

  // Compra: a linha mais recente de cada pagamento (o webhook grava uma por evento).
  const latestByPayment = new Map<string, (typeof purchases)[number]>();
  for (const p of purchases) latestByPayment.set(p.external_transaction_id, p);
  const purchaseByUser = new Map<
    string,
    { paid: number; fee: number; refunded: boolean; purchasedAt: string | null; method: string | null; installments: number | null }
  >();
  for (const p of latestByPayment.values()) {
    const raw = (p.raw_payload ?? {}) as {
      transaction_amount?: number;
      fee_details?: { amount?: number }[];
      payment_method_id?: string;
      payment_type_id?: string;
      installments?: number;
    };
    const refunded = p.status === "refunded" || p.status === "charged_back";
    const approved = p.status === "approved" || refunded;
    if (!approved) continue;
    const acc = purchaseByUser.get(p.user_id) ?? {
      paid: 0,
      fee: 0,
      refunded: false,
      purchasedAt: null,
      method: null,
      installments: null,
    };
    if (!refunded) {
      acc.paid += num(raw.transaction_amount);
      acc.fee += (raw.fee_details ?? []).reduce((s, f) => s + num(f.amount), 0);
    }
    acc.refunded = acc.refunded || refunded;
    const at = iso(p.purchased_at);
    if (at && (!acc.purchasedAt || at > acc.purchasedAt)) acc.purchasedAt = at;
    acc.method = raw.payment_method_id ?? raw.payment_type_id ?? acc.method;
    acc.installments = raw.installments ?? acc.installments;
    purchaseByUser.set(p.user_id, acc);
  }

  const by = <T extends { user_id: string }>(rows: T[]) => new Map(rows.map((r) => [r.user_id, r]));
  const earlyMap = by(early);
  const sessionMap = by(sessions);
  const starMap = by(stars);
  const favMap = by(favorites);
  const daysMap = by(activeDays);

  const eventMap = new Map<string, { logins: number; lastLogin: string | null; costUsd: number }>();
  for (const e of events) {
    const acc = eventMap.get(e.user_id) ?? { logins: 0, lastLogin: null, costUsd: 0 };
    acc.costUsd += num(e.cost);
    if (e.kind === "login") {
      acc.logins += num(e.n);
      acc.lastLogin = iso(e.last_at);
    }
    eventMap.set(e.user_id, acc);
  }

  const weakest = new Map<string, { category: string; avg: number }>();
  for (const c of competencies) {
    const avg = num(c.avg_score);
    const cur = weakest.get(c.user_id);
    if (!cur || avg < cur.avg) weakest.set(c.user_id, { category: c.category, avg });
  }

  const rows: UsageReportRow[] = users.map((u) => {
    const purchase = purchaseByUser.get(u.id);
    const ev = eventMap.get(u.id);
    const s = sessionMap.get(u.id);
    const simsInterview = num(s?.interview);
    const simsRaise = num(s?.raise);
    const starCount = num(starMap.get(u.id)?.n);
    const usageFirst7Days = num(earlyMap.get(u.id)?.n);
    const expiresAt = iso(u.access_expires_at);
    const daysLeft = expiresAt ? Math.ceil((new Date(expiresAt).getTime() - now) / DAY) : null;
    const aiCostUsd = ev?.costUsd ?? 0;
    const aiCostBrl = aiCostUsd * rate;
    const paid = purchase?.paid ?? 0;
    const fee = purchase?.fee ?? 0;
    const w = weakest.get(u.id);
    const avgScore = s?.avg_score === null || s?.avg_score === undefined ? null : round2(num(s.avg_score));

    const signals: string[] = [];
    const isBuyer = u.role !== "admin" && Boolean(purchase);
    if (isBuyer) {
      const totalUse = simsInterview + simsRaise + starCount;
      if (purchase?.refunded) signals.push("Reembolsado");
      if (u.status === "active" && daysLeft !== null && daysLeft <= 15) signals.push(`Renovação: vence em ${Math.max(daysLeft, 0)} dia(s)`);
      if (u.status !== "active" && !purchase?.refunded && daysLeft !== null && daysLeft < 0) signals.push("Expirado: oferta de reativação");
      if (totalUse >= 30) signals.push("Uso alto: candidato a plano maior/mentoria");
      if (simsRaise > 0) signals.push("Perfil aumento/promoção (já empregado)");
      if (w && w.avg < 60) signals.push(`Reforço em ${CATEGORY_LABELS[w.category] ?? w.category}`);
      const purchasedDaysAgo = purchase?.purchasedAt ? (now - new Date(purchase.purchasedAt).getTime()) / DAY : 0;
      if (u.status === "active" && totalUse === 0 && purchasedDaysAgo >= 3) signals.push("Sem uso: risco de reembolso");
      if (usageFirst7Days >= 20) signals.push("Uso intenso nos 7 primeiros dias");
    }

    return {
      userId: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      createdAt: iso(u.created_at)!,
      purchasedAt: purchase?.purchasedAt ?? null,
      paymentMethod: purchase?.method ?? null,
      installments: purchase?.installments ?? null,
      amountPaidBrl: round2(paid),
      mpFeeBrl: round2(fee),
      refunded: purchase?.refunded ?? false,
      accessExpiresAt: expiresAt,
      daysLeft,
      logins: ev?.logins ?? 0,
      lastLoginAt: ev?.lastLogin ?? iso(u.last_login_at),
      activeDays: num(daysMap.get(u.id)?.n),
      simulationsInterview: simsInterview,
      simulationsRaise: simsRaise,
      audioMinutes: round2(num(s?.audio_s) / 60),
      starCount,
      favorites: num(favMap.get(u.id)?.n),
      avgScore,
      weakestCompetency: w ? (CATEGORY_LABELS[w.category] ?? w.category) : null,
      usageFirst7Days,
      aiCostUsd: Math.round(aiCostUsd * 10000) / 10000,
      aiCostBrl: round2(aiCostBrl),
      totalCostBrl: round2(aiCostBrl + fee),
      marginBrl: round2(paid - fee - aiCostBrl),
      signals,
    };
  });

  const buyers = rows.filter((r) => r.role !== "admin");
  const totals = {
    users: buyers.length,
    activeUsers: buyers.filter((r) => r.status === "active").length,
    revenueBrl: round2(buyers.reduce((s, r) => s + r.amountPaidBrl, 0)),
    mpFeesBrl: round2(buyers.reduce((s, r) => s + r.mpFeeBrl, 0)),
    aiCostBrl: round2(rows.reduce((s, r) => s + r.aiCostBrl, 0)),
    marginBrl: round2(buyers.reduce((s, r) => s + r.marginBrl, 0)),
    refunds: buyers.filter((r) => r.refunded).length,
  };

  return { generatedAt: new Date(now).toISOString(), usdBrlRate: rate, totals, users: rows };
}

/* ------------------------------------------------------------------ CSV */

const COLUMNS: { header: string; value: (r: UsageReportRow) => string | number | null }[] = [
  { header: "Nome", value: (r) => r.name },
  { header: "E-mail", value: (r) => r.email },
  { header: "Perfil", value: (r) => (r.role === "admin" ? "Admin" : "Cliente") },
  { header: "Status", value: (r) => r.status },
  { header: "Cadastro", value: (r) => fmtDate(r.createdAt) },
  { header: "Data da compra", value: (r) => fmtDate(r.purchasedAt) },
  { header: "Forma de pagamento", value: (r) => r.paymentMethod },
  { header: "Parcelas", value: (r) => r.installments },
  { header: "Valor pago (R$)", value: (r) => r.amountPaidBrl },
  { header: "Taxa Mercado Pago (R$)", value: (r) => r.mpFeeBrl },
  { header: "Reembolsado", value: (r) => (r.refunded ? "Sim" : "Não") },
  { header: "Acesso até", value: (r) => fmtDate(r.accessExpiresAt) },
  { header: "Dias restantes", value: (r) => r.daysLeft },
  { header: "Logins", value: (r) => r.logins },
  { header: "Último login", value: (r) => fmtDateTime(r.lastLoginAt) },
  { header: "Dias ativos", value: (r) => r.activeDays },
  { header: "Simulações entrevista", value: (r) => r.simulationsInterview },
  { header: "Simulações aumento/promoção", value: (r) => r.simulationsRaise },
  { header: "Minutos de áudio", value: (r) => r.audioMinutes },
  { header: "Respostas STAR", value: (r) => r.starCount },
  { header: "Perguntas favoritas", value: (r) => r.favorites },
  { header: "Nota média", value: (r) => r.avgScore },
  { header: "Competência mais fraca", value: (r) => r.weakestCompetency },
  { header: "Uso nos 7 primeiros dias", value: (r) => r.usageFirst7Days },
  { header: "Custo IA (US$)", value: (r) => r.aiCostUsd },
  { header: "Custo IA (R$)", value: (r) => r.aiCostBrl },
  { header: "Custo total (R$)", value: (r) => r.totalCostBrl },
  { header: "Margem (R$)", value: (r) => r.marginBrl },
  { header: "Sinais (upsell/risco)", value: (r) => r.signals.join(" | ") },
];

function fmtDate(v: string | null): string {
  return v ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(v)) : "";
}

function fmtDateTime(v: string | null): string {
  return v
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(
        new Date(v)
      )
    : "";
}

/** Formato do Excel em português: separador ";" e decimal com vírgula. */
function cell(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v).replace(".", ",");
  // Evita injeção de fórmula ao abrir no Excel (=, +, -, @ no começo).
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function toCsv(rows: UsageReportRow[]): string {
  const lines = [COLUMNS.map((c) => cell(c.header)).join(";")];
  for (const r of rows) lines.push(COLUMNS.map((c) => cell(c.value(r))).join(";"));
  // BOM: faz o Excel reconhecer os acentos (UTF-8).
  return "﻿" + lines.join("\r\n");
}
