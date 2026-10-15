import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe sua senha."),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido."),
});

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
    confirmPassword: z.string().min(8, "Confirme sua nova senha."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

export const starFormSchema = z.object({
  questionId: z.string().uuid().optional().nullable(),
  situation: z.string().trim().min(1, "Descreva a situação."),
  task: z.string().trim().min(1, "Descreva a tarefa/desafio."),
  action: z.string().trim().min(1, "Descreva a ação que você tomou."),
  result: z.string().trim().min(1, "Descreva o resultado (mesmo que qualitativo)."),
});

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(1, "Informe seu nome.").max(120),
});

export const dataRequestSchema = z.object({
  type: z.enum(["access", "correction", "deletion"]),
  details: z.string().trim().max(2000).optional(),
});
