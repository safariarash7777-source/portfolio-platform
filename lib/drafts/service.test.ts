import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  DRAFT_STATUS,
  dismissDraft,
  listDrafts,
  type DraftGateway,
  type DraftReader,
} from "@/lib/drafts/service";
import { MIN_NOTE_LENGTH, type DraftRow } from "@/lib/drafts/contracts";

/** فقط خطوطِ اجراشونده — کامنت‌ها قاعده را **توضیح** می‌دهند، نقض نمی‌کنند. */
function codeOf(src: string): string {
  return src
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .join("\n");
}

const row = (over: Partial<DraftRow> = {}): DraftRow => ({
  id: "d1",
  symbol: "فولاد",
  direction: "buy",
  status: "pending",
  source: "engine",
  reasons: ["نسبتِ ارزش‌گذاری زیرِ میانگینِ صنعت"],
  created_at: "2026-08-24T06:00:00.000Z",
  ...over,
});

function gatewayWith(
  opts: {
    user?: { id: string } | null;
    role?: string | null;
    rows?: readonly DraftRow[] | null;
    readThrows?: boolean;
    dismissResult?: boolean;
    dismissThrows?: boolean;
    userThrows?: boolean;
    roleThrows?: boolean;
  } = {}
) {
  const state = {
    readersCreated: 0,
    reads: 0,
    dismissals: [] as { id: string; note: string; reviewerId: string }[],
  };
  const gateway: DraftGateway = {
    async getUser() {
      if (opts.userThrows) throw new Error("boom");
      return opts.user === undefined ? { id: "admin-1" } : opts.user;
    },
    async getRole() {
      if (opts.roleThrows) throw new Error("boom");
      return opts.role === undefined ? "admin" : opts.role;
    },
    createReader(): DraftReader {
      state.readersCreated++;
      return {
        async readPending() {
          state.reads++;
          if (opts.readThrows) throw new Error("connection reset by peer at 10.0.0.4:5432");
          return opts.rows === undefined ? [row()] : opts.rows;
        },
        async dismiss(id, note, reviewerId) {
          if (opts.dismissThrows) throw new Error("boom");
          state.dismissals.push({ id, note, reviewerId });
          return opts.dismissResult ?? true;
        },
      };
    },
  };
  return { gateway, state };
}

/* ── مجوز ───────────────────────────────────────────────────────────── */

describe("مجوز — شکست می‌بندد، نه باز می‌کند", () => {
  test("بدونِ نشست ۴۰۱ است و هیچ کلاینتی ساخته نمی‌شود", async () => {
    const { gateway, state } = gatewayWith({ user: null });
    const res = await listDrafts(gateway);
    assert.equal(res.status, 401);
    assert.equal(state.readersCreated, 0, "کلاینت نباید پیش از تأییدِ مجوز ساخته شود");
  });

  test("کاربرِ غیرادمین ۴۰۳ می‌گیرد و صف را نمی‌بیند", async () => {
    const { gateway, state } = gatewayWith({ role: "user" });
    const res = await listDrafts(gateway);
    assert.equal(res.status, 403);
    assert.equal(state.readersCreated, 0);
    assert.ok(!("cards" in res.body), "پاسخِ رد نباید دادهٔ صف داشته باشد");
  });

  test("نقشِ تهی مثلِ غیرادمین رد می‌شود", async () => {
    const res = await listDrafts(gatewayWith({ role: null }).gateway);
    assert.equal(res.status, 403);
  });

  test("شکستِ خواندنِ نشست ۴۰۱ و شکستِ خواندنِ نقش ۴۰۳ می‌دهد — نه اجازه", async () => {
    assert.equal((await listDrafts(gatewayWith({ userThrows: true }).gateway)).status, 401);
    assert.equal((await listDrafts(gatewayWith({ roleThrows: true }).gateway)).status, 403);
  });

  test("همان گیت روی اقدامِ نوشتنی هم هست، نه فقط روی خواندن", async () => {
    for (const opts of [{ user: null }, { role: "user" }, { roleThrows: true }]) {
      const { gateway, state } = gatewayWith(opts);
      const res = await dismissDraft(gateway, { id: "d1", note: "دلیلِ کافی" });
      assert.ok(res.status === 401 || res.status === 403, `اقدام باید رد شود: ${JSON.stringify(opts)}`);
      assert.equal(state.dismissals.length, 0, "هیچ نوشتنی نباید انجام شده باشد");
      assert.equal(state.readersCreated, 0);
    }
  });
});

