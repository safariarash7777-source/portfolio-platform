import test from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_SECRET_ENV,
  DEFAULT_SOURCE,
  DUPLICATE_WINDOW_MS,
  INVALID_JSON,
  LEAD_LIMITS,
  LEGACY_SECRET_ENV,
  handleLeadWebhook,
  parseLeadPayload,
  resolveWebhookSecret,
  secretMatches,
  type LeadRecord,
  type LeadStore,
} from "./webhook";

const SECRET = "s3cr3t-value-not-a-real-key";

/** انبارِ در-حافظه با امکانِ شبیه‌سازیِ خطا. */
function makeStore(opts: { insertError?: unknown; lookupError?: unknown; seed?: LeadRecord[] } = {}) {
  const rows: Array<LeadRecord & { created_at: string }> = (opts.seed ?? []).map((l) => ({
    ...l,
    created_at: new Date().toISOString(),
  }));
  const store: LeadStore & { rows: typeof rows; lookups: number } = {
    rows,
    lookups: 0,
    async findRecentDuplicate({ phone, topic, sinceIso }) {
      store.lookups += 1;
      if (opts.lookupError) return { found: false, error: opts.lookupError };
      const found = rows.some(
        (r) => r.phone === phone && r.topic === topic && r.created_at >= sinceIso
      );
      return { found };
    },
    async insertLead(lead) {
      if (opts.insertError) return { error: opts.insertError };
      rows.push({ ...lead, created_at: new Date().toISOString() });
      return { error: null };
    },
  };
  return store;
}

function validBody(over: Record<string, unknown> = {}) {
  return {
    source: "miniapp",
    name: "آرش صفری",
    phone: "09121234567",
    topic: "gold",
    message: "سلام",
    preferred_date: "1405-05-10",
    preferred_time: "10:00",
    telegram_username: "arash",
    telegram_id: "123456789",
    ...over,
  };
}

function run(over: Parameters<typeof handleLeadWebhook>[0] extends infer T ? Partial<T> : never) {
  return handleLeadWebhook({
    providedSecret: SECRET,
    body: validBody(),
    env: { [CANONICAL_SECRET_ENV]: SECRET },
    store: makeStore(),
    ...over,
  } as Parameters<typeof handleLeadWebhook>[0]);
}

// ── ۱) سکرت تنظیم نشده ───────────────────────────────────────────────────────
test("سکرت تنظیم نشده → ۴۰۱ و هیچ درجی", async () => {
  const store = makeStore();
  const res = await run({ env: {}, store });
  assert.equal(res.status, 401);
  assert.equal(res.body.code, "unauthorized");
  assert.equal(store.rows.length, 0);
});

test("سکرتِ تهی/فضای خالی مثلِ تنظیم‌نشده رفتار می‌کند", async () => {
  const res = await run({ env: { [CANONICAL_SECRET_ENV]: "   " } });
  assert.equal(res.status, 401);
});

// ── ۲) سکرتِ اشتباه ──────────────────────────────────────────────────────────
test("سکرتِ اشتباه → ۴۰۱ و هیچ درجی", async () => {
  const store = makeStore();
  const res = await run({ providedSecret: "wrong", store });
  assert.equal(res.status, 401);
  assert.equal(store.rows.length, 0);
});

test("هدرِ نبودهٔ سکرت → ۴۰۱", async () => {
  const res = await run({ providedSecret: null });
  assert.equal(res.status, 401);
});

test("سکرتی که پیشوندِ سکرتِ درست است رد می‌شود", async () => {
  const res = await run({ providedSecret: SECRET.slice(0, -1) });
  assert.equal(res.status, 401);
});

// ── ۳) سکرتِ درست ────────────────────────────────────────────────────────────
test("سکرتِ درست → ۲۰۰ و یک ردیفِ درج‌شده", async () => {
  const store = makeStore();
  const res = await run({ store });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.duplicate, false);
  assert.equal(store.rows.length, 1);
});

test("secretMatches زمان‌ثابت است و طولِ نابرابر را بدونِ استثنا رد می‌کند", () => {
  assert.equal(secretMatches("a", "a"), true);
  assert.equal(secretMatches("a", "aaaaaaaaaaaaaaaaaaaa"), false);
  assert.equal(secretMatches(null, "a"), false);
  assert.equal(secretMatches("", "a"), false);
});

