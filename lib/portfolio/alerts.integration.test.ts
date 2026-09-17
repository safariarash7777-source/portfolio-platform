/**
 * جدول‌های هشدارِ بازتوازن (phase33) روی Postgresِ واقعی.
 *
 * چرا یکپارچه: چیزی که اثبات می‌شود قفلِ یکتایی، گاردِ append-only، قیدهای
 * «شکست با موفقیت اشتباه نشود» و جداییِ دو عضو در سطحِ RLS است. هیچ‌کدام با
 * بدل اثبات نمی‌شوند — در `#139` دقیقاً یک سیاستِ بی‌اثر از همین راه پیدا شد.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";

const ENV = {
  ...process.env,
  PGHOST: process.env.PGHOST ?? "127.0.0.1",
  PGPORT: process.env.PGPORT ?? "5433",
  PGUSER: process.env.PGUSER ?? "postgres",
  PGPASSWORD: process.env.PGPASSWORD ?? "postgres",
};
const ROOT = process.cwd();
const FILES = [
  join(ROOT, "sql", "test", "supabase_bootstrap.sql"),
  join(ROOT, "sql", "test", "portfolio_precondition.sql"),
  join(ROOT, "sql", "phase33_rebalance_alerts.sql"),
];
const DB = "rebalance_alerts_test";
const A = "22222222-2222-2222-2222-222222222222";
const B = "33333333-3333-3333-3333-333333333333";
// ⚠️ بلوکِ «مسیر کامل» عمداً کاربرِ تازه دارد. جدول‌ها append-only‌اند، پس
// ارسالِ موفقی که بلوکِ قبلی برای A ثبت کرده پاک‌شدنی نیست و همان وضعیت را
// داخلِ «فاصلهٔ خاموشی» می‌برد. جداسازی با کاربر است، نه با پاک‌کردن.
const C = "66666666-6666-6666-6666-666666666666";
const D = "77777777-7777-7777-7777-777777777777";

function psql(db: string, sql: string): string {
  return execFileSync("psql", ["-d", db, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function psqlFile(db: string, file: string): void {
  const r = spawnSync("psql", ["-d", db, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", file], {
    env: ENV, encoding: "utf8",
  });
  if ((r.status ?? -1) !== 0) throw new Error(`psql ${file} → ${r.status}: ${r.stdout}${r.stderr}`);
}
function expectError(db: string, sql: string): string {
  try { psql(db, sql); } catch (error) {
    return String((error as { stderr?: Buffer | string }).stderr ?? "");
  }
  return "";
}
function wrap(role: string, sub: string | null, sql: string): string {
  const claims = sub ? `{"sub":"${sub}","role":"${role}"}` : `{"role":"${role}"}`;
  return `BEGIN; SELECT set_config('request.jwt.claims','${claims}',true); SET LOCAL ROLE ${role}; ${sql}; COMMIT;`;
}
const asRole = (role: string, sub: string | null, sql: string) => psql(DB, wrap(role, sub, sql));
const asRoleError = (role: string, sub: string | null, sql: string) => expectError(DB, wrap(role, sub, sql));
const last = (s: string) => s.split("\n").filter(Boolean).pop()?.trim() ?? "";

const insertEvent = (user: string, key: string) => `
  INSERT INTO public.rebalance_alert_events
    (user_id, alert_key, holding_version_id, target_version_id, breached_classes, max_deviation_points)
  VALUES ('${user}', '${key}', gen_random_uuid(), gen_random_uuid(), ARRAY['gold'], 12.5)`;

let available = true;

before(() => {
  try {
    execFileSync("psql", ["-d", "postgres", "-X", "-q", "-c", "SELECT 1"], { env: ENV, stdio: "ignore" });
  } catch {
    // در CI نبودِ Postgres باید خطا باشد، نه skipِ بی‌صدا — همان قاعدهٔ test:db.
    if (process.env.CI === "true") throw new Error("Postgres در دسترس نیست و CI=true است.");
    available = false;
    return;
  }
  psql("postgres", `DROP DATABASE IF EXISTS ${DB}`);
  psql("postgres", `CREATE DATABASE ${DB}`);
  for (const f of FILES) psqlFile(DB, f);
  psql(DB, `INSERT INTO auth.users(id) VALUES ('${A}'),('${B}'),('${C}'),('${D}')`);
  psql(DB, `INSERT INTO public.profiles(id, role) VALUES ('${A}','user'),('${B}','user'),('${C}','user'),('${D}','user')`);
});

after(() => {
  if (available) psql("postgres", `DROP DATABASE IF EXISTS ${DB}`);
});

describe("phase33 — ذخیرهٔ پایدار هشدار", { skip: !available }, () => {
  test("قفلِ یکتایی دومین ادعای همان وضعیت را رد می‌کند", () => {
    psql(DB, insertEvent(A, "dup-key"));
    const err = expectError(DB, insertEvent(A, "dup-key"));
    assert.match(err, /duplicate key|rae_user_key_unique/i);
  });

  test("ON CONFLICT DO NOTHING ردیف برنمی‌گرداند — همان چیزی که برنامه به آن تکیه می‌کند", () => {
    psql(DB, insertEvent(A, "claim-key"));
    const out = psql(DB, `${insertEvent(A, "claim-key")} ON CONFLICT DO NOTHING RETURNING id`);
    assert.equal(out, "", "بازندهٔ مسابقه هیچ شناسه‌ای نمی‌گیرد");
  });

  test("همان کلید برای عضوِ دیگر مجاز است — وضعیتِ اعضا مستقل است", () => {
    psql(DB, insertEvent(A, "shared-key"));
    const id = psql(DB, `${insertEvent(B, "shared-key")} RETURNING id`);
    assert.ok(id.length > 0, "کلیدِ یکسان برای دو عضو تعارض نیست");
  });

  test("رویداد append-only است", () => {
    const id = psql(DB, `${insertEvent(A, "ao-key")} RETURNING id`);
    assert.match(expectError(DB, `UPDATE public.rebalance_alert_events SET alert_key='x' WHERE id='${id}'`), /append-only/);
    assert.match(expectError(DB, `DELETE FROM public.rebalance_alert_events WHERE id='${id}'`), /append-only/);
  });

  test("«sent» بدونِ زمان و «failed» بدونِ دلیل در سطحِ دیتابیس رد می‌شوند", () => {
    const id = psql(DB, `${insertEvent(A, "chk-key")} RETURNING id`);
    assert.match(
      expectError(DB, `INSERT INTO public.rebalance_alert_deliveries (event_id, channel, status, attempt) VALUES ('${id}','log','sent',1)`),
      /rad_sent_needs_time/
    );
    assert.match(
      expectError(DB, `INSERT INTO public.rebalance_alert_deliveries (event_id, channel, status, attempt) VALUES ('${id}','log','failed',1)`),
      /rad_failed_needs_why/
    );
    // حالتِ درست قبول می‌شود، پس قید بیش‌ازحد سخت نیست.
    psql(DB, `INSERT INTO public.rebalance_alert_deliveries (event_id, channel, status, attempt, sent_at) VALUES ('${id}','log','sent',1, now())`);
    psql(DB, `INSERT INTO public.rebalance_alert_deliveries (event_id, channel, status, attempt, error) VALUES ('${id}','email','failed',1,'شبکه')`);
    assert.equal(psql(DB, `SELECT count(*) FROM public.rebalance_alert_deliveries WHERE event_id='${id}'`), "2");
  });

  test("کانالِ ناشناخته ذخیره نمی‌شود", () => {
    const id = psql(DB, `${insertEvent(A, "ch-key")} RETURNING id`);
    assert.match(
      expectError(DB, `INSERT INTO public.rebalance_alert_deliveries (event_id, channel, status, attempt, sent_at) VALUES ('${id}','sms','sent',1, now())`),
      /channel/
    );
  });

  test("عضو فقط رویدادهای خودش را می‌بیند", () => {
    psql(DB, insertEvent(A, "rls-a"));
    psql(DB, insertEvent(B, "rls-b"));
    const aSees = last(asRole("authenticated", A, "SELECT count(*) FROM public.rebalance_alert_events WHERE alert_key IN ('rls-a','rls-b')"));
    const bSees = last(asRole("authenticated", B, "SELECT count(*) FROM public.rebalance_alert_events WHERE alert_key IN ('rls-a','rls-b')"));
    assert.equal(aSees, "1");
    assert.equal(bSees, "1");
  });

  test("عضو نمی‌تواند رویداد بنویسد — حتی برای خودش", () => {
    // ⚠️ اگر می‌توانست، می‌توانست برای کاربرِ دیگری هم جعل کند؛ تنها مانع
    // نبودِ سیاستِ INSERT نیست، حقِ جدول هم پس گرفته شده.
    const err = asRoleError("authenticated", A, insertEvent(A, "forge"));
    assert.match(err, /permission denied|violates row-level security/i);
  });

  test("عضو تحویل‌های عضوِ دیگر را نمی‌بیند", () => {
    const idB = psql(DB, `${insertEvent(B, "del-b")} RETURNING id`);
    psql(DB, `INSERT INTO public.rebalance_alert_deliveries (event_id, channel, status, attempt, sent_at) VALUES ('${idB}','log','sent',1, now())`);
    assert.equal(last(asRole("authenticated", A, `SELECT count(*) FROM public.rebalance_alert_deliveries WHERE event_id='${idB}'`)), "0");
    assert.equal(last(asRole("authenticated", B, `SELECT count(*) FROM public.rebalance_alert_deliveries WHERE event_id='${idB}'`)), "1");
  });

  test("service_role حقِ تخریب ندارد — گاردِ append-only توخالی نیست", () => {
    const err = asRoleError("service_role", null, "TRUNCATE public.rebalance_alert_events");
    assert.match(err, /permission denied|must be owner/i);
  });
});

/**
 * ── مسیرِ کامل: محاسبه ← تصمیم ← ذخیره در Postgresِ واقعی ← گیرندهٔ آزمایشی ──
 *
 * اینجا `dispatchRebalanceAlert` واقعی با ذخیره‌گاهی اجرا می‌شود که روی همان
 * دیتابیس می‌نویسد. پس قفلِ ضدتکرار همان `UNIQUE` واقعی است، نه یک `Map`.
 *
 * ⚠️ چه چیزی اینجا اثبات **نمی‌شود**: ترجمهٔ همین پرس‌وجوها توسط `supabase-js`
 * در `alertStore.ts`. آن لایه به یک PostgREST زنده نیاز دارد که در این محیط
 * نیست. معناشناسیِ SQL اثبات شده، اتصالِ کلاینت نه.
 */
