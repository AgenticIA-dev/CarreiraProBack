import { describe, expect, it } from "vitest";
import { loginSchema, starFormSchema, resetPasswordSchema } from "@/lib/validation/schemas";

describe("loginSchema", () => {
  it("rejeita login inválido (e-mail malformado)", () => {
    const result = loginSchema.safeParse({ email: "não-é-email", password: "123456" });
    expect(result.success).toBe(false);
  });

  it("aceita login válido", () => {
    const result = loginSchema.safeParse({ email: "user@example.com", password: "123456" });
    expect(result.success).toBe(true);
  });

  it("rejeita input vazio", () => {
    const result = loginSchema.safeParse({ email: "", password: "" });
    expect(result.success).toBe(false);
  });
});

describe("starFormSchema", () => {
  it("rejeita quando campos obrigatórios estão vazios", () => {
    const result = starFormSchema.safeParse({ situation: "", task: "", action: "", result: "" });
    expect(result.success).toBe(false);
  });

  it("aceita quando todos os campos têm conteúdo", () => {
    const result = starFormSchema.safeParse({
      situation: "s",
      task: "t",
      action: "a",
      result: "r",
    });
    expect(result.success).toBe(true);
  });
});

describe("resetPasswordSchema", () => {
  it("rejeita quando as senhas não coincidem", () => {
    const result = resetPasswordSchema.safeParse({
      password: "12345678",
      confirmPassword: "87654321",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita senha curta", () => {
    const result = resetPasswordSchema.safeParse({ password: "123", confirmPassword: "123" });
    expect(result.success).toBe(false);
  });
});
