import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateReplyRequest, validateReplyReceipt, validateReplyRead, replyReceiptVisible } from "../../../lib/consultation/replies";
const path = process.argv[2];
assert.ok(path, "Supply the isolated SQL harness output path");
let count = 0;
for (const line of readFileSync(path, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
  let value;
  try { value = JSON.parse(line); } catch { continue; }
  if (!value?.replyFixture) continue;
  const fixture = value.replyFixture, request = validateReplyRequest(fixture.request);
  const receipt = validateReplyReceipt(fixture.receipt, request);
  const data = validateReplyRead(fixture.read, { actorId: request.expectedActorId, relationshipId: request.command.relationshipId, sessionId: request.command.sessionId });
  assert.ok(replyReceiptVisible(data, receipt)); count++;
}
assert.equal(count, 2, "Both explicit and legacy grant SQL fixtures must validate");
console.log(`PASS: ${count} actual SQL reply receipts and reads match TypeScript contracts`);