import { buildHoldingsView } from "./view";
import { dispatchRebalanceAlert, type AlertMessage, type AlertSinkPort, type AlertStorePort, type ClaimInput } from "./alertDispatch";

/** ذخیره‌گاهِ واقعی روی همان Postgres — از راهِ psql، بدونِ supabase-js. */
class PgStore implements AlertStorePort {
  async loadState(userId: string) {
    // ⚠️ جداکننده عمداً chr(1) است، نه `|`. خودِ `alert_key` از سه جزء با
    // `|` ساخته می‌شود، پس جداکنندهٔ `|` کلید را وسطش می‌شکست و وضعیت را
    // «کلیدِ متفاوت» نشان می‌داد. آن اشتباه در همین تست پیدا شد و جالب اینکه
    // پیامِ تکراری باز هم نرفت — لایهٔ دومِ دفاعی (`already_delivered`) گرفتش.
    const row = psql(DB, `
      SELECT e.alert_key || chr(1) || coalesce(max(d.sent_at)::text,'')
        FROM public.rebalance_alert_events e
        JOIN public.rebalance_alert_deliveries d
          ON d.event_id = e.id AND d.status = 'sent'
       WHERE e.user_id = '${userId}'
       GROUP BY e.id, e.alert_key
       ORDER BY max(d.sent_at) DESC
       LIMIT 1`);
    if (!row) return { lastKey: null, lastSentAt: null };
    const [key, sentAt] = row.split("\u0001");
    return { lastKey: key ?? null, lastSentAt: sentAt || null };
  }

