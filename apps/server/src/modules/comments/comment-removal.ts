import { Prisma } from '@prisma/client';

export async function removeCommentPreservingReplies(
  tx: Prisma.TransactionClient,
  commentId: string,
) {
  const comment = await tx.comment.findUnique({
    where: { id: commentId },
    select: { id: true, parentId: true, isDeleted: true, _count: { select: { replies: true } } },
  });
  if (!comment) {
    return { deleted: false, softDeleted: false };
  }
  if (!comment.parentId && comment._count.replies > 0) {
    await tx.commentLike.deleteMany({ where: { commentId } });
    await tx.comment.update({
      where: { id: commentId },
      data: { isDeleted: true, content: '' },
    });
    return { deleted: true, softDeleted: true };
  }
  await tx.comment.delete({ where: { id: commentId } });
  return { deleted: true, softDeleted: false };
}
