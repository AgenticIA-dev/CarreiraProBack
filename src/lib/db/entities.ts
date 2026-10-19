import { EntitySchema } from "typeorm";
import type {
  AuthTokenRow,
  ConsentRecordRow,
  DataRequestRow,
  InterviewSessionRow,
  PurchaseRow,
  QuestionFavoriteRow,
  QuestionRow,
  StarResponseRow,
  UserWithPasswordRow,
  WebhookEventRow,
} from "@/types/database";

/**
 * Mapeamento TypeORM das tabelas do banco.
 *
 * Usa `EntitySchema` em vez de classes com decorators: não depende de
 * `emitDecoratorMetadata` nem de nomes de classe (que o bundler pode
 * minificar), e os tipos das linhas continuam sendo as interfaces de
 * `src/types/database.ts`.
 *
 * O schema em si (tipos, constraints, triggers) é definido pelas migrations
 * em `./migrations` — estas definições só descrevem as colunas para o ORM.
 * `synchronize` fica sempre desligado (ver `dataSource.ts`).
 */

const id = { type: "uuid", primary: true, generated: "uuid" } as const;
const createdAt = { type: "timestamptz", createDate: true } as const;
const updatedAt = { type: "timestamptz", updateDate: true } as const;

export const UserEntity = new EntitySchema<UserWithPasswordRow>({
  name: "User",
  tableName: "users",
  columns: {
    id,
    email: { type: "text", unique: true },
    name: { type: "text", nullable: true },
    // Nunca carregada por padrão — evita que o hash vaze em respostas da API.
    password_hash: { type: "text", nullable: true, select: false },
    status: {
      type: "enum",
      enumName: "user_status",
      enum: ["pending", "active", "inactive", "refunded", "cancelled", "blocked"],
      default: "pending",
    },
    role: { type: "enum", enumName: "user_role", enum: ["user", "admin"], default: "user" },
    created_at: createdAt,
    updated_at: updatedAt,
    last_login_at: { type: "timestamptz", nullable: true },
  },
});

export const AuthTokenEntity = new EntitySchema<AuthTokenRow>({
  name: "AuthToken",
  tableName: "auth_tokens",
  columns: {
    id,
    user_id: { type: "uuid" },
    kind: { type: "text" },
    token_hash: { type: "text", unique: true },
    expires_at: { type: "timestamptz" },
    consumed_at: { type: "timestamptz", nullable: true },
    created_at: createdAt,
  },
});

export const PurchaseEntity = new EntitySchema<PurchaseRow>({
  name: "Purchase",
  tableName: "purchases",
  columns: {
    id,
    user_id: { type: "uuid", nullable: true },
    external_transaction_id: { type: "text" },
    external_product_id: { type: "text", nullable: true },
    status: {
      type: "enum",
      enumName: "purchase_status",
      enum: [
        "pending",
        "approved",
        "authorized",
        "in_process",
        "in_mediation",
        "rejected",
        "cancelled",
        "refunded",
        "charged_back",
      ],
    },
    event_type: { type: "text" },
    raw_payload: { type: "jsonb", nullable: true },
    purchased_at: { type: "timestamptz", nullable: true },
    updated_at: updatedAt,
    created_at: createdAt,
  },
  uniques: [{ columns: ["external_transaction_id", "event_type"] }],
});

export const QuestionEntity = new EntitySchema<QuestionRow>({
  name: "Question",
  tableName: "questions",
  columns: {
    id,
    category: {
      type: "enum",
      enumName: "question_category",
      enum: ["comportamental", "star", "tecnica", "situacional", "fit_cultural", "lideranca"],
    },
    question: { type: "text" },
    evaluates: { type: "text", nullable: true },
    ideal_structure: { type: "text", nullable: true },
    tips: { type: "text", array: true, nullable: true },
    things_to_avoid: { type: "text", array: true, nullable: true },
    difficulty: {
      type: "enum",
      enumName: "question_difficulty",
      enum: ["iniciante", "intermediaria", "avancada"],
      default: "intermediaria",
    },
    is_published: { type: "boolean", default: true },
    created_at: createdAt,
    updated_at: updatedAt,
  },
});

export const QuestionFavoriteEntity = new EntitySchema<QuestionFavoriteRow>({
  name: "QuestionFavorite",
  tableName: "question_favorites",
  columns: {
    user_id: { type: "uuid", primary: true },
    question_id: { type: "uuid", primary: true },
    created_at: createdAt,
  },
});

export const StarResponseEntity = new EntitySchema<StarResponseRow>({
  name: "StarResponse",
  tableName: "star_responses",
  columns: {
    id,
    user_id: { type: "uuid" },
    question_id: { type: "uuid", nullable: true },
    situation: { type: "text", default: "" },
    task: { type: "text", default: "" },
    action: { type: "text", default: "" },
    result: { type: "text", default: "" },
    generated_response: { type: "text", nullable: true },
    ai_notes: { type: "text", array: true, nullable: true },
    created_at: createdAt,
    updated_at: updatedAt,
  },
});

export const InterviewSessionEntity = new EntitySchema<InterviewSessionRow>({
  name: "InterviewSession",
  tableName: "interview_sessions",
  columns: {
    id,
    user_id: { type: "uuid" },
    question_id: { type: "uuid", nullable: true },
    transcript: { type: "text", nullable: true },
    audio_duration_seconds: { type: "integer", nullable: true },
    score: { type: "integer", nullable: true },
    score_breakdown: { type: "jsonb", nullable: true },
    feedback: { type: "text", nullable: true },
    status: { type: "text", default: "in_progress" },
    created_at: createdAt,
    updated_at: updatedAt,
  },
});

export const ConsentRecordEntity = new EntitySchema<ConsentRecordRow>({
  name: "ConsentRecord",
  tableName: "consent_records",
  columns: {
    id,
    user_id: { type: "uuid", nullable: true },
    anonymous_id: { type: "text", nullable: true },
    necessary: { type: "boolean", default: true },
    analytics: { type: "boolean", default: false },
    marketing: { type: "boolean", default: false },
    created_at: createdAt,
  },
});

export const DataRequestEntity = new EntitySchema<DataRequestRow>({
  name: "DataRequest",
  tableName: "data_requests",
  columns: {
    id,
    user_id: { type: "uuid" },
    type: {
      type: "enum",
      enumName: "data_request_type",
      enum: ["access", "correction", "deletion"],
    },
    details: { type: "text", nullable: true },
    status: {
      type: "enum",
      enumName: "data_request_status",
      enum: ["open", "in_review", "completed", "rejected"],
      default: "open",
    },
    created_at: createdAt,
    resolved_at: { type: "timestamptz", nullable: true },
  },
});

export const WebhookEventEntity = new EntitySchema<WebhookEventRow>({
  name: "WebhookEvent",
  tableName: "webhook_events",
  columns: {
    id,
    provider: { type: "text", default: "mercadopago" },
    event_type: { type: "text" },
    external_id: { type: "text" },
    idempotency_key: { type: "text", unique: true },
    payload: { type: "jsonb" },
    processed_at: { type: "timestamptz", nullable: true },
    status: { type: "text", default: "received" },
    error_message: { type: "text", nullable: true },
    created_at: createdAt,
  },
});

export const entities = [
  UserEntity,
  AuthTokenEntity,
  PurchaseEntity,
  QuestionEntity,
  QuestionFavoriteEntity,
  StarResponseEntity,
  InterviewSessionEntity,
  ConsentRecordEntity,
  DataRequestEntity,
  WebhookEventEntity,
];