  async claimEvent(input: ClaimInput) {
    const classes = `ARRAY[${input.breachedClasses.map((c) => `'${c}'`).join(",")}]::text[]`;
    const claimed = psql(DB, `
      INSERT INTO public.rebalance_alert_events
        (user_id, alert_key, holding_version_id, target_version_id, breached_classes, max_deviation_points)
      VALUES ('${input.userId}', '${input.alertKey}', '${input.holdingVersionId}',
              '${input.targetVersionId}', ${classes}, ${input.maxDeviationPoints})
      ON CONFLICT DO NOTHING RETURNING id`);
    if (claimed) return { claimed: true, eventId: claimed, alreadyDelivered: false, attemptsRecorded: 0 };

    const found = psql(DB, `
      SELECT e.id || chr(1) || count(d.*) || chr(1) || count(d.*) FILTER (WHERE d.status='sent')
        FROM public.rebalance_alert_events e
        LEFT JOIN public.rebalance_alert_deliveries d ON d.event_id = e.id
       WHERE e.user_id='${input.userId}' AND e.alert_key='${input.alertKey}'
       GROUP BY e.id`);
    if (!found) return { claimed: false, eventId: null, alreadyDelivered: false, attemptsRecorded: 0 };
    const [id, total, sent] = found.split("\u0001");
    return {
      claimed: false,
      eventId: id!,
      alreadyDelivered: Number(sent) > 0,
      attemptsRecorded: Number(total),
    };
  }

