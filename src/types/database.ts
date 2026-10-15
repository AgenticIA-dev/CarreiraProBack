/**
 * Tipos do banco de dados.
 *
 * Em um ambiente com Supabase CLI configurado, este arquivo deve ser gerado
 * automaticamente a partir do schema real com:
 *
 *   npm run db:types
 *   (supabase gen types typescript --local > src/types/database.ts)
 *
 * Os tipos abaixo foram escritos manualmente a partir de
 * `supabase/migrations/0001_init.sql` para permitir type-checking sem uma
 * instância do Supabase disponível neste ambiente. Substitua por tipos
 * gerados assim que houver um projeto Supabase configurado.
 */

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
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface PurchaseRow {
  id: string;
  user_id: string | null;
  external_transaction_id: string;
  external_product_id: string | null;
  status: PurchaseStatus;
  event_type: string;
  raw_payload: Record<string, unknown> | null;
  purchased_at: string | null;
  updated_at: string;
  created_at: string;
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
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
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
  created_at: string;
}

export interface DataRequestRow {
  id: string;
  user_id: string;
  type: "access" | "correction" | "deletion";
  details: string | null;
  status: "open" | "in_review" | "completed" | "rejected";
  created_at: string;
  resolved_at: string | null;
}

export interface WebhookEventRow {
  id: string;
  provider: string;
  event_type: string;
  external_id: string;
  idempotency_key: string;
  payload: Record<string, unknown>;
  processed_at: string | null;
  status: "received" | "processed" | "ignored" | "error";
  error_message: string | null;
  created_at: string;
}

/**
 * Formato mínimo compatível com o tipo `Database` esperado pelo cliente
 * tipado do Supabase (`createClient<Database>()`).
 */
export interface Database {
  public: {
    Tables: {
      users: { Row: UserRow; Insert: Partial<UserRow>; Update: Partial<UserRow> };
      purchases: { Row: PurchaseRow; Insert: Partial<PurchaseRow>; Update: Partial<PurchaseRow> };
      questions: { Row: QuestionRow; Insert: Partial<QuestionRow>; Update: Partial<QuestionRow> };
      star_responses: {
        Row: StarResponseRow;
        Insert: Partial<StarResponseRow>;
        Update: Partial<StarResponseRow>;
      };
      interview_sessions: {
        Row: InterviewSessionRow;
        Insert: Partial<InterviewSessionRow>;
        Update: Partial<InterviewSessionRow>;
      };
      consent_records: {
        Row: ConsentRecordRow;
        Insert: Partial<ConsentRecordRow>;
        Update: Partial<ConsentRecordRow>;
      };
      data_requests: {
        Row: DataRequestRow;
        Insert: Partial<DataRequestRow>;
        Update: Partial<DataRequestRow>;
      };
      webhook_events: {
        Row: WebhookEventRow;
        Insert: Partial<WebhookEventRow>;
        Update: Partial<WebhookEventRow>;
      };
    };
  };
}
