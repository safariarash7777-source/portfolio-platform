import type { ConsultationRead, ConsultationReceipt } from "@/lib/consultation/contracts";
const stable = (value: unknown) => JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
/** A valid response alone is insufficient: the exact acknowledged effect must be visible. */
export function receiptVisible(data: ConsultationRead, receipt: ConsultationReceipt): boolean {
  if (data.actor.id !== receipt.actorId) return false;
  const command = receipt.command;
  if (command.kind === "grant") return data.relationships.some(item => item.id === receipt.id && item.clientId === receipt.actorId && item.advisorId === command.advisorId && item.clientLabel === command.clientLabel && !item.revoked);
  if (data.selected?.id !== command.relationshipId) return false;
  if (command.kind === "revoke") return receipt.id === command.relationshipId && data.selected.revoked;
  if (command.kind === "save") {
    const session = data.sessions.find(item => item.id === receipt.id);
    return !!session && session.actorId === receipt.actorId && session.version === receipt.version && session.sessionKey === command.sessionKey && session.relationshipId === command.relationshipId && stable(session.body) === stable(command.body)
      && (data.notes.find(item => item.sessionId === session.id)?.note ?? null) === command.privateNote;
  }
  if (command.kind === "feedback") return data.actions.some(item => item.id === receipt.id && item.version === receipt.version && item.sessionId === command.sessionId && item.actionKey === command.actionKey && item.status === command.status && item.text === command.text && item.actorId === receipt.actorId);
  return data.events.some(item => item.id === receipt.id && item.sessionId === command.sessionId && item.kind === command.kind && item.actorId === receipt.actorId && item.note === command.note)
    && data.sessions.some(item => item.id === command.sessionId && item.contentHash === command.contentHash && item.state === ({ submit: "submitted", approve: "approved", publish: "published", withdraw: "withdrawn" } as const)[command.kind]);
}
