import { requireAdminApiUser } from "@/lib/auth/apiAuth";
import { UserEntity } from "@/lib/db/entities";

/**
 * Lista usuários para a área administrativa. Exige role "admin".
 * `password_hash` nunca é carregado (coluna `select: false` na entidade).
 */
export async function GET(request: Request) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
    return Response.json({ error: "Acesso restrito." }, { status: 403 });
  }

  try {
    const users = await admin.db.getRepository(UserEntity).find({
      order: { created_at: "DESC" },
      take: 100,
    });
    return Response.json({ users });
  } catch {
    return Response.json({ error: "Não foi possível carregar os usuários agora." }, { status: 500 });
  }
}
