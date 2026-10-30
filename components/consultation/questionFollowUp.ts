import type { ConsultationAction, RecommendationBody } from "@/lib/consultation/contracts";
import type { ReplyRead } from "@/lib/consultation/replies";

/** Projection of an already validated read, never a ticket lifecycle or a permission. */
export function questionFollowUp(data: ReplyRead, feedback: ConsultationAction[], actions: RecommendationBody["actions"]) {
  const questions = feedback.filter(item => item.sessionId === data.sessionId && item.status === "question");
  const ids = new Set(questions.map(item => item.id));
  if (data.replies.some(reply => reply.sessionId !== data.sessionId || !ids.has(reply.questionId))) return null;
  return questions.map(question => ({
    id: question.id,
    text: question.text ?? "متن پرسش در دسترس نیست",
    createdAt: question.createdAt,
    context: question.actionKey === null ? "دربارهٔ همین جمع‌بندی" : `اقدام مرتبط: ${actions.find(action => action.actionKey === question.actionKey)?.title ?? "عنوان اقدام در این نسخه در دسترس نیست"}`,
    replies: data.replies.filter(reply => reply.questionId === question.id),
  }));
}
