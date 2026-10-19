import { z } from "zod";
import { requireActiveApiUser } from "@/lib/auth/apiAuth";
import { QuestionEntity, QuestionFavoriteEntity } from "@/lib/db/entities";

const idSchema = z.string().uuid();

export async function POST(request: Request, questionId: string) {
  const id = idSchema.safeParse(questionId);
  const auth = await requireActiveApiUser(request);
  if (!auth) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (!id.success) {
    return Response.json({ error: "Pergunta não encontrada." }, { status: 404 });
  }

  try {
    const question = await auth.db
      .getRepository(QuestionEntity)
      .findOneBy({ id: id.data, is_published: true });
    if (!question) {
      return Response.json({ error: "Pergunta não encontrada." }, { status: 404 });
    }

    // ON CONFLICT DO NOTHING: favoritar de novo não é erro.
    await auth.db
      .getRepository(QuestionFavoriteEntity)
      .createQueryBuilder()
      .insert()
      .values({ user_id: auth.userId, question_id: id.data })
      .orIgnore()
      .execute();

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Não foi possível favoritar agora." }, { status: 500 });
  }
}

export async function DELETE(request: Request, questionId: string) {
  const id = idSchema.safeParse(questionId);
  const auth = await requireActiveApiUser(request);
  if (!auth) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (!id.success) {
    return Response.json({ ok: true });
  }

  try {
    await auth.db
      .getRepository(QuestionFavoriteEntity)
      .delete({ user_id: auth.userId, question_id: id.data });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Não foi possível remover o favorito agora." }, { status: 500 });
  }
}
