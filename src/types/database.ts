/**
 * Tipos das linhas do banco de dados (PostgreSQL, acessado via TypeORM).
 *
 * Espelham as tabelas criadas pelas migrations em `src/lib/db/migrations/`
 * e são usados pelos EntitySchemas de `src/lib/db/entities.ts`. Os nomes das
 * propriedades são os mesmos nomes das colunas (snake_case), então o JSON
 * devolvido pela API mantém exatamente o mesmo formato de antes.
 */

/**
 * Colunas de data/hora: `Date` quando lidas do banco pelo TypeORM; viram
 * string ISO 8601 depois de serializadas em JSON.
 */
export type Timestamp = Date | string;

export type UserStatus =
  | "pending"
  | "active"
  | "inactive"
  | "refunded"
  | "cancelled"
  | "blocked";

export type UserRole = "user" | "admin";

/** Status de pagamento, nos termos documentados pela API do Mercado Pago. */
export type PurchaseStatus =
  | "pending"
  | "approved"
  | "authorized"
  | "in_process"
  | "in_mediation"
  | "rejected"
  | "cancelled"
  | "refunded"
  | "charged_back";

export type QuestionCategory =
  | "comportamental"
  | "star"
  | "tecnica"
  | "situacional"
  | "fit_cultural"
  | "lideranca";

export type QuestionDifficulty = "iniciante" | "intermediaria" | "avancada";

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  status: UserStatus;
  role: UserRole;
  created_at: Timestamp;
  updated_at: Timestamp;
  last_login_at: Timestamp | null;
}

export interface PurchaseRow {
  id: string;
  user_id: string | null;
  external_transaction_id: string;
  external_product_id: string | null;
  status: PurchaseStatus;
  event_type: string;
  raw_payload: Record<string, unknown> | null;
  purchased_at: Timestamp | null;
  updated_at: Timestamp;
  created_at: Timestamp;
}

export interface QuestionRow {
  id: string;
  category: QuestionCategory;
  question: string;
  evaluates: string | null;
  ideal_structure: string | null;
  tips: string[] | null;
  things_to_avoid: string[] | null;
  difficulty: QuestionDifficulty;
  is_published: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface StarResponseRow {
  id: string;
  user_id: string;
  question_id: string | null;
  situation: string;
  task: string;
  action: string;
  result: string;
  generated_response: string | null;
  ai_notes: string[] | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface InterviewSessionRow {
  id: string;
  user_id: string;
  question_id: string | null;
  transcript: string | null;
  audio_duration_seconds: number | null;
  score: number | null;
  score_breakdown: ScoreBreakdown | null;
  feedback: string | null;
  status: "in_progress" | "transcribing" | "scoring" | "completed" | "failed";
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ScoreBreakdown {
  estrutura: number;
  clareza: number;
  objetividade: number;
  resultado: number;
}

export interface ConsentRecordRow {
  id: string;
  user_id: string | null;
  anonymous_id: string | null;
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  created_at: Timestamp;
}

export interface DataRequestRow {
  id: string;
  user_id: string;
  type: "access" | "correction" | "deletion";
  details: string | null;
  status: "open" | "in_review" | "completed" | "rejected";
  created_at: Timestamp;
  resolved_at: Timestamp | null;
}

export interface WebhookEventRow {
  id: string;
  provider: string;
  event_type: string;
  external_id: string;
  idempotency_key: string;
  payload: Record<string, unknown>;
  processed_at: Timestamp | null;
  status: "received" | "processed" | "ignored" | "error";
  error_message: string | null;
  created_at: Timestamp;
}

export interface QuestionFavoriteRow {
  user_id: string;
  question_id: string;
  created_at: Timestamp;
}

/**
 * Hash bcrypt da senha. Fica fora de `UserRow` de propósito: `UserRow` é o
 * formato devolvido pela API, e a coluna também é `select: false` na entidade,
 * então só é carregada quando pedida explicitamente.
 */
export interface UserWithPasswordRow extends UserRow {
  password_hash: string | null;
}

export type AuthTokenKind = "refresh" | "password_reset" | "invite";

/** Tokens opacos (refresh, recuperação de senha, convite). Só o hash SHA-256 é guardado. */
export interface AuthTokenRow {
  id: string;
  user_id: string;
  kind: AuthTokenKind;
  token_hash: string;
  expires_at: Timestamp;
  consumed_at: Timestamp | null;
  created_at: Timestamp;
}