// ── ۴) payload نامعتبر ───────────────────────────────────────────────────────
test("بدنهٔ غیرِ JSON → ۴۰۰", async () => {
  const store = makeStore();
  const res = await run({ body: INVALID_JSON, store });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "invalid_json");
  assert.equal(store.rows.length, 0);
});

test("بدنهٔ آرایه یا null → ۴۰۰", async () => {
  assert.equal((await run({ body: [] })).status, 400);
  assert.equal((await run({ body: null })).status, 400);
  assert.equal((await run({ body: "x" })).status, 400);
});

test("فیلدِ بیش‌ازحد بلند → ۴۰۰ با نامِ فیلد", async () => {
  const res = await run({ body: validBody({ message: "x".repeat(LEAD_LIMITS.message + 1) }) });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "field_too_long");
  assert.equal(res.body.field, "message");
});

test("شمارهٔ نامعتبر → ۴۰۰", async () => {
  const res = await run({ body: validBody({ phone: "12" }) });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "invalid_phone");
});

// ── ۵) فیلدهای الزامی ────────────────────────────────────────────────────────
test("نامِ نبوده یا خالی → ۴۰۰", async () => {
  for (const name of [undefined, "", "   ", 42]) {
    const res = await run({ body: validBody({ name }) });
    assert.equal(res.status, 400, `name=${String(name)}`);
    assert.equal(res.body.code, "name_required");
  }
});

test("فقط نام کافی است؛ بقیه null می‌شوند و source پیش‌فرض می‌گیرد", () => {
  const parsed = parseLeadPayload({ name: "آرش" });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.lead.source, DEFAULT_SOURCE);
  assert.equal(parsed.lead.phone, null);
  assert.equal(parsed.lead.topic, null);
  assert.equal(parsed.lead.status, "new");
});

test("ارقامِ فارسی در شماره قبل از اعتبارسنجی به لاتین تبدیل می‌شوند", () => {
  const parsed = parseLeadPayload({ name: "آرش", phone: "۰۹۱۲۱۲۳۴۵۶۷" });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.lead.phone, "09121234567");
});

test("status از payload خوانده نمی‌شود (فراخواننده نمی‌تواند چرخهٔ حیات را ست کند)", () => {
  const parsed = parseLeadPayload({ name: "آرش", status: "archived" });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.lead.status, "new");
});

test("notes از payload خوانده نمی‌شود (فیلدِ داخلیِ ادمین)", () => {
  const parsed = parseLeadPayload({ name: "آرش", notes: "تزریق" });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.ok(!("notes" in parsed.lead));
});

// ── ۶) درجِ موفق روی انبارِ ایزوله ───────────────────────────────────────────
test("درجِ موفق همهٔ فیلدهای نرمال‌شده را ذخیره می‌کند", async () => {
  const store = makeStore();
  await run({ store });
  const row = store.rows[0];
  assert.equal(row.name, "آرش صفری");
  assert.equal(row.phone, "09121234567");
  assert.equal(row.topic, "gold");
  assert.equal(row.telegram_id, "123456789");
  assert.equal(row.status, "new");
});

// ── ۷) شکستِ درج ─────────────────────────────────────────────────────────────
test("شکستِ درج → ۵۰۰ (هرگز ۲۰۰ِ کاذب)", async () => {
  const store = makeStore({ insertError: { code: "42P01", message: 'relation "leads" does not exist' } });
  const res = await run({ store });
  assert.equal(res.status, 500);
  assert.equal(res.body.code, "db_insert_failed");
  assert.notEqual(res.body.ok, true);
});

// ── ۸) رفتارِ تکراری ─────────────────────────────────────────────────────────
test("ارسالِ دوبارهٔ همان لید در پنجره → ۲۰۰ با duplicate=true و بدونِ درجِ دوم", async () => {
  const store = makeStore();
  await run({ store });
  const res = await run({ store });
  assert.equal(res.status, 200);
  assert.equal(res.body.duplicate, true);
  assert.equal(store.rows.length, 1);
});

test("همان شماره پس از پایانِ پنجره دوباره درج می‌شود", async () => {
  const store = makeStore();
  await run({ store });
  const later = new Date(Date.now() + DUPLICATE_WINDOW_MS + 60_000);
  const res = await run({ store, now: later });
  assert.equal(res.body.duplicate, false);
  assert.equal(store.rows.length, 2);
});

