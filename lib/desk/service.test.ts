import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDesk, type DeskGateway, type DeskReader } from "@/lib/desk/service";
import type { SourceInput } from "@/lib/desk/contracts";
import { ALL_DESK_SOURCES } from "@/lib/desk/sources";

/**
 * تستِ **رفتاری** میز — نه خواندنِ متنِ سورس.
 *
 * ⚠️ محدودهٔ اعتبار، صریح و بدونِ اغراق:
 *   • این‌ها تستِ محلی/CI روی خودِ توابع‌اند، با وابستگیِ تزریق‌شده.
 *   • تستِ HTTPِ احرازشده با Supabaseِ زنده **نیستند**.
 *   • راستی‌آزماییِ زمانِ اجرا روی Production **نیستند**.
 * هر سه لازم‌اند؛ هیچ‌کدام دیگری را اثبات نمی‌کند. این فایل فقط اولی است.
 */

const NOW = new Date("2026-08-01T12:00:00.000Z");

/** خوانندهٔ بدل که می‌شمارد چند بار ساخته شده — قلبِ ادعای service-role. */
function gatewayWith(
  opts: {
    user?: { id: string } | null;
    role?: string | null;
    probe?: (table: string) => Promise<SourceInput>;
    userThrows?: boolean;
    roleThrows?: boolean;
  } = {}
) {
  const state = { readersCreated: 0, probed: [] as string[] };
  const gateway: DeskGateway = {
    async getUser() {
      if (opts.userThrows) throw new Error("boom");
      return opts.user === undefined ? { id: "u1" } : opts.user;
    },
    async getRole() {
      if (opts.roleThrows) throw new Error("boom");
      return opts.role === undefined ? "admin" : opts.role;
    },
    createReader(): DeskReader {
      state.readersCreated++;
      return {
        async probe(table: string) {
          state.probed.push(table);
          return opts.probe
            ? opts.probe(table)
            : { available: true, count: 5, lastAt: NOW.toISOString() };
        },
      };
    },
  };
  return { gateway, state };
}

/* ── ۱–۴: مجوز، و اینکه service-role کِی ساخته می‌شود ────────────────── */

test("unauthenticated request is rejected with 401", async () => {
  const { gateway } = gatewayWith({ user: null });
  const res = await buildDesk(gateway, NOW);
  assert.equal(res.status, 401);
});

test("authenticated non-admin is rejected with 403", async () => {
  for (const role of ["user", "viewer", "editor", null]) {
    const { gateway } = gatewayWith({ role });
    const res = await buildDesk(gateway, NOW);
    assert.equal(res.status, 403, `نقشِ ${role} نباید اجازه بگیرد`);
  }
});

test("admin is allowed and receives the six approved areas", async () => {
  const { gateway } = gatewayWith();
  const res = await buildDesk(gateway, NOW);
  assert.equal(res.status, 200);
  assert.ok("panels" in res.body);
  assert.deepEqual(
    res.body.panels.map((p) => p.key),
    ["today", "intelligence", "decisions", "reference", "clients", "operations"]
  );
});

test("the service-role reader is never constructed before authorization succeeds", async () => {
  const denied = [
    gatewayWith({ user: null }),
    gatewayWith({ role: "user" }),
    gatewayWith({ role: null }),
    gatewayWith({ userThrows: true }),
    gatewayWith({ roleThrows: true }),
  ];
  for (const { gateway, state } of denied) {
    await buildDesk(gateway, NOW);
    assert.equal(
      state.readersCreated,
      0,
      "کلاینتِ service-role پیش از تأییدِ مجوز ساخته شد — کلیدِ سرویس‌رول نباید در مسیرِ ردشده لمس شود"
    );
  }

  const allowed = gatewayWith();
  await buildDesk(allowed.gateway, NOW);
  assert.equal(allowed.state.readersCreated, 1, "برای ادمین باید دقیقاً یک‌بار ساخته شود");
});

test("a failure while reading the role denies rather than allows", async () => {
  const { gateway } = gatewayWith({ roleThrows: true });
  const res = await buildDesk(gateway, NOW);
  assert.equal(res.status, 403, "شکستِ خواندنِ نقش باید ببندد، نه باز کند");
});

/* ── ۵: شکستِ یک منبع نباید بقیه را از کار بیندازد ──────────────────── */

test("one panel's query failure neither leaks an exception nor disables the others", async () => {
  const { gateway } = gatewayWith({
    probe: async (table) => {
      if (table === "fx_rates") throw new Error("connection reset by peer at 10.0.0.4:5432");
      return { available: true, count: 3, lastAt: NOW.toISOString() };
    },
  });
  const res = await buildDesk(gateway, NOW);
  assert.equal(res.status, 200);
  assert.ok("panels" in res.body);

  const today = res.body.panels.find((p) => p.key === "today")!;
  const fx = today.sources.find((s) => s.table === "fx_rates")!;
  assert.equal(fx.state, "unavailable");

  // منابعِ همسایه دست‌نخورده‌اند.
  const snapshots = today.sources.find((s) => s.table === "ir_market_snapshots")!;
  assert.equal(snapshots.state, "ready");
  const others = res.body.panels.filter((p) => p.key !== "today");
  assert.ok(others.every((p) => p.state === "ready"), "شکستِ یک منبع کلِ میز را خالی کرد");

  // و متنِ استثنا به کاربر نشت نمی‌کند.
  const payload = JSON.stringify(res.body);
  assert.doesNotMatch(payload, /connection reset|10\.0\.0\.4|5432|at Object\.|\.ts:\d+/);
});