/* ── خالی در برابر خراب ─────────────────────────────────────────────── */

describe("صفِ خالی و صفِ خوانده‌نشده یکی نیستند", () => {
  test("صفِ واقعاً خالی «۰» است و ادعای بررسی نمی‌کند", async () => {
    const res = await listDrafts(gatewayWith({ rows: [] }).gateway);
    assert.equal(res.status, 200);
    assert.ok("cards" in res.body);
    assert.equal(res.body.count, 0);
    assert.equal(res.body.state, "empty");
    assert.match(res.body.detail, /نه اینکه همه‌چیز بررسی شده/);
  });

  test("پرس‌وجوی مردود «نامعلوم» است و هرگز صفر نمی‌شود", async () => {
    for (const opts of [{ rows: null }, { readThrows: true }]) {
      const res = await listDrafts(gatewayWith(opts).gateway);
      assert.equal(res.status, 200);
      assert.ok("cards" in res.body);
      assert.equal(res.body.count, null, "شمارشِ ناخوانا باید `null` بماند");
      assert.equal(res.body.state, "unavailable");
      assert.notEqual(res.body.count, 0);
    }
  });

  test("متنِ استثنا به کاربر نشت نمی‌کند", async () => {
    const res = await listDrafts(gatewayWith({ readThrows: true }).gateway);
    assert.doesNotMatch(JSON.stringify(res.body), /connection reset|10\.0\.0\.4|5432/);
  });

  test("صفِ پر منتظرِ بازبینی است، نه «آماده»", async () => {
    const res = await listDrafts(gatewayWith().gateway);
    assert.ok("cards" in res.body);
    assert.equal(res.body.state, "awaiting_review");
    assert.equal(res.body.count, 1);
  });
});

/* ── فقط بازنشده‌ها ─────────────────────────────────────────────────── */

test("نامزدِ بسته‌شده حتی اگر از پرس‌وجو رد شود در صف نمی‌آید", async () => {
  // دفاعِ لایه‌دوم: اگر روزی `.eq(status, pending)` از پرس‌وجو بیفتد، این
  // فیلتر همچنان جلوی نمایشِ موردِ بسته‌شده را می‌گیرد.
  const rows = [row({ id: "a" }), row({ id: "b", status: "rejected" }), row({ id: "c", status: "approved" })];
  const res = await listDrafts(gatewayWith({ rows }).gateway);
  assert.ok("cards" in res.body);
  assert.deepEqual(res.body.cards.map((c) => c.id), ["a"]);
  assert.equal(res.body.count, 1);
});

/* ── گیتِ انسانیِ کنارگذاشتن ────────────────────────────────────────── */

describe("کنارگذاشتن یک گیتِ انسانی دارد", () => {
  test("بدونِ دلیل انجام نمی‌شود", async () => {
    const { gateway, state } = gatewayWith();
    for (const note of ["", "  ", "ا".repeat(MIN_NOTE_LENGTH - 1)]) {
      const res = await dismissDraft(gateway, { id: "d1", note });
      assert.equal(res.status, 400, `یادداشتِ «${note}» باید رد شود`);
    }
    assert.equal(state.dismissals.length, 0);
  });

  test("بدونِ شناسه انجام نمی‌شود", async () => {
    const res = await dismissDraft(gatewayWith().gateway, { id: "   ", note: "دلیلِ کافی" });
    assert.equal(res.status, 400);
  });

  test("با دلیل، وضعیت بسته می‌شود و بازبین ثبت می‌شود", async () => {
    const { gateway, state } = gatewayWith();
    const res = await dismissDraft(gateway, { id: "d1", note: "  دادهٔ پشتیبان ندارد  " });
    assert.equal(res.status, 200);
    assert.deepEqual(state.dismissals, [
      { id: "d1", note: "دادهٔ پشتیبان ندارد", reviewerId: "admin-1" },
    ]);
  });

  test("نوشتنی که انجام نشد موفق گزارش نمی‌شود", async () => {
    for (const opts of [{ dismissResult: false }, { dismissThrows: true }]) {
      const res = await dismissDraft(gatewayWith(opts).gateway, { id: "d1", note: "دلیلِ کافی" });
      assert.equal(res.status, 500, "شکستِ نوشتن باید دیده شود، نه بلعیده");
      assert.match(JSON.stringify(res.body), /وضعیت تغییر نکرد/);
    }
  });
});

