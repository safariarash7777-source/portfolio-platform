import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildEventInbox, isManualSourced, type EventEvidenceLink } from "./event-inbox";
import type { IntelEvent, IntelEvidence, IntelSource } from "./contracts";

const ev = (id: string, over: Partial<IntelEvent> = {}): IntelEvent => ({
  id, domain: "fx_gold", title: `رخداد ${id}`, summary: null,
  occurredAt: "2026-08-23T08:00:00.000Z", scope: "iran", symbol: null, ...over,
});
const evi = (id: string, sourceId: string, hash: string): IntelEvidence => ({
  id, sourceId, excerpt: "متن", contentUrl: null,
  observedAt: "2026-08-23T08:05:00.000Z", publishedAt: null, contentHash: hash,
});
const src = (id: string, over: Partial<IntelSource> = {}): IntelSource => ({
  id, kind: "official", name: `منبع ${id}`, url: null,
  trustTier: "primary", approved: true, approvedBy: "arash", approvedAt: "2026-08-01T00:00:00.000Z", ...over,
});
const link = (eventId: string, evidenceId: string): EventEvidenceLink => ({ eventId, evidenceId });

describe("حذفِ تکرار با اثرِ انگشتِ محتوا", () => {
  test("دو رکوردِ شاهد با یک contentHash یک شاهد شمرده می‌شوند", () => {
    const inbox = buildEventInbox(
      [ev("e1")],
      [evi("v1", "s1", "HASH-A"), evi("v2", "s1", "HASH-A")],
      [src("s1")],
      [link("e1", "v1"), link("e1", "v2")]
    );
    const item = inbox.documented[0];
    assert.equal(item.evidenceCount, 1, "یک محتوا = یک شاهد");
    assert.equal(item.duplicatesDropped, 1);
    assert.equal(inbox.totalDuplicatesDropped, 1);
  });

  test("محتوای متفاوت با هشِ متفاوت هر دو می‌مانند", () => {
    const inbox = buildEventInbox(
      [ev("e1")],
      [evi("v1", "s1", "HASH-A"), evi("v2", "s1", "HASH-B")],
      [src("s1")],
      [link("e1", "v1"), link("e1", "v2")]
    );
    assert.equal(inbox.documented[0].evidenceCount, 2);
    assert.equal(inbox.documented[0].duplicatesDropped, 0);
  });

  test("تکرار یک رخدادِ ضعیف را قوی جلوه نمی‌دهد", () => {
    // ده کپیِ یک محتوا هنوز یک شاهد است.
    const dupes = Array.from({ length: 10 }, (_, i) => evi(`v${i}`, "s1", "SAME"));
    const inbox = buildEventInbox([ev("e1")], dupes, [src("s1")], dupes.map((d) => link("e1", d.id)));
    assert.equal(inbox.documented[0].evidenceCount, 1);
    assert.equal(inbox.documented[0].duplicatesDropped, 9);
  });
});

describe("منبعِ تأییدنشده پنهان نمی‌شود", () => {
  test("شاهدِ تأییدنشده شمرده می‌شود و رخداد «مستند» نیست", () => {
    const inbox = buildEventInbox(
      [ev("e1")],
      [evi("v1", "s1", "H")],
      [src("s1", { approved: false, approvedBy: null, approvedAt: null })],
      [link("e1", "v1")]
    );
    assert.equal(inbox.documented.length, 0);
    const item = inbox.needsEvidence[0];
    assert.equal(item.unapprovedEvidence, 1);
    assert.equal(item.state, "awaiting_review");
    assert.match(item.note, /تأیید نشده/);
  });

  test("رخدادِ بدونِ هیچ شاهدی حذف نمی‌شود، جدا می‌شود", () => {
    const inbox = buildEventInbox([ev("e1")], [], [], []);
    assert.equal(inbox.documented.length, 0);
    assert.equal(inbox.needsEvidence.length, 1);
    assert.equal(inbox.needsEvidence[0].state, "empty");
    assert.match(inbox.needsEvidence[0].note, /هیچ شاهدی/);
  });
});