  async recordDelivery(d: Parameters<AlertStorePort["recordDelivery"]>[0]) {
    psql(DB, `
      INSERT INTO public.rebalance_alert_deliveries (event_id, channel, status, attempt, error, sent_at)
      VALUES ('${d.eventId}', '${d.channel}', '${d.status}', ${d.attempt},
              ${d.error === null ? "NULL" : `'${d.error.replace(/'/g, "''")}'`},
              ${d.sentAt === null ? "NULL" : `'${d.sentAt}'`})`);
  }
}

/** گیرندهٔ آزمایشی — پیام را نگه می‌دارد و جایی نمی‌فرستد. */
class TestReceiver implements AlertSinkPort {
  readonly channel = "log" as const;
  readonly inbox: AlertMessage[] = [];
  async deliver(m: AlertMessage) { this.inbox.push(m); return { ok: true }; }
}

describe("مسیر کامل تا گیرندهٔ آزمایشی", { skip: !available }, () => {
  const HV = "44444444-4444-4444-4444-444444444444";
  const TV = "55555555-5555-5555-5555-555555555555";

  /** محاسبهٔ واقعی: ۱۰۰٪ طلا در هدف، ولی همهٔ دارایی سهام است. */
  function compute() {
    return buildHoldingsView({
      holdings: {
        id: HV, version: 1,
        positions: [{
          positionKey: "p1", symbol: "خودرو", manualLabel: null,
          assetClass: "equity_ir", qty: 100, unit: "سهم", costBasis: null, asOf: "2026-09-16",
        }],
      },
      storedTarget: { id: TV, version: 1, referenceVersionId: null, allocations: [{ asset: "طلا", pct: 100 }] },
      priceRows: [{ symbol: "خودرو", trade_date: "2026-09-16", close: 760, last_price: null, source: "relay_eod" }],
      maxPriceAgeDays: 3, maxPriceFutureDays: 1,
      now: new Date("2026-09-17T00:00:00Z"),
    });
  }

  const options = { thresholdPoints: 5, cooldownHours: 24, maxAttempts: 2, now: new Date("2026-09-17T00:00:00Z") };

  test("محاسبه ← ذخیره ← گیرنده، و نتیجه در دیتابیس قابل مشاهده است", async () => {
    const view = compute();
    assert.equal(view.definitive, true, "محاسبه قطعی است");
    assert.ok(view.result, "نتیجهٔ موتور موجود است");

    const store = new PgStore();
    const receiver = new TestReceiver();
    const out = await dispatchRebalanceAlert(
      { userId: C, result: view.result! },
      { store, sinks: [receiver], options }
    );

    assert.equal(out.sent, true);
    assert.ok(out.eventId);

    // گیرنده پیام را گرفت و متنش قاعدهٔ واژگان را نشکسته.
    assert.equal(receiver.inbox.length, 1);
    const text = `${receiver.inbox[0]!.title} ${receiver.inbox[0]!.body}`;
    for (const banned of ["سیگنال", "خرید", "فروش", "توصیه", "پیشنهاد"]) {
      assert.ok(!text.includes(banned), `واژهٔ «${banned}» نباید در متن هشدار باشد`);
    }

    // ردِ ماندگار در دیتابیس — همان چیزی که با ری‌استارت از بین نمی‌رود.
    assert.equal(psql(DB, `SELECT count(*) FROM public.rebalance_alert_events WHERE id='${out.eventId}'`), "1");
    assert.equal(
      psql(DB, `SELECT status FROM public.rebalance_alert_deliveries WHERE event_id='${out.eventId}'`),
      "sent"
    );
    assert.equal(
      psql(DB, `SELECT breached_classes::text FROM public.rebalance_alert_events WHERE id='${out.eventId}'`),
      "{equity_ir,gold}"
    );
  });

  test("اجرای دوباره روی همان وضعیت، پیام دوم نمی‌سازد", async () => {
    const view = compute();
    const receiver = new TestReceiver();
    const out = await dispatchRebalanceAlert(
      { userId: C, result: view.result! },
      { store: new PgStore(), sinks: [receiver], options }
    );
    assert.equal(out.sent, false);
    assert.equal(out.reason, "duplicate");
    assert.equal(receiver.inbox.length, 0, "گیرنده چیزی نگرفت");
  });

  test("عضو دوم مستقل هشدار می‌گیرد", async () => {
    const view = compute();
    const receiver = new TestReceiver();
    const out = await dispatchRebalanceAlert(
      { userId: D, result: view.result! },
      { store: new PgStore(), sinks: [receiver], options }
    );
    assert.equal(out.sent, true, "وضعیت عضو اول عضو دوم را خاموش نمی‌کند");
    assert.equal(receiver.inbox.length, 1);
  });

  test("پوشش ناقص هیچ رویدادی نمی‌سازد", async () => {
    const before = psql(DB, "SELECT count(*) FROM public.rebalance_alert_events");
    const view = buildHoldingsView({
      holdings: {
        id: HV, version: 2,
        positions: [{
          positionKey: "p1", symbol: null, manualLabel: "نفت (دستی)",
          assetClass: "equity_ir", qty: 1, unit: "عدد", costBasis: null, asOf: "2026-09-16",
        }],
      },
      storedTarget: { id: TV, version: 1, referenceVersionId: null, allocations: [{ asset: "طلا", pct: 100 }] },
      priceRows: [],
      maxPriceAgeDays: 3, maxPriceFutureDays: 1,
      now: new Date("2026-09-17T00:00:00Z"),
    });
    assert.equal(view.definitive, false);

    const receiver = new TestReceiver();
    const out = await dispatchRebalanceAlert(
      { userId: D, result: view.result! },
      { store: new PgStore(), sinks: [receiver], options }
    );
    assert.equal(out.reason, "not_definitive");
    assert.equal(receiver.inbox.length, 0);
    assert.equal(psql(DB, "SELECT count(*) FROM public.rebalance_alert_events"), before);
  });
});