/* ── ۶: هیچ دادهٔ شخصی، هیچ سکرت ────────────────────────────────────── */

test("the payload carries no identity, contact detail, secret or row-level customer data", async () => {
  const { gateway } = gatewayWith();
  const res = await buildDesk(gateway, NOW);
  const payload = JSON.stringify(res.body);

  for (const forbidden of [
    /@[a-z0-9.-]+\.[a-z]{2,}/i, // نشانیِ ایمیل
    /\+?\d{10,}/, // شمارهٔ تماس
    /\buser_id\b|\bemail\b|\bphone\b|\bfull_name\b|\bnational_id\b/i,
    /\btoken\b|\bsecret\b|\bapi[_-]?key\b|\bservice_role\b|\bbearer\b/i,
    /eyJ[A-Za-z0-9_-]{10,}/, // JWT
    /\bu1\b/, // شناسهٔ کاربرِ درخواست‌دهنده
  ]) {
    assert.doesNotMatch(payload, forbidden, `پاسخ الگوی ممنوع را دارد: ${forbidden}`);
  }
});

test("the payload exposes only aggregate counts, never rows", async () => {
  const { gateway } = gatewayWith();
  const res = await buildDesk(gateway, NOW);
  assert.ok("panels" in res.body);
  for (const panel of res.body.panels) {
    for (const source of panel.sources) {
      assert.ok(
        source.count === null || Number.isInteger(source.count),
        "شمارش باید عددِ صحیح یا null باشد — هرگز ردیف"
      );
    }
  }
});

/* ── ۷–۱۱: چهار حالت، و «نامعلوم» که هرگز صفر نمی‌شود ─────────────── */

test("a missing table reports unavailable, never empty and never zero", async () => {
  const { gateway } = gatewayWith({
    probe: async (table) =>
      table === "cron_runs"
        ? { available: false, count: 0, unavailableReason: "جدولِ `cron_runs` هنوز اجرا نشده" }
        : { available: true, count: 1, lastAt: NOW.toISOString() },
  });
  const res = await buildDesk(gateway, NOW);
  assert.ok("panels" in res.body);
  const cron = res.body.panels
    .find((p) => p.key === "operations")!
    .sources.find((s) => s.table === "cron_runs")!;
  assert.equal(cron.state, "unavailable");
  assert.equal(cron.count, null, "منبعِ ناموجود نباید شمارشِ صفر نشان دهد");
  assert.notEqual(cron.count, 0);
});

test("an existing but empty table reports empty with a real zero", async () => {
  const { gateway } = gatewayWith({ probe: async () => ({ available: true, count: 0 }) });
  const res = await buildDesk(gateway, NOW);
  assert.ok("panels" in res.body);
  const source = res.body.panels[0].sources[0];
  assert.equal(source.state, "empty");
  assert.equal(source.count, 0, "صفرِ واقعی یک واقعیتِ معتبر است و باید دیده شود");
  assert.equal(source.ageMinutes, null);
});

test("empty and unavailable are never collapsed into each other", async () => {
  const empty = await buildDesk(
    gatewayWith({ probe: async () => ({ available: true, count: 0 }) }).gateway,
    NOW
  );
  const missing = await buildDesk(
    gatewayWith({ probe: async () => ({ available: false, count: 0 }) }).gateway,
    NOW
  );
  assert.ok("panels" in empty.body && "panels" in missing.body);
  assert.equal(empty.body.panels[0].sources[0].state, "empty");
  assert.equal(missing.body.panels[0].sources[0].state, "unavailable");
  assert.notEqual(
    empty.body.panels[0].sources[0].state,
    missing.body.panels[0].sources[0].state
  );
});

test("a broken timestamp column is loud, not silently reported as fresh", async () => {
  const { gateway } = gatewayWith({
    probe: async (table) =>
      table === "ir_market_snapshots"
        ? { available: true, count: 9, timestampBroken: true }
        : { available: true, count: 1, lastAt: NOW.toISOString() },
  });
  const res = await buildDesk(gateway, NOW);
  assert.ok("panels" in res.body);
  const snap = res.body.panels[0].sources.find((s) => s.table === "ir_market_snapshots")!;
  assert.equal(snap.state, "unavailable", "ستونِ زمانیِ خراب هرگز نباید «به‌روز» گزارش شود");
  assert.equal(snap.ageMinutes, null, "سنِ نامعلوم باید null بماند، نه صفر");
  assert.equal(snap.count, 9, "شمارشِ معتبر باید حفظ شود");
  assert.match(snap.detail, /اشتباه پیکربندی/);
});

