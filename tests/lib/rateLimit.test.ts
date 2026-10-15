import { describe, expect, it } from "vitest";
import { rateLimit } from "@/lib/security/rateLimit";

describe("rateLimit", () => {
  it("permite requisições dentro do limite", () => {
    const key = `test-${Math.random()}`;
    expect(rateLimit(key, 3, 1000).allowed).toBe(true);
    expect(rateLimit(key, 3, 1000).allowed).toBe(true);
    expect(rateLimit(key, 3, 1000).allowed).toBe(true);
  });

  it("bloqueia requisições acima do limite dentro da janela", () => {
    const key = `test-${Math.random()}`;
    rateLimit(key, 2, 1000);
    rateLimit(key, 2, 1000);
    expect(rateLimit(key, 2, 1000).allowed).toBe(false);
  });
});
