import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySource, type DeskSource } from "@/lib/desk/contracts";
import { ALL_DESK_SOURCES } from "@/lib/desk/sources";
import { APPROVAL_QUEUES, buildApprovalQueue } from "@/lib/intelligence/approval-queue";

const NOW = new Date("2026-08-24T09:00:00.000Z");

const src = (key: string, count: number): DeskSource =>
  classifySource({ key, table: key.split(":")[0], label: key, rule: null }, { available: true, count }, NOW);

const broken = (key: string, reason = "جدول اجرا نشده"): DeskSource =>
  classifySource(
    { key, table: key.split(":")[0], label: key, rule: null },
    { available: false, count: 0, unavailableReason: reason },
    NOW
  );

const ALL = APPROVAL_QUEUES.map((q) => q.key);

/* ── قاعدهٔ اصلی: صفر ≠ نمی‌دانم ─────────────────────────────────────── */

test("an unreadable queue is never counted as zero waiting items", () => {
  const q = buildApprovalQueue([src(ALL[0], 0), src(ALL[1], 0), broken(ALL[2])]);
  const line = q.lines.find((l) => l.key === ALL[2])!;
  assert.equal(line.count, null, "صفِ خوانده‌نشده نباید صفر شود");
  assert.equal(line.state, "unavailable");
  assert.equal(q.unreadable, 1);
});

test("when nothing could be read, the desk does not say nothing is waiting", () => {
  const q = buildApprovalQueue(ALL.map((k) => broken(k)));
  assert.equal(q.waiting, 0);
  assert.equal(q.unreadable, 3);
  assert.match(q.headline, /خوانده نشد/);
  // خطِ قرمز: «هیچ موردی در صف نیست» در حالی که هیچ صفی خوانده نشده.
  assert.doesNotMatch(q.headline, /هیچ موردی در صف نیست/);
});

test("a partial read is announced as a floor, not as a total", () => {
  const q = buildApprovalQueue([src(ALL[0], 3), src(ALL[1], 0), broken(ALL[2])]);
  assert.equal(q.waiting, 3);
  assert.match(q.headline, /دستِ‌کم/);
  assert.match(q.detail, /کفِ پایین/);
});

test("a genuinely empty queue is empty, and claims nothing about review", () => {
  const q = buildApprovalQueue(ALL.map((k) => src(k, 0)));
  assert.equal(q.waiting, 0);
  assert.equal(q.unreadable, 0);
  assert.match(q.headline, /هیچ موردی در صف نیست/);
  assert.match(q.detail, /نه اینکه همه‌چیز بررسی شده/);
  assert.doesNotMatch(q.detail, /بررسی شد\b|کامل شد/);
});

test("a full queue totals only what it actually counted", () => {
  const q = buildApprovalQueue([src(ALL[0], 2), src(ALL[1], 5), src(ALL[2], 1)]);
  assert.equal(q.waiting, 8);
  assert.equal(q.unreadable, 0);
  assert.match(q.headline, /۸ مورد منتظرِ شماست/);
});

/* ── ترتیب ─────────────────────────────────────────────────────────── */

test("what we cannot see is listed before what we merely have to do", () => {
  const q = buildApprovalQueue([src(ALL[0], 9), broken(ALL[1]), src(ALL[2], 0)]);
  assert.deepEqual(q.lines.map((l) => l.key), [ALL[1], ALL[0], ALL[2]]);
});

/* ── مرزِ محصول: این CRM نیست ────────────────────────────────────────── */

test("a queue line carries a count and a destination — never a person", () => {
  const q = buildApprovalQueue([src(ALL[0], 4)]);
  assert.deepEqual(
    Object.keys(q.lines[0]).sort(),
    ["count", "detail", "href", "key", "label", "linkLabel", "state"],
    "هر کلیدِ تازه‌ای روی این خط باید عمدی باشد — اینجا جای رکوردِ شخصی نیست"
  );
  const payload = JSON.stringify(q);
  assert.doesNotMatch(payload, /@|\+98|09\d{9}|user_id|email|phone/);
});