test("a rule-bearing source with no timestamp at all is unavailable, not ready", async () => {
  // این دقیقاً نقصِ نسخهٔ اول است: آستانه تعریف شده بود، زمانی نبود، و
  // `classifyPanel` مؤدبانه «به‌روز» برمی‌گرداند.
  const { gateway } = gatewayWith({
    probe: async () => ({ available: true, count: 4, lastAt: null }),
  });
  const res = await buildDesk(gateway, NOW);
  assert.ok("panels" in res.body);
  const withRule = res.body.panels[0].sources.find((s) => s.table === "ir_market_snapshots")!;
  assert.equal(withRule.state, "unavailable");
  assert.equal(withRule.ageMinutes, null);
});

test("a stale timestamp reports stale, and a fresh one reports ready", async () => {
  const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

  const fresh = await buildDesk(
    gatewayWith({ probe: async () => ({ available: true, count: 2, lastAt: hoursAgo(0.2) }) }).gateway,
    NOW
  );
  const stale = await buildDesk(
    gatewayWith({ probe: async () => ({ available: true, count: 2, lastAt: hoursAgo(200) }) }).gateway,
    NOW
  );
  assert.ok("panels" in fresh.body && "panels" in stale.body);

  const freshSnap = fresh.body.panels[0].sources.find((s) => s.table === "ir_market_snapshots")!;
  const staleSnap = stale.body.panels[0].sources.find((s) => s.table === "ir_market_snapshots")!;
  assert.equal(freshSnap.state, "ready");
  assert.equal(staleSnap.state, "stale");
  assert.ok(staleSnap.ageMinutes! > freshSnap.ageMinutes!);
});

/* ── تجمیع: بدترین حالت برنده است و هیچ منبعی پنهان نمی‌شود ─────────── */

test("a dead source is not masked by a healthy neighbour in the same area", async () => {
  // این سناریوی واقعیِ نسخهٔ اول است: رله مرده، نرخِ ارزِ امروز درج شده،
  // و بخشِ «امروز» به‌خاطرِ گرفتنِ **تازه‌ترین** زمان سبز دیده می‌شد.
  const { gateway } = gatewayWith({
    probe: async (table) => ({
      available: true,
      count: 5,
      lastAt:
        table === "ir_market_snapshots"
          ? new Date(NOW.getTime() - 48 * 3600_000).toISOString()
          : NOW.toISOString(),
    }),
  });
  const res = await buildDesk(gateway, NOW);
  assert.ok("panels" in res.body);
  const today = res.body.panels.find((p) => p.key === "today")!;
  assert.equal(today.state, "stale", "بخش نباید به‌خاطرِ یک منبعِ سالم سبز شود");
  assert.equal(today.sources.find((s) => s.table === "ir_market_snapshots")!.state, "stale");
  assert.equal(today.sources.find((s) => s.table === "fx_rates")!.state, "ready");
});

test("the overall state is the worst panel, and unavailable outranks empty and stale", async () => {
  const { gateway } = gatewayWith({
    probe: async (table) =>
      table === "cron_runs" ? { available: false, count: 0 } : { available: true, count: 0 },
  });
  const res = await buildDesk(gateway, NOW);
  assert.ok("panels" in res.body);
  assert.equal(res.body.overall, "unavailable");
});

/* ── هر منبعِ اعلام‌شده واقعاً پرس‌وجو می‌شود ────────────────────────── */

test("every registered source is actually probed — none is decorative", async () => {
  const { gateway, state } = gatewayWith();
  await buildDesk(gateway, NOW);
  for (const spec of ALL_DESK_SOURCES) {
    assert.ok(
      state.probed.includes(spec.table),
      `منبعِ \`${spec.table}\` اعلام شده ولی هرگز خوانده نشد — ادعای منبعِ توخالی`
    );
  }
  assert.equal(state.probed.length, ALL_DESK_SOURCES.length);
});

test("every panel links only to destinations that exist in this repository", async () => {
  const { gateway } = gatewayWith();
  const res = await buildDesk(gateway, NOW);
  assert.ok("panels" in res.body);
  const known = [
    "/admin/radar",
    "/admin/fx",
    "/admin/content",
    "/codal",
    "/admin/analyses",
    "/admin/notes",
    "/admin/manage?tab=portfolio",
    "/admin/users",
    "/admin/webinars",
    "/admin/health",
  ];
  for (const panel of res.body.panels) {
    assert.ok(panel.links.length > 0, `بخشِ ${panel.key} هیچ مقصدی برای ادامهٔ کار ندارد`);
    for (const link of panel.links) {
      assert.ok(known.includes(link.href), `مقصدِ ناشناخته: ${link.href}`);
    }
  }
});
