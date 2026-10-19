import { requireAdminApiUser } from "@/lib/auth/apiAuth";
import { QuestionEntity, UserEntity } from "@/lib/db/entities";

/**
 * Contagens para a home do admin. Exige role "admin" (verificado contra o
 * banco, nunca por campo enviado pelo cliente).
 */
export async function GET(request: Request) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
    return Response.json({ error: "Acesso restrito." }, { status: 403 });
  }

  try {
    const [userCount, questionCount] = await Promise.all([
      admin.db.getRepository(UserEntity).count(),
      admin.db.getRepository(QuestionEntity).count(),
    ]);
    return Response.json({ userCount, questionCount });
  } catch {
    return Response.json({ userCount: 0, questionCount: 0 });
  }
}
