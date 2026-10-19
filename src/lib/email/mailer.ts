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

  await transport.sendMail({
    from: process.env.EMAIL_FROM ?? "CarreiraPro <no-reply@localhost>",
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
  return {
    to,
    subject,
    text: `${intro}\n\n${cta}: ${link}\n\n${expiry}\nSe você não fez essa solicitação, ignore este e-mail.`,
    html: `<p>${escapeHtml(intro)}</p>
<p><a href="${safeLink}">${escapeHtml(cta)}</a></p>
<p style="color:#666;font-size:13px">${escapeHtml(expiry)}<br>Se você não fez essa solicitação, ignore este e-mail.</p>`,
  };
}

export function passwordResetEmail(to: string, link: string): Email {
  return linkEmail(
    to,
    "CarreiraPro — redefinição de senha",
    "Recebemos um pedido para redefinir a senha da sua conta no CarreiraPro.",
    "Definir nova senha",
    link,
    "Este link vale por 1 hora e só pode ser usado uma vez."
  );
}

export function inviteEmail(to: string, link: string): Email {
  return linkEmail(
    to,
    "CarreiraPro — seu acesso está liberado",
    "Seu pagamento foi confirmado e seu acesso ao CarreiraPro está liberado. Crie sua senha para entrar.",
    "Criar minha senha",
    link,
    "Este link vale por 7 dias e só pode ser usado uma vez. Se expirar, use \"Esqueci minha senha\" na tela de login."
  );
}
