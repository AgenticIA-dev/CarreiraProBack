import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors, securityHeaders } from "@/lib/http/cors";

import * as accountDataRequests from "@/routes/account/data-requests";
import * as accountMe from "@/routes/account/me";
import * as accountPassword from "@/routes/account/password";
import * as accountProfile from "@/routes/account/profile";
import * as adminQuestions from "@/routes/admin/questions";
import * as adminStats from "@/routes/admin/stats";
import * as adminUsers from "@/routes/admin/users";
import * as authForgotPassword from "@/routes/auth/forgot-password";
import * as authLogin from "@/routes/auth/login";
import * as authLogout from "@/routes/auth/logout";
import * as authRefresh from "@/routes/auth/refresh";
import * as authResetPassword from "@/routes/auth/reset-password";
import * as checkoutCreatePreference from "@/routes/checkout/create-preference";
import * as consent from "@/routes/consent";
import * as dashboardReadiness from "@/routes/dashboard/readiness";
import * as interviewFeedback from "@/routes/interview/feedback";
import * as interviewQuestion from "@/routes/interview/question";
import * as interviewTranscribe from "@/routes/interview/transcribe";
import * as questionsFavorite from "@/routes/questions/favorite";
import * as questionsList from "@/routes/questions/list";
import * as starGenerate from "@/routes/star/generate";
import * as webhooksMercadoPago from "@/routes/webhooks/mercadopago";

/**
 * Aplicação HTTP (Hono sobre Node.js).
 *
 * Os handlers em `src/routes/` são funções `(Request) => Response` com as
 * APIs web padrão, sem dependência do Hono. Aqui só fica o roteamento e o
 * que vale para todas as rotas (CORS, cabeçalhos de segurança, limite de
 * tamanho do corpo, 404 e erro genérico).
 */

type Handler = (request: Request) => Promise<Response>;
const handle = (handler: Handler) => (c: Context) => handler(c.req.raw);

const tooLarge = (c: Context) => c.json({ error: "Requisição grande demais." }, 413);
const MB = 1024 * 1024;

export function createApp() {
  const app = new Hono();

  app.use("*", securityHeaders);
  app.use("/api/*", cors);

  // 1 MB para JSON; o áudio do simulador ganha 25 MB (limite do Whisper).
  const smallBody = bodyLimit({ maxSize: 1 * MB, onError: tooLarge });
  const audioBody = bodyLimit({ maxSize: 25 * MB, onError: tooLarge });
  app.use("*", (c, next) =>
    (c.req.path === "/api/interview/transcribe" ? audioBody : smallBody)(c, next)
  );

  app.get("/", (c) => c.json({ service: "carreirapro-backend", health: "/api/health" }));
  app.get("/api/health", (c) => c.json({ ok: true, service: "carreirapro-backend" }));

  // Autenticação
  app.post("/api/auth/login", handle(authLogin.POST));
  app.post("/api/auth/refresh", handle(authRefresh.POST));
  app.post("/api/auth/logout", handle(authLogout.POST));
  app.post("/api/auth/forgot-password", handle(authForgotPassword.POST));
  app.post("/api/auth/reset-password", handle(authResetPassword.POST));

  // Conta
  app.get("/api/account/me", handle(accountMe.GET));
  app.patch("/api/account/profile", handle(accountProfile.PATCH));
  app.post("/api/account/password", handle(accountPassword.POST));
  app.get("/api/account/data-requests", handle(accountDataRequests.GET));
  app.post("/api/account/data-requests", handle(accountDataRequests.POST));

  // Produto
  app.post("/api/consent", handle(consent.POST));
  app.get("/api/questions", handle(questionsList.GET));
  app.post("/api/questions/:id/favorite", (c) => questionsFavorite.POST(c.req.raw, c.req.param("id")));
  app.delete("/api/questions/:id/favorite", (c) => questionsFavorite.DELETE(c.req.raw, c.req.param("id")));
  app.post("/api/star/generate", handle(starGenerate.POST));
  app.post("/api/interview/question", handle(interviewQuestion.POST));
  app.post("/api/interview/transcribe", handle(interviewTranscribe.POST));
  app.post("/api/interview/feedback", handle(interviewFeedback.POST));
  app.get("/api/dashboard/readiness", handle(dashboardReadiness.GET));

  // Admin
  app.get("/api/admin/stats", handle(adminStats.GET));
  app.get("/api/admin/users", handle(adminUsers.GET));
  app.get("/api/admin/questions", handle(adminQuestions.GET));

  // Pagamento
  app.post("/api/checkout/create-preference", handle(checkoutCreatePreference.POST));
  app.post("/api/webhooks/mercadopago", handle(webhooksMercadoPago.POST));

  app.notFound((c) => c.json({ error: "Rota não encontrada." }, 404));
  app.onError((err, c) => {
    console.error(`Erro não tratado em ${c.req.method} ${c.req.path}:`, err);
    return c.json({ error: "Erro interno." }, 500);
  });

  return app;
}
