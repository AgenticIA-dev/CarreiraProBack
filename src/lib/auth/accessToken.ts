import { SignJWT, jwtVerify } from "jose";

/**
 * Access tokens: JWT HS256 de vida curta, assinado com `JWT_SECRET`.
 *
 * São "stateless" — validados só pela assinatura e expiração, sem consulta
 * ao banco. Por isso duram pouco (1 hora, como no Supabase Auth); a sessão
 * longa é o refresh token (ver `session.ts`), que fica no banco e pode ser
 * revogado.
 */

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;

const ISSUER = "carreirapro-backend";
const AUDIENCE = "carreirapro";

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET não configurado: defina um segredo aleatório com pelo menos 32 caracteres.");
  }
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(user: { id: string; email: string }): Promise<string> {
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(getSecret());
}

/** Devolve o id do usuário se o token for válido e não expirado; senão null. */
export async function verifyAccessToken(token: string): Promise<{ userId: string } | null> {
  // Fora do try: segredo ausente é erro de configuração, não "token inválido".
  const secret = getSecret();
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return payload.sub ? { userId: payload.sub } : null;
  } catch {
    return null;
  }
}