test("موضوعِ متفاوت با همان شماره تکراری نیست", async () => {
  const store = makeStore();
  await run({ store });
  const res = await run({ store, body: validBody({ topic: "stock" }) });
  assert.equal(res.body.duplicate, false);
  assert.equal(store.rows.length, 2);
});

test("لیدِ بدونِ شماره اصلاً بررسیِ تکراری نمی‌شود", async () => {
  const store = makeStore();
  await run({ store, body: { name: "آرش" } });
  assert.equal(store.lookups, 0);
  assert.equal(store.rows.length, 1);
});

test("شکستِ خودِ بررسیِ تکراری نباید لید را از بین ببرد", async () => {
  const store = makeStore({ lookupError: { message: "timeout" } });
  const res = await run({ store });
  assert.equal(res.status, 200);
  assert.equal(store.rows.length, 1);
});

// ── ۹) پاسخِ فراخواننده ─────────────────────────────────────────────────────
test("هر پاسخ یک code دارد و فقط مسیرهای موفق ok=true می‌دهند", async () => {
  const cases: Array<[Awaited<ReturnType<typeof handleLeadWebhook>>, boolean]> = [
    [await run({ env: {} }), false],
    [await run({ providedSecret: "bad" }), false],
    [await run({ body: INVALID_JSON }), false],
    [await run({ body: validBody({ name: "" }) }), false],
    [await run({ store: makeStore({ insertError: { message: "x" } }) }), false],
    [await run({}), true],
  ];
  for (const [res, shouldBeOk] of cases) {
    assert.equal(typeof res.status, "number");
    assert.ok(typeof res.body.code === "string" || res.body.ok === true);
    assert.equal(res.body.ok === true, shouldBeOk);
  }
});

// ── ۱۰) نشتِ سکرت در لاگ ────────────────────────────────────────────────────
test("هیچ مسیری سکرت را لاگ نمی‌کند", async () => {
  const logged: string[] = [];
  const log = (m: string, meta?: unknown) =>
    logged.push(m + (meta === undefined ? "" : " " + JSON.stringify(meta)));

  await run({ env: {}, log });
  await run({ providedSecret: "wrong", log });
  await run({ log });
  await run({ env: { [LEGACY_SECRET_ENV]: SECRET }, log });
  await run({ store: makeStore({ insertError: { message: "boom" } }), log });

  assert.ok(logged.length > 0, "انتظار می‌رفت چیزی لاگ شود");
  for (const line of logged) {
    assert.ok(!line.includes(SECRET), `سکرت در لاگ نشت کرد: ${line}`);
    assert.ok(!line.includes("wrong"), `سکرتِ ارسالی در لاگ نشت کرد: ${line}`);
  }
});

// ── ۱۱) سازگاریِ عقب‌رو با نامِ قدیمیِ سکرت ──────────────────────────────────
test("نامِ متعارف بر نامِ قدیمی اولویت دارد", () => {
  const r = resolveWebhookSecret({
    [CANONICAL_SECRET_ENV]: "canonical",
    [LEGACY_SECRET_ENV]: "legacy",
  });
  assert.deepEqual(r, { secret: "canonical", source: "canonical" });
});

test("اگر فقط نامِ قدیمی ست باشد پذیرفته می‌شود", () => {
  const r = resolveWebhookSecret({ [LEGACY_SECRET_ENV]: "legacy" });
  assert.deepEqual(r, { secret: "legacy", source: "legacy" });
});

test("هیچ‌کدام ست نباشد → null", () => {
  assert.equal(resolveWebhookSecret({}), null);
});

test("مسیرِ کاملِ لید با نامِ قدیمی کار می‌کند و هشدارِ منسوخ می‌دهد", async () => {
  const logged: string[] = [];
  const store = makeStore();
  const res = await run({
    env: { [LEGACY_SECRET_ENV]: SECRET },
    store,
    log: (m) => logged.push(m),
  });
  assert.equal(res.status, 200);
  assert.equal(store.rows.length, 1);
  assert.ok(
    logged.some((l) => l.includes(LEGACY_SECRET_ENV) && l.includes(CANONICAL_SECRET_ENV)),
    "انتظار می‌رفت هشدارِ مهاجرت لاگ شود"
  );
});
