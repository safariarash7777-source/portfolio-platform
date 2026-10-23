import type { GoalsPayload } from "@/lib/portfolio/goalsApiContract";
import { dateInput, moneyInput } from "@/lib/portfolio/financialInput";

export type GoalDraft = { goalKey: string; title: string; targetAmountToman: string; targetOn: string; declaredSavedToman: string; sourceLabel: string; observedOn: string; note: string };
export type GoalsDraft = { goals: GoalDraft[] };
export function emptyGoal(goalKey: string): GoalDraft { return { goalKey, title: "", targetAmountToman: "", targetOn: "", declaredSavedToman: "", sourceLabel: "", observedOn: "", note: "" }; }
export function goalsDraft(payload?: GoalsPayload): GoalsDraft {
  return { goals: (payload?.goals ?? []).map(goal => ({ goalKey: goal.goalKey, title: goal.title, targetAmountToman: String(goal.targetAmountToman), targetOn: goal.targetOn, declaredSavedToman: goal.declaredSavedToman === null ? "" : String(goal.declaredSavedToman), sourceLabel: goal.source?.label ?? "", observedOn: goal.source?.observedOn ?? "", note: goal.note ?? "" })) };
}
export function draftPayload(draft: GoalsDraft): GoalsPayload {
  if (draft.goals.length > 50) throw new Error("حداکثر ۵۰ هدف در هر فهرست ثبت می‌شود.");
  return { contractVersion: 1, goals: draft.goals.map(goal => {
    const title = goal.title.trim(), targetAmountToman = moneyInput(goal.targetAmountToman, "IRT");
    if (!title || targetAmountToman <= 0) throw new Error("هر هدف به عنوان و مبلغ مثبت نیاز دارد.");
    const declaredSavedToman = goal.declaredSavedToman.trim() === "" ? null : moneyInput(goal.declaredSavedToman, "IRT");
    if (declaredSavedToman !== null && (!goal.sourceLabel.trim() || !goal.observedOn)) throw new Error("برای مبلغ کنارگذاشته‌شده، حتی صفر، منبع و تاریخ مشاهده لازم است.");
    if (declaredSavedToman === null && (goal.sourceLabel.trim() || goal.observedOn)) throw new Error("منبع و تاریخ را همراه مبلغ کنارگذاشته‌شده وارد کنید؛ برای مبلغ نامعلوم هر سه را خالی بگذارید.");
    return { goalKey: goal.goalKey, title, targetAmountToman, targetOn: dateInput(goal.targetOn), declaredSavedToman, source: declaredSavedToman === null ? null : { label: goal.sourceLabel.trim(), observedOn: dateInput(goal.observedOn) }, note: goal.note.trim() || null };
  }) };
}