/* ── گیتِ انتشار ────────────────────────────────────────────────────── */

describe("هیچ مسیرِ انتشاری از این ماژول وجود ندارد", () => {
  test("ماژول فقط `pending` را می‌خوانَد و فقط `rejected` را می‌نویسد", () => {
    assert.deepEqual(DRAFT_STATUS, { reads: "pending", writes: "rejected" });
    // `approved` عمداً پیاده‌سازی نشده: بدونِ مسیرِ انتشار، یک نامزدِ
    // «تأییدشده» فقط یک وضعیتِ معلق است که شبیهِ «کاری انجام شد» به‌نظر
    // می‌رسد در حالی که هیچ اتفاقی نیفتاده.
    assert.notEqual(DRAFT_STATUS.writes, "approved");
  });

  test("نه سرویس و نه route هرگز در `signals` نمی‌نویسند", () => {
    for (const file of ["lib/drafts/service.ts", "lib/drafts/contracts.ts", "app/api/admin/drafts/route.ts"]) {
      const code = codeOf(readFileSync(file, "utf8"));
      assert.doesNotMatch(code, /from\(\s*["'`]signals["'`]\s*\)/, `${file} به جدولِ signals دست می‌زند`);
      assert.doesNotMatch(code, /signal_outcomes/, `${file} به نتیجهٔ منتشرشده دست می‌زند`);
    }
  });

  test("مسیرِ درافت‌ها service-role را import نمی‌کند — RLS گیتِ دوم می‌ماند", () => {
    for (const file of ["app/api/admin/drafts/route.ts", "app/(protected)/admin/drafts/page.tsx"]) {
      const src = readFileSync(file, "utf8");
      // فقط کدِ اجراشونده: کامنتِ همان فایل عمداً نامِ `createAdminClient` را
      // می‌آورد تا **بگوید چرا استفاده نشده**، و آن توضیح تخلف نیست.
      assert.doesNotMatch(codeOf(src), /createAdminClient|supabase\/admin/, `${file} RLS را دور می‌زند`);
      assert.match(src, /supabase\/server/, `${file} باید کلاینتِ نشستِ کاربر را بگیرد`);
    }
  });

  test("route هر فعلی جز «کنارگذاشتن» را رد می‌کند", () => {
    const src = readFileSync("app/api/admin/drafts/route.ts", "utf8");
    assert.match(src, /!==\s*"dismiss"/, "route باید فعل را سفیدفهرست کند");
    assert.doesNotMatch(src, /"publish"/, "route نباید فعلِ انتشار بشناسد");
  });

  test("گیتِ انسانیِ انتشارِ موجود دست‌نخورده مانده است", () => {
    // انتشار همچنان متنِ نوشتهٔ انسان را اجباری می‌کند. اگر روزی این شرط
    // برداشته شود، وصل‌کردنِ خروجیِ موتور به کارنامه بی‌صدا ممکن می‌شود.
    const src = readFileSync("app/api/admin/analyses/route.ts", "utf8");
    assert.match(src, /متن تحلیل الزامی است/, "گیتِ «انسان در حلقه» باید بماند");
    assert.match(src, /action === "publish"/);
    // و آن مسیر هرگز از پیش‌نویس‌ها تغذیه نمی‌شود.
    assert.doesNotMatch(src, /signal_drafts/, "کارنامه نباید از نامزدهای موتور تغذیه شود");
  });
});

/* ── مقصد واقعاً وجود دارد ──────────────────────────────────────────── */

test("مقصدی که صفِ میز به آن راه می‌دهد یک صفحهٔ واقعی است", async () => {
  const { APPROVAL_QUEUES } = await import("@/lib/intelligence/approval-queue");
  const spec = APPROVAL_QUEUES.find((q) => q.key === "signal_drafts:pending");
  assert.ok(spec, "صفِ نامزدها باید در فهرست باشد");
  assert.equal(spec!.href, "/admin/drafts");
  assert.ok(existsSync("app/(protected)/admin/drafts/page.tsx"), "صفحهٔ مقصد باید وجود داشته باشد");
  // و زیرِ `(protected)` باشد تا لایهٔ نقش را بگیرد.
  assert.ok(
    !existsSync("app/admin/drafts/page.tsx"),
    "صفحه نباید بیرونِ گروهِ محافظت‌شده باشد"
  );
});
