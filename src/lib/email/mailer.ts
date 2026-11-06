import nodemailer, { type Transporter } from "nodemailer";

/**
 * Envio de e-mails transacionais por SMTP (antes feito pelo Supabase Auth).
 *
 * Configuração: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE e
 * EMAIL_FROM. Sem SMTP_HOST, em desenvolvimento o e-mail é só impresso no
 * console (para testar os links localmente); em produção é um erro.
 */

interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!process.env.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
  });
  return transporter;
}

export async function sendEmail(email: Email): Promise<void> {
  const transport = getTransporter();

  if (!transport) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMTP não configurado: defina SMTP_HOST para enviar e-mails.");
    }
    console.info(`[email:dev] Para: ${email.to}\nAssunto: ${email.subject}\n\n${email.text}\n`);
    return;
  }

  const replyTo = process.env.EMAIL_REPLY_TO?.trim();
  await transport.sendMail({
    from: process.env.EMAIL_FROM ?? "VoceUP <no-reply@localhost>",
    // Respostas do cliente vão para o e-mail de atendimento (ex.: convite que não funcionou).
    ...(replyTo ? { replyTo } : {}),
    to: email.to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function linkEmail(to: string, subject: string, intro: string, cta: string, link: string, expiry: string): Email {
  const safeLink = escapeHtml(link);
  const support = process.env.EMAIL_REPLY_TO?.trim();
  return {
    to,
    subject,
    text: `${intro}\n\n${cta}: ${link}\n\n${expiry}\nSe você não fez essa solicitação, ignore este e-mail.${support ? `\nDúvidas: ${support}` : ""}`,
    html: `<p>${escapeHtml(intro)}</p>
<p><a href="${safeLink}">${escapeHtml(cta)}</a></p>
<p style="color:#666;font-size:13px">${escapeHtml(expiry)}<br>Se você não fez essa solicitação, ignore este e-mail.${
      support ? `<br>Dúvidas: ${escapeHtml(support)}` : ""
    }</p>`,
  };
}

export function passwordResetEmail(to: string, link: string): Email {
  return linkEmail(
    to,
    "VoceUP — redefinição de senha",
    "Recebemos um pedido para redefinir a senha da sua conta no VoceUP.",
    "Definir nova senha",
    link,
    "Este link vale por 1 hora e só pode ser usado uma vez."
  );
}

/** Convite de testador (acesso de cortesia, sem pagamento). */
export function testerInviteEmail(to: string, link: string, days: number, name?: string | null): Email {
  const site = (process.env.FRONTEND_ORIGIN ?? "").split(",")[0]?.trim().replace(/\/+$/, "") || "";
  const terms = site ? ` Ao usar a plataforma, você concorda com os Termos de Uso (${site}/termos) e a Política de Privacidade (${site}/privacidade).` : "";
  const hello = name ? `Olá, ${name}!` : "Olá!";
  return linkEmail(
    to,
    "VoceUP — seu acesso de teste está liberado",
    `${hello} Você foi convidado(a) para testar o VoceUP gratuitamente por ${days} ${days === 1 ? "dia" : "dias"}, com acesso completo. Seu feedback vai ajudar a melhorar a plataforma — é só responder este e-mail contando o que achou.${terms} Crie sua senha para entrar.`,
    "Criar minha senha",
    link,
    `O acesso de teste termina ${days} ${days === 1 ? "dia" : "dias"} após este convite. O link vale por 7 dias e só pode ser usado uma vez; se expirar, use "Esqueci minha senha" na tela de login.`
  );
}

/** Amostra grátis via link de parceiro (restrita — ver §restrições no cadastro de trial). */
export function trialSignupEmail(to: string, link: string, days: number, partnerName?: string | null): Email {
  const hello = partnerName ? `Você foi indicado(a) por ${partnerName} para testar o VoceUP gratuitamente.` : "Você vai testar o VoceUP gratuitamente.";
  return linkEmail(
    to,
    "VoceUP — sua amostra grátis está liberada",
    `${hello} Você tem ${days} ${days === 1 ? "dia" : "dias"} de acesso de amostra (1 simulação de entrevista e o banco de perguntas com uma pergunta liberada por competência). Crie sua senha para entrar.`,
    "Criar minha senha",
    link,
    `A amostra grátis termina ${days} ${days === 1 ? "dia" : "dias"} após o cadastro. O link vale por 7 dias e só pode ser usado uma vez; se expirar, use "Esqueci minha senha" na tela de login.`
  );
}

export function inviteEmail(to: string, link: string): Email {
  return linkEmail(
    to,
    "VoceUP — seu acesso está liberado",
    "Seu pagamento foi confirmado e seu acesso ao VoceUP está liberado. Crie sua senha para entrar.",
    "Criar minha senha",
    link,
    "Este link vale por 7 dias e só pode ser usado uma vez. Se expirar, use \"Esqueci minha senha\" na tela de login."
  );
}
