import bcrypt from "bcryptjs";

const COST = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

// Hash descartável usado quando o usuário não existe ou não tem senha, para
// que o tempo de resposta do login não revele quais e-mails têm conta.
let dummyHash: Promise<string> | null = null;

/** Compara a senha com o hash; com `hash` nulo, gasta o mesmo tempo e devolve false. */
export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    dummyHash ??= bcrypt.hash("senha-inexistente", COST);
    await bcrypt.compare(password, await dummyHash);
    return false;
  }
  return bcrypt.compare(password, hash);
}
