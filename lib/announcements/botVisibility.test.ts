import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  selectVisibleAnnouncements,
  REVOCATION_UNAVAILABLE_MESSAGE,
  type BotAnnouncement,
} from "./botVisibility";

const USER = "user-1";
const ann = (id: string, target: string, title = `عنوان ${id}`): BotAnnouncement => ({
  id, title, body_md: `متنِ محرمانهٔ ${id}`, target, published_at: "2026-09-01T00:00:00Z",
});

describe("دیدِ بات به اعلامیه‌ها (#139)", () => {
  test("اعلامیهٔ لغوشده به بات نمی‌رسد", () => {
    const r = selectVisibleAnnouncements({
      announcements: [ann("a", "all"), ann("b", "all")],
      revokedIds: ["b"],
      revocationReadFailed: false,
      userId: USER,
      riskCategory: null,
    });
    assert.equal(r.kind, "ok");
    assert.deepEqual(r.kind === "ok" ? r.announcements.map((a) => a.id) : [], ["a"]);
  });

  // ⚠️ این آزمون، خودِ یافتهٔ بازبینیِ مستقل است.
  test("خطای خواندنِ لغوها ⇒ هیچ محتوایی بیرون نمی‌رود", () => {
    const r = selectVisibleAnnouncements({
      announcements: [ann("b", "all")],
      revokedIds: null,
      revocationReadFailed: true,
      userId: USER,
      riskCategory: null,
    });
    assert.equal(r.kind, "unavailable");
    assert.equal(r.kind === "unavailable" ? r.message : "", REVOCATION_UNAVAILABLE_MESSAGE);
    assert.doesNotMatch(JSON.stringify(r), /محرمانه/, "هیچ متنی نباید نشت کند");
  });

  test("خطای خواندن با «فهرستِ خالی» یکی گرفته نمی‌شود", () => {
    const failed = selectVisibleAnnouncements({
      announcements: [ann("b", "all")], revokedIds: null,
      revocationReadFailed: true, userId: USER, riskCategory: null,
    });
    const empty = selectVisibleAnnouncements({
      announcements: [ann("b", "all")], revokedIds: [],
      revocationReadFailed: false, userId: USER, riskCategory: null,
    });
    assert.equal(failed.kind, "unavailable");
    assert.equal(empty.kind, "ok");
    assert.equal(empty.kind === "ok" ? empty.announcements.length : -1, 1);
  });

  test("حتی اگر آرایهٔ لغو خالی برگردد ولی خطا اعلام شده باشد، باز هم بسته است", () => {
    const r = selectVisibleAnnouncements({
      announcements: [ann("b", "all")], revokedIds: [],
      revocationReadFailed: true, userId: USER, riskCategory: null,
    });
    assert.equal(r.kind, "unavailable");
  });

  test("هدف‌گذاری: تک‌کاربر، سطح ریسک و همه", () => {
    const r = selectVisibleAnnouncements({
      announcements: [
        ann("all", "all"),
        ann("mine", `user:${USER}`),
        ann("other", "user:someone-else"),
        ann("risk", "risk:متعادل"),
        ann("risk2", "risk:تهاجمی"),
      ],
      revokedIds: [],
      revocationReadFailed: false,
      userId: USER,
      riskCategory: "متعادل",
      limit: 10,
    });
    assert.deepEqual(
      r.kind === "ok" ? r.announcements.map((a) => a.id).sort() : [],
      ["all", "mine", "risk"]
    );
  });

  test("اعلامیهٔ منتشرنشده دیده نمی‌شود", () => {
    const draft = { ...ann("d", "all"), published_at: null };
    const r = selectVisibleAnnouncements({
      announcements: [draft], revokedIds: [],
      revocationReadFailed: false, userId: USER, riskCategory: null,
    });
    assert.equal(r.kind === "ok" ? r.announcements.length : -1, 0);
  });
});