/**
 * ── چرا این تست دو نیمه دارد ─────────────────────────────────────────────
 * نیمهٔ اولش قبلاً فقط وجودِ **پوشهٔ مسیر** را می‌سنجید، و همین گذاشت یک
 * لینکِ غلط رد شود: `/admin/manage?tab=drafts`. پوشهٔ `manage` وجود داشت،
 * تست سبز شد، ولی `normalizeTab` فقط چهار تب می‌شناسد و `drafts` را
 * **بی‌صدا** به `users` می‌انداخت. کاربر روی «بررسیِ پیش‌نویس‌ها» می‌زد و
 * فهرستِ کاربران می‌دید.
 *
 * پس حالا `?tab=` هم سنجیده می‌شود: مقصد یعنی همان صفحه، نه یک صفحهٔ
 * همسایه که آدرس را قبول می‌کند.
 */
test("every queue destination exists — the route and the tab, not just the folder", async () => {
  const { existsSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");

  for (const spec of APPROVAL_QUEUES) {
    if (spec.href === null) {
      assert.ok(
        spec.noDestination && spec.noDestination.length > 10,
        `صفِ «${spec.label}» مقصد ندارد ولی نگفته چرا`
      );
      assert.equal(spec.linkLabel, null, "صفِ بدونِ مقصد نباید برچسبِ لینک داشته باشد");
      continue;
    }

    const [route, query] = spec.href.split("?");
    const dir = join(process.cwd(), "app", "(protected)", route.replace(/^\//, ""));
    const plain = join(process.cwd(), "app", route.replace(/^\//, ""));
    assert.ok(
      existsSync(dir) || existsSync(plain),
      `صفِ «${spec.label}» به \`${route}\` راه می‌دهد که در این مخزن وجود ندارد`
    );

    if (!query) continue;
    const tab = new URLSearchParams(query).get("tab");
    if (!tab) continue;
    const page = join(existsSync(dir) ? dir : plain, "page.tsx");
    assert.ok(existsSync(page), `صفحهٔ \`${route}\` فایلِ page.tsx ندارد`);
    assert.ok(
      readFileSync(page, "utf8").includes(`"${tab}"`),
      `تبِ \`${tab}\` در \`${route}\` شناخته نمی‌شود — آدرس بی‌صدا به تبِ پیش‌فرض می‌افتد`
    );
  }
});

/**
 * کنترلِ شکست‌پذیری برای همان نیمهٔ دوم: تبِ ساختگی باید رد شود، وگرنه
 * سنجهٔ بالا دوباره فقط پوشه را می‌بیند.
 */
test("the destination check rejects a tab the page does not know", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const page = readFileSync(
    join(process.cwd(), "app", "(protected)", "admin", "manage", "page.tsx"),
    "utf8"
  );
  assert.ok(page.includes('"portfolio"'), "پیش‌فرضِ کنترل نادرست است");
  assert.ok(!page.includes('"drafts"'), "`drafts` نباید تبِ شناخته‌شده باشد — همان لینکِ غلطِ اول");
});

/* ── هر صف باید یک منبعِ واقعیِ فیلترشده داشته باشد ──────────────────── */

test("every queue is backed by a registered source that really filters", () => {
  for (const spec of APPROVAL_QUEUES) {
    const source = ALL_DESK_SOURCES.find((s) => (s.key ?? s.table) === spec.key);
    assert.ok(source, `صفِ \`${spec.key}\` هیچ منبعِ ثبت‌شده‌ای ندارد`);
    assert.ok(
      source!.filter,
      `صفِ \`${spec.key}\` بدونِ فیلتر است — شمارشش کلِ جدول می‌شود، نه عمقِ صف`
    );
  }
});

/**
 * منبعی که ستونِ زمانی‌اش خراب است شمارش را نگه می‌دارد ولی حالتش
 * `unavailable` است. صف نباید به آن عدد تکیه کند: منبعی که یک بخشش خراب
 * است، دربارهٔ بخشِ دیگرش هم قابلِ اعتماد نیست.
 */
test("a count that survived a broken source is still not trusted as queue depth", () => {
  const source = classifySource(
    { key: ALL[0], table: "intel_analyses", label: "x", rule: null },
    { available: true, count: 12, timestampBroken: true },
    NOW
  );
  assert.equal(source.count, 12, "پیش‌فرضِ تست: شمارش باقی می‌ماند");
  // دو صفِ دیگر سالم‌اند تا ثابت شود فقط همین یکی ناخوانا شمرده می‌شود.
  const q = buildApprovalQueue([source, src(ALL[1], 2), src(ALL[2], 0)]);
  assert.equal(q.lines.find((l) => l.key === ALL[0])!.count, null);
  assert.equal(q.waiting, 2, "۱۲ی که از منبعِ خراب مانده بود نباید وارد جمع شود");
  assert.equal(q.unreadable, 1);
});