describe("پستِ خامِ شبکهٔ اجتماعی مستندسازی نیست", () => {
  for (const kind of ["telegram", "instagram"] as const) {
    test(`${kind} به‌تنهایی رخداد را مستند نمی‌کند`, () => {
      const inbox = buildEventInbox(
        [ev("e1")],
        [evi("v1", "s1", "H")],
        [src("s1", { kind, trustTier: "unverified" })],
        [link("e1", "v1")]
      );
      assert.equal(inbox.documented.length, 0);
      const item = inbox.needsEvidence[0];
      assert.equal(item.socialOnly, true);
      assert.match(item.note, /سرنخ هست، مستندسازی نیست/);
    });
  }

  test("پستِ شبکه در کنارِ منبعِ رسمی، رخداد را مستند می‌کند", () => {
    const inbox = buildEventInbox(
      [ev("e1")],
      [evi("v1", "s1", "H1"), evi("v2", "s2", "H2")],
      [src("s1", { kind: "telegram", trustTier: "unverified" }), src("s2", { kind: "official" })],
      [link("e1", "v1"), link("e1", "v2")]
    );
    assert.equal(inbox.documented.length, 1);
    assert.equal(inbox.documented[0].socialOnly, false);
    assert.equal(inbox.documented[0].strongestTrust, "primary");
  });
});

describe("ژئوپلیتیکِ v1 دستی و منبع‌دار", () => {
  test("رخدادِ ژئوپلیتیک با منبعِ رسمیِ تأییدشده مستند است", () => {
    const inbox = buildEventInbox(
      [ev("g1", { domain: "politics_geo" })],
      [evi("v1", "s1", "H")],
      [src("s1", { kind: "official" })],
      [link("g1", "v1")]
    );
    assert.equal(inbox.documented.length, 1);
    assert.equal(inbox.documented[0].domainLabel, "سیاست و ژئوپلیتیک");
  });

  test("منبعِ دستی/رسمیِ تأییدشده معتبر است؛ بقیه نه", () => {
    assert.equal(isManualSourced(src("s", { kind: "manual" })), true);
    assert.equal(isManualSourced(src("s", { kind: "official" })), true);
    assert.equal(isManualSourced(src("s", { kind: "telegram" })), false);
    assert.equal(isManualSourced(src("s", { kind: "manual", approved: false })), false);
    assert.equal(isManualSourced(undefined), false);
  });
});

describe("ترتیب و پایداری", () => {
  test("تازه‌ترین رخداد اول می‌آید", () => {
    const inbox = buildEventInbox(
      [
        ev("old", { occurredAt: "2026-08-20T08:00:00.000Z" }),
        ev("new", { occurredAt: "2026-08-23T08:00:00.000Z" }),
      ],
      [evi("v1", "s1", "H1"), evi("v2", "s1", "H2")],
      [src("s1")],
      [link("old", "v1"), link("new", "v2")]
    );
    assert.deepEqual(inbox.documented.map((i) => i.eventId), ["new", "old"]);
  });

  test("ترتیبِ ورودی خروجی را عوض نمی‌کند", () => {
    const args = [
      [ev("a", { occurredAt: "2026-08-21T00:00:00.000Z" }), ev("b", { occurredAt: "2026-08-22T00:00:00.000Z" })],
      [evi("v1", "s1", "H1"), evi("v2", "s1", "H2")],
      [src("s1")],
      [link("a", "v1"), link("b", "v2")],
    ] as const;
    const first = buildEventInbox(...args);
    const reversed = buildEventInbox(
      [...args[0]].reverse(), [...args[1]].reverse(), [...args[2]], [...args[3]].reverse()
    );
    assert.deepEqual(first.documented.map((i) => i.eventId), reversed.documented.map((i) => i.eventId));
  });

  test("ورودیِ خالی خروجیِ خالی می‌دهد، نه خطا", () => {
    const inbox = buildEventInbox([], [], [], []);
    assert.deepEqual(inbox.documented, []);
    assert.deepEqual(inbox.needsEvidence, []);
    assert.equal(inbox.totalDuplicatesDropped, 0);
  });
});

describe("زبان", () => {
  test("هیچ واژهٔ اجرایی تولید نمی‌شود", () => {
    const inbox = buildEventInbox(
      [ev("e1"), ev("e2", { domain: "politics_geo" })],
      [evi("v1", "s1", "H")],
      [src("s1", { kind: "telegram", trustTier: "unverified" })],
      [link("e1", "v1")]
    );
    const text = JSON.stringify(inbox);
    for (const banned of ["سیگنال", "توصیه", "بخرید", "بفروشید", "تضمین"]) {
      assert.ok(!text.includes(banned), banned);
    }
  });
});
