import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyWorkbook, type ResearchWorkbook } from "./research-workbook";
import {
  classifyStoreError,
  decideWorkbook,
  latestPerWorkbook,
  listWorkbooks,
  openWorkbook,
  saveWorkbook,
  StoreError,
  type StoredReview,
  type StoredVersion,
  type WorkbookGateway,
} from "./workbook-store";

/** مخزنِ حافظه‌ای که همان قیدهای phase34 را اعمال می‌کند: UNIQUE و «بدونِ پرش». */
function harness(opts: { user?: string | null; role?: string | null; roleThrows?: boolean; unavailable?: boolean } = {}) {
  const versions: StoredVersion[] = [];
  const reviews: StoredReview[] = [];
  let storesCreated = 0;
  let ids = 0;
  let clock = 0;
  const now = () => new Date(Date.UTC(2026, 8, 23, 8, 0, clock++)).toISOString();
  const uuid = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`;
  const gate = () => { if (opts.unavailable) throw new StoreError("unavailable"); };
  const gw: WorkbookGateway = {
    async getUser() { return opts.user === null ? null : { id: opts.user ?? "admin-1" }; },
    async getRole() { if (opts.roleThrows) throw new Error("boom"); return opts.role === undefined ? "admin" : opts.role; },
    newId: uuid,
    createStore() {
      storesCreated++;
      return {
        async recent(limit) { gate(); return [...versions].reverse().slice(0, limit).map(({ body: _b, ...r }) => { void _b; return r; }); },
        async versions(id) { gate(); return versions.filter((v) => v.workbookId === id).map((v) => ({ ...v })); },
        async reviews(vids) { gate(); return reviews.filter((r) => vids.includes(r.versionId)); },
        async insertVersion(row) {
          gate();
          if (versions.some((v) => v.workbookId === row.workbookId && v.version === row.version)) throw new StoreError("conflict");
          if (row.version > 1 && !versions.some((v) => v.workbookId === row.workbookId && v.version === row.version - 1)) throw new StoreError("conflict");
          const v: StoredVersion = { id: uuid(), workbookId: row.workbookId, version: row.version, title: row.title, body: structuredClone(row.body), createdAt: now() };
          versions.push(v);
          return v;
        },
        async insertReview(row) {
          gate();
          const r: StoredReview = { id: uuid(), versionId: row.versionId, decision: row.decision, note: row.note, reviewedAt: now() };
          reviews.push(r);
          return r;
        },
      };
    },
  };
  return { gw, versions, reviews, stores: () => storesCreated };
}

function complete(title = "اثر نرخ ارز بر سبد"): ResearchWorkbook {
  const w = emptyWorkbook();
  w.title = title; w.question = "پرسش"; w.horizon = "سه ماه";
  w.evidence = [{ id: "e1", statement: "گزاره", sourceUrl: "https://codal.ir/Reports/Decision.aspx?LetterSerial=abc", observedOn: "2026-09-20", publishedOn: "2026-09-19" }];
  w.interpretation = "مسیر"; w.counterEvidence = "شاهد مخالف"; w.portfolioImpact = "اثر"; w.reviewOn = "2026-12-01";
  for (const k of ["base", "upside", "downside"] as const) w.scenarios[k] = { assumptions: "ف", mechanism: "م", invalidation: "ا" };
  return w;
}

test("بی‌نشست ۴۰۱، غیرادمین و خطای خواندنِ نقش ۴۰۳ — و مخزن اصلاً ساخته نمی‌شود", async () => {
  for (const [opts, status] of [[{ user: null }, 401], [{ role: "user" }, 403], [{ roleThrows: true }, 403], [{ role: null }, 403]] as const) {
    const h = harness(opts);
    const results = [
      await listWorkbooks(h.gw),
      await openWorkbook(h.gw, "00000000-0000-4000-8000-000000000001", null),
      await saveWorkbook(h.gw, { workbookId: null, baseVersion: 0, workbook: complete() }),
      await decideWorkbook(h.gw, { workbookId: "00000000-0000-4000-8000-000000000001", version: 1, decision: "approved_internal" }),
    ];
    for (const r of results) assert.equal(r.status, status);
    assert.equal(h.stores(), 0);
  }
});

test("ذخیره → بازکردن → نسخهٔ دوم؛ نسخهٔ اول دست‌نخورده باز می‌شود", async () => {
  const h = harness();
  const first = complete("عنوانِ اول");
  const s1 = await saveWorkbook(h.gw, { workbookId: null, baseVersion: 0, workbook: first });
  assert.equal(s1.status, 201);
  assert.equal(s1.body.version, 1);
  const id = s1.body.workbookId as string;

  const edited = { ...complete("عنوانِ دوم"), interpretation: "مسیرِ بازنگری‌شده" };
  const s2 = await saveWorkbook(h.gw, { workbookId: id, baseVersion: 1, workbook: edited });
  assert.equal(s2.status, 201);
  assert.equal(s2.body.version, 2);

  const latest = await openWorkbook(h.gw, id, null);
  assert.equal(latest.status, 200);
  assert.equal(latest.body.version, 2);
  assert.equal(latest.body.latestVersion, 2);
  assert.equal((latest.body.workbook as ResearchWorkbook).interpretation, "مسیرِ بازنگری‌شده");

  const v1 = await openWorkbook(h.gw, id, 1);
  assert.equal((v1.body.workbook as ResearchWorkbook).title, "عنوانِ اول");
  assert.equal((v1.body.workbook as ResearchWorkbook).interpretation, "مسیر");
  assert.deepEqual((v1.body.versions as Array<{ version: number }>).map((v) => v.version), [1, 2]);

  const list = await listWorkbooks(h.gw);
  const items = list.body.items as Array<{ workbookId: string; version: number; title: string }>;
  assert.equal(items.length, 1, "هر کاربرگ یک بار، با آخرین نسخه");
  assert.equal(items[0].version, 2);
  assert.equal(items[0].title, "عنوانِ دوم");
});

test("دو ویرایش روی یک نسخهٔ پایه: دومی ۴۰۹ می‌گیرد و کارِ اولی پاک نمی‌شود", async () => {
  const h = harness();
  const id = (await saveWorkbook(h.gw, { workbookId: null, baseVersion: 0, workbook: complete() })).body.workbookId;
  const a = await saveWorkbook(h.gw, { workbookId: id, baseVersion: 1, workbook: complete("ویرایشِ الف") });
  const b = await saveWorkbook(h.gw, { workbookId: id, baseVersion: 1, workbook: complete("ویرایشِ ب") });
  assert.equal(a.status, 201);
  assert.equal(b.status, 409);
  assert.equal(((await openWorkbook(h.gw, id as string, null)).body.workbook as ResearchWorkbook).title, "ویرایشِ الف");
  // پرش از روی نسخهٔ ناموجود هم رد می‌شود.
  assert.equal((await saveWorkbook(h.gw, { workbookId: id, baseVersion: 7, workbook: complete() })).status, 409);
});

test("JSONِ مخرب: فیلدِ جعلیِ تأیید دور ریخته می‌شود و شکل‌های خطرناک رد می‌شوند", async () => {
  const h = harness();
  // `__proto__` به‌صورتِ کلیدِ واقعی (از JSON.parse)، نه نحوِ شیء که فقط prototype را عوض می‌کند.
  const forged = JSON.parse(
    JSON.stringify({ ...complete(), status: "approved_internal", approvedBy: "someone" }).replace(/^\{/, '{"__proto__":{"polluted":true},'),
  ) as Record<string, unknown>;
  assert.ok(Object.prototype.hasOwnProperty.call(forged, "__proto__"));
  const ok = await saveWorkbook(h.gw, { workbookId: null, baseVersion: 0, workbook: forged });
  assert.equal(ok.status, 201);
  const stored = h.versions[0].body as Record<string, unknown>;
  assert.equal(stored.status, undefined);
  assert.equal(stored.approvedBy, undefined);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(h.reviews.length, 0, "ذخیره هرگز تصمیم نمی‌سازد");

  const bad: Array<[unknown, number]> = [
    [null, 400],
    ["رشته", 400],
    [[complete()], 400],
    [{ ...complete(), version: 2 }, 400],
    [{ ...complete(), domain: "nope" }, 400],
    [{ ...complete(), title: "   " }, 400],
    [{ ...complete(), evidence: Array.from({ length: 31 }, (_, i) => ({ ...complete().evidence[0], id: `e${i}` })) }, 400],
    [{ ...complete(), evidence: [{ ...complete().evidence[0], sourceUrl: "javascript:alert(1)" }] }, 400],
    [{ ...complete(), evidence: [{ ...complete().evidence[0], sourceUrl: "https://user:pass@example.com/x" }] }, 400],
    [{ ...complete(), evidence: [{ ...complete().evidence[0], id: "<img>" }] }, 400],
    [{ ...complete(), question: 42 }, 400],
  ];
  for (const [workbook, status] of bad) {
    assert.equal((await saveWorkbook(h.gw, { workbookId: null, baseVersion: 0, workbook })).status, status, JSON.stringify(workbook).slice(0, 80));
  }
  assert.equal(h.versions.length, 1, "هیچ ورودیِ ردشده‌ای ردیف نساخت");
});

test("پیش‌نویسِ ناقص ذخیره می‌شود؛ نشانیِ خالی مجاز، نشانیِ نامعتبر نه", async () => {
  const h = harness();
  const draft = emptyWorkbook();
  draft.title = "فقط عنوان";
  assert.equal((await saveWorkbook(h.gw, { workbookId: null, baseVersion: 0, workbook: draft })).status, 201);
});

test("کاربرگِ بزرگ‌تر از یک مگابایت ۴۱۳ می‌گیرد، نه ذخیرهٔ نیمه", async () => {
  const h = harness();
  const w = complete();
  const long = "ش".repeat(10000);
  w.interpretation = long; w.counterEvidence = long; w.portfolioImpact = long; w.question = long;
  for (const k of ["base", "upside", "downside"] as const) w.scenarios[k] = { assumptions: long, mechanism: long, invalidation: long };
  w.evidence = Array.from({ length: 30 }, (_, i) => ({ id: `e${i}`, statement: long, sourceUrl: "https://example.com/" + "a".repeat(9000), observedOn: "2026-09-20", publishedOn: "2026-09-19" }));
  const r = await saveWorkbook(h.gw, { workbookId: null, baseVersion: 0, workbook: w });
  assert.equal(r.status, 413);
  assert.equal(h.versions.length, 0);
});

test("نسخهٔ پایهٔ نامعتبر و شناسهٔ نامعتبر", async () => {
  const h = harness();
  for (const p of [
    { workbookId: null, baseVersion: 1, workbook: complete() },
    { workbookId: null, baseVersion: -1, workbook: complete() },
    { workbookId: "00000000-0000-4000-8000-000000000001", baseVersion: 0, workbook: complete() },
    { workbookId: "00000000-0000-4000-8000-000000000001", baseVersion: 1.5, workbook: complete() },
    { workbookId: "not-a-uuid", baseVersion: 1, workbook: complete() },
    { workbookId: null, baseVersion: "0", workbook: complete() },
  ]) {
    assert.equal((await saveWorkbook(h.gw, p)).status, 400, JSON.stringify(p).slice(0, 60));
  }
  assert.equal((await openWorkbook(h.gw, "'; drop table x;--", null)).status, 400);
  assert.equal((await openWorkbook(h.gw, "00000000-0000-4000-8000-000000000999", null)).status, 404);
  assert.equal((await openWorkbook(h.gw, "00000000-0000-4000-8000-000000000999", 0)).status, 400);
});

test("تأییدِ داخلی: ناقص ۴۲۲، کامل ۲۰۱، نسخهٔ کهنه ۴۰۹، «انتشار» اصلاً کنش نیست", async () => {
  const h = harness();
  const draft = emptyWorkbook();
  draft.title = "ناقص";
  const id = (await saveWorkbook(h.gw, { workbookId: null, baseVersion: 0, workbook: draft })).body.workbookId as string;

  const incomplete = await decideWorkbook(h.gw, { workbookId: id, version: 1, decision: "approved_internal" });
  assert.equal(incomplete.status, 422);
  assert.ok((incomplete.body.openIssues as number) > 0);

  assert.equal((await decideWorkbook(h.gw, { workbookId: id, version: 1, decision: "returned" })).status, 400, "بازگرداندن بی‌علت نه");
  assert.equal((await decideWorkbook(h.gw, { workbookId: id, version: 1, decision: "returned", note: "شاهد ندارد" })).status, 201);

  assert.equal((await saveWorkbook(h.gw, { workbookId: id, baseVersion: 1, workbook: complete() })).status, 201);
  assert.equal((await decideWorkbook(h.gw, { workbookId: id, version: 1, decision: "approved_internal" })).status, 409, "نسخهٔ کهنه");
  assert.equal((await decideWorkbook(h.gw, { workbookId: id, version: 2, decision: "published" })).status, 400);
  const approved = await decideWorkbook(h.gw, { workbookId: id, version: 2, decision: "approved_internal", note: "بازبینی شد" });
  assert.equal(approved.status, 201);

  const opened = await openWorkbook(h.gw, id, null);
  const trail = opened.body.reviews as Array<{ version: number; decision: string }>;
  assert.deepEqual(trail.map((r) => [r.version, r.decision]), [[1, "returned"], [2, "approved_internal"]]);

  // نسخهٔ سوم تأییدِ دوم را به ارث نمی‌برد: تأیید به شمارهٔ نسخه بسته است.
  await saveWorkbook(h.gw, { workbookId: id, baseVersion: 2, workbook: complete("سوم") });
  const v3 = await openWorkbook(h.gw, id, null);
  assert.equal(v3.body.version, 3);
  assert.ok(!(v3.body.reviews as Array<{ version: number }>).some((r) => r.version === 3));
});

test("ردیفِ خرابِ دیتابیس باز نمی‌شود و حدس زده نمی‌شود", async () => {
  const h = harness();
  const id = (await saveWorkbook(h.gw, { workbookId: null, baseVersion: 0, workbook: complete() })).body.workbookId as string;
  h.versions[0].body = { version: 1, domain: "macro_ir", evidence: "not-an-array" };
  assert.equal((await openWorkbook(h.gw, id, null)).status, 422);
  assert.equal((await decideWorkbook(h.gw, { workbookId: id, version: 1, decision: "approved_internal" })).status, 422);
});

test("جدولِ ناموجود (migration اجرا نشده) → ۵۰۳ صادق با پرچمِ unavailable", async () => {
  const h = harness({ unavailable: true });
  const r = await saveWorkbook(h.gw, { workbookId: null, baseVersion: 0, workbook: complete() });
  assert.equal(r.status, 503);
  assert.equal(r.body.unavailable, true);
  assert.equal((await listWorkbooks(h.gw)).status, 503);
});

test("نگاشتِ خطای مخزن: کُدها و الگوهای شناخته‌شده؛ متنِ خام هرگز", () => {
  const code = (e: unknown) => (e instanceof StoreError ? e.code : "generic");
  assert.equal(code(classifyStoreError({ code: "23505", message: "duplicate key" })), "conflict");
  assert.equal(code(classifyStoreError({ code: "P0001", message: "research workbook: version gap (9 without 8)" })), "conflict");
  assert.equal(code(classifyStoreError({ code: "P0001", message: "research workbook: stale version" })), "conflict");
  assert.equal(code(classifyStoreError({ code: "PGRST205", message: "Could not find the table" })), "unavailable");
  assert.equal(code(classifyStoreError({ code: "42P01", message: "relation does not exist" })), "unavailable");
  assert.equal(code(classifyStoreError({ code: "P0001", message: "research workbook: approval requires evidence" })), "no_evidence");
  const generic = classifyStoreError({ code: "XX000", message: "password=hunter2 host=db" });
  assert.equal(code(generic), "generic");
  assert.ok(!generic.message.includes("hunter2"));
});

test("latestPerWorkbook: یک ردیف برای هر کاربرگ، بالاترین نسخه، جدیدترین اول", () => {
  const rows = [
    { workbookId: "a", version: 1, createdAt: "2026-09-20T00:00:00Z" },
    { workbookId: "b", version: 1, createdAt: "2026-09-21T00:00:00Z" },
    { workbookId: "a", version: 2, createdAt: "2026-09-22T00:00:00Z" },
  ];
  assert.deepEqual(latestPerWorkbook(rows).map((r) => `${r.workbookId}${r.version}`), ["a2", "b1"]);
});
