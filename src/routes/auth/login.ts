import { getDb } from "@/lib/db/dataSource";
import { UserEntity } from "@/lib/db/entities";
import { verifyPassword } from "@/lib/auth/password";
import { issueSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rateLimit";
import { loginSchema } from "@/lib/validation/schemas";

/**
 * Login por e-mail/senha. Devolve os tokens da sessão; quem os guarda
 * (cookies) é o frontend, no seu próprio domínio.
 *
 * O rate limit é por e-mail, não por IP: no fluxo normal esta rota é
 * chamada pelo servidor do frontend (não pelo navegador), então o IP visto
 * aqui seria o mesmo para todos os usuários.
 *
 * Não checa status/role — isso continua sendo feito em `/api/account/me` e
 * em cada rota de negócio. Login é só autenticação. Um usuário criado pelo
 * convite pós-compra ainda sem senha não consegue entrar até usar o link do
 * e-mail (ou "Esqueci minha senha").
 */
export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "E-mail ou senha incorretos." }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const { allowed } = rateLimit(`auth:login:${email}`, 10, 5 * 60_000);
  if (!allowed) {
    return Response.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429 }
    );
  }

  try {
    const db = await getDb();
    const users = db.getRepository(UserEntity);
    const user = await users
      .createQueryBuilder("u")
      .addSelect("u.password_hash")
      .where("u.email = :email", { email })
      .getOne();

    const valid = await verifyPassword(parsed.data.password, user?.password_hash);
    if (!user || !valid) {
      return Response.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
    }

    const session = await issueSession(db, user);
    await users.update({ id: user.id }, { last_login_at: new Date() });

    return Response.json({ session });
  } catch {
    return Response.json(
      { error: "Não foi possível entrar agora. Tente novamente em instantes." },
      { status: 500 }
    );
  }
}
