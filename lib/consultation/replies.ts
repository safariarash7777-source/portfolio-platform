import { cashFlowObject as object, cashFlowText as text, cashFlowUuid as uuid } from "../portfolio/cashFlowApiContract";

export const REPLY_BODY_LIMIT = 20_000;
export interface ReplyCommand { kind: "publish_reply"; relationshipId: string; sessionId: string; questionId: string; baseVersion: number; text: string; purpose: "clarification" }
export interface ReplyRequest { contractVersion: "consultation-reply-request.v1"; expectedActorId: string; clientToken: string; command: ReplyCommand }
export interface ReplyReceipt { contractVersion: "consultation-reply-write.v1"; actorId: string; clientToken: string; command: ReplyCommand; id: string; version: number; reused: boolean; canonicalContentHash: string }
export interface ReplyVersion { id: string; questionId: string; sessionId: string; version: number; text: string; actorId: string; createdAt: string; contentHash: string }
export type ReplyReadOnlyReason = "not_owner" | "revoked" | "unpublished" | "withdrawn" | "superseded" | "expired" | "basis_changed" | "research_changed";
export interface ReplyRead {
  contractVersion: "consultation-reply-read.v1"; actorId: string; relationshipId: string; sessionId: string;
  canReply: boolean; readOnlyReason: ReplyReadOnlyReason | null; replies: ReplyVersion[];
}
const id = (v: unknown): string => { if (!uuid(v)) throw Error("شناسه معتبر نیست."); return v.toLowerCase(); };
const version = (v: unknown, base = false): number => { if (typeof v !== "number" || !Number.isInteger(v) || v < (base ? 0 : 1) || v > (base ? 2147483646 : 2147483647)) throw Error("نسخه معتبر نیست."); return v; };
const hash = (v: unknown): string => { if (typeof v !== "string" || !/^[a-f0-9]{64}$/.test(v)) throw Error("اثر انگشت معتبر نیست."); return v; };
const stable = (v: unknown): string => JSON.stringify(v, (_, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(k => [k, item[k]])) : item);
export function validateReplyRequest(value: unknown): ReplyRequest {
  const r = object(value, ["contractVersion", "expectedActorId", "clientToken", "command"]);
  if (r.contractVersion !== "consultation-reply-request.v1") throw Error("قرارداد معتبر نیست.");
  const c = object(r.command, ["kind", "relationshipId", "sessionId", "questionId", "baseVersion", "text", "purpose"]);
  if (c.kind !== "publish_reply" || c.purpose !== "clarification") throw Error("کنش معتبر نیست.");
  return { contractVersion: r.contractVersion, expectedActorId: id(r.expectedActorId), clientToken: text(r.clientToken, 200), command: { kind: c.kind, relationshipId: id(c.relationshipId), sessionId: id(c.sessionId), questionId: id(c.questionId), baseVersion: version(c.baseVersion, true), text: text(c.text, 2000), purpose: c.purpose } };
}
export function validateReplyReceipt(value: unknown, input: ReplyRequest): ReplyReceipt {
  const request = validateReplyRequest(input), r = object(value, ["contractVersion", "actorId", "clientToken", "command", "id", "version", "reused", "canonicalContentHash"]);
  if (r.contractVersion !== "consultation-reply-write.v1" || r.actorId !== request.expectedActorId || r.clientToken !== request.clientToken || stable(r.command) !== stable(request.command) || typeof r.reused !== "boolean" || version(r.version) !== request.command.baseVersion + 1) throw Error("رسید با درخواست مطابق نیست.");
  return { contractVersion: r.contractVersion, actorId: request.expectedActorId, clientToken: request.clientToken, command: request.command, id: id(r.id), version: r.version as number, reused: r.reused, canonicalContentHash: hash(r.canonicalContentHash) };
}
export function validateReplyRead(value: unknown, expected: { actorId?: string; relationshipId: string; sessionId: string }): ReplyRead {
  const r = object(value, ["contractVersion", "actorId", "relationshipId", "sessionId", "canReply", "readOnlyReason", "replies"]);
  if (r.contractVersion !== "consultation-reply-read.v1" || id(r.relationshipId) !== id(expected.relationshipId) || id(r.sessionId) !== id(expected.sessionId) || (expected.actorId && id(r.actorId) !== id(expected.actorId))) throw Error("پرونده یا هویت تغییر کرده است.");
  const reasons = ["not_owner", "revoked", "unpublished", "withdrawn", "superseded", "expired", "basis_changed", "research_changed"];
  if (typeof r.canReply !== "boolean" || (r.readOnlyReason !== null && !reasons.includes(String(r.readOnlyReason))) || r.canReply !== (r.readOnlyReason === null)) throw Error("مجوز پاسخ معتبر نیست.");
  if (!Array.isArray(r.replies) || r.replies.length > 200) throw Error("تعداد پاسخ‌ها معتبر نیست.");
  const replies: ReplyVersion[] = r.replies.map(v => {
    const a = object(v, ["id", "questionId", "sessionId", "version", "text", "actorId", "createdAt", "contentHash"]);
    if (id(a.sessionId) !== id(expected.sessionId) || typeof a.createdAt !== "string" || !/^\d{4}-\d\d-\d\dT/.test(a.createdAt) || !Number.isFinite(Date.parse(a.createdAt))) throw Error("پاسخ متعلق به این نسخه نیست.");
    return { id: id(a.id), questionId: id(a.questionId), sessionId: id(a.sessionId), version: version(a.version), text: text(a.text, 2000), actorId: id(a.actorId), createdAt: a.createdAt, contentHash: hash(a.contentHash) };
  });
  if (new Set(replies.map(x => x.id)).size !== replies.length || new Set(replies.map(x => `${x.questionId}:${x.version}`)).size !== replies.length) throw Error("پاسخ تکراری است.");
  for (const question of new Set(replies.map(x => x.questionId))) {
    const versions = replies.filter(x => x.questionId === question).map(x => x.version).sort((a, b) => a - b);
    if (versions.some((v, i) => v !== i + 1)) throw Error("تاریخچه پاسخ ناقص است.");
  }
  return { contractVersion: r.contractVersion, actorId: id(r.actorId), relationshipId: id(r.relationshipId), sessionId: id(r.sessionId), canReply: r.canReply, readOnlyReason: r.readOnlyReason as ReplyReadOnlyReason | null, replies };
}
/** A receipt alone never proves that the independent read displayed the saved effect. */
export function replyReceiptVisible(data: ReplyRead, receipt: ReplyReceipt): boolean {
  return data.actorId === receipt.actorId && data.relationshipId === receipt.command.relationshipId && data.sessionId === receipt.command.sessionId && data.replies.some(r => r.id === receipt.id && r.actorId === receipt.actorId && r.questionId === receipt.command.questionId && r.sessionId === receipt.command.sessionId && r.version === receipt.version && r.text === receipt.command.text && r.contentHash === receipt.canonicalContentHash);
}
