/**
 * دروازه‌های استقرارِ رله — به‌عمد **بیرونِ** فایلِ workflow.
 *
 * ── چرا اینجا و نه داخلِ YAML ────────────────────────────────────────────────
 * منطقی که تصمیم می‌گیرد «منتشر بشود یا نه» و «این انتشار پذیرفته است یا نه»
 * باید آزمودنی باشد. وقتی همان منطق چند خط bash داخلِ یک step است، تنها راهِ
 * آزمودنش اجرای واقعیِ workflow است — یعنی روی Production. پس تصمیم‌ها اینجا
 * تابع‌های خالص‌اند و `relay-gate.test.mjs` حالت‌های شکست را اثبات می‌کند.
 *
 * هیچ وابستگیِ خارجی، هیچ I/O، هیچ دسترسی به شبکه. ورودی → تصمیم.
 */

// ── SHA ─────────────────────────────────────────────────────────────────────

/**
 * ورودیِ کاربر پیش از رسیدن به `git` اعتبارسنجی می‌شود. این فقط «تمیزکاری»
 * نیست: مقدار به خطِ فرمان می‌رود، پس هر چیزی جز hex یک سطحِ تزریق است.
 */
export function validateShaInput(raw) {
  const s = String(raw ?? "").trim();
  if (s === "") return { ok: false, reason: "خالی" };
  if (s.length < 7) return { ok: false, reason: "کوتاه‌تر از ۷ رقم — مبهم" };
  if (s.length > 40) return { ok: false, reason: "بلندتر از ۴۰ رقم" };
  if (!/^[0-9a-fA-F]+$/.test(s)) return { ok: false, reason: "غیرِ hex" };
  return { ok: true, value: s.toLowerCase() };
}

/** خروجیِ `git rev-parse` باید یک SHAِ کاملِ ۴۰ رقمی باشد، نه هر چیزی. */
export function validateResolvedSha(raw) {
  const s = String(raw ?? "").trim();
  if (!/^[0-9a-f]{40}$/.test(s)) return { ok: false, reason: "SHAِ کاملِ ۴۰ رقمی نیست" };
  return { ok: true, value: s };
}

// ── تصمیمِ انتشار ────────────────────────────────────────────────────────────

/**
 * مبنای مقایسه **آخرین انتشارِ موفق** است، نه `HEAD^`.
 *
 * `HEAD^..HEAD` فقط آخرین کامیت را می‌بیند. در یک push چندکامیتی، اگر تغییرِ
 * `relay/` در کامیتِ ماقبلِ آخر باشد، آن مقایسه «تغییری نبود» می‌گوید و تغییر
 * منتشرنشده می‌ماند. مبنای واقعی این است: «از آخرین چیزی که منتشر شد تا حالا،
 * آیا `relay/` عوض شده؟»
 *
 * و ترتیب: CIِ یک کامیتِ قدیمی می‌تواند **بعد از** انتشارِ کامیتِ جدیدتر تمام
 * شود. `concurrency` فقط هم‌زمانی را مهار می‌کند، نه ترتیب را. پس هر SHAیی که
 * جدِ نسخهٔ مستقر باشد رد می‌شود، مگر بازگشتِ صریح.
 */
export function decidePublish(input) {
  const {
    event,
    sha,
    baseline = null,
    isAncestorOfMain,
    ciSuccess,
    isAncestorOfBaseline = false,
    relayChangedSinceBaseline = false,
    allowOlder = false,
  } = input;

  if (!sha) return fail("no-sha", "SHA تعیین نشده");

  // ترتیب مهم است: تعلق به تاریخچهٔ مجاز و CIِ موفق **پیش از** هر کارِ دیگر
  // بررسی می‌شوند، چون بعد از آن‌ها است که توکنِ انتشار لمس می‌شود.
  if (!isAncestorOfMain) {
    return fail("sha-not-in-main", `${short(sha)} در تاریخچهٔ main نیست`);
  }
  if (!ciSuccess) {
    return fail(
      "no-successful-ci",
      `هیچ اجرای موفقِ CI روی ${short(sha)} ثبت نشده. ` +
        `عبورِ test:relay جایگزینِ CI نیست.`,
    );
  }

  if (baseline === null) {
    if (event === "workflow_dispatch") {
      return go("bootstrap", `اولین انتشار — مبنایی برای مقایسه وجود ندارد`);
    }
    return skip(
      "no-baseline",
      `مبنای انتشار (تگِ relay-deployed) وجود ندارد. اولین انتشار باید دستی باشد.`,
    );
  }

  if (sha === baseline) return skip("already-published", `${short(sha)} همین حالا مستقر است`);

  if (isAncestorOfBaseline) {
    if (allowOlder) return go("rollback", `بازگشتِ صریح به ${short(sha)}`);
    return skip(
      "older-than-deployed",
      `${short(sha)} جدِ نسخهٔ مستقر (${short(baseline)}) است — ` +
        `CIِ دیرتمام‌شدهٔ یک کامیتِ قدیمی نباید نسخهٔ جدیدتر را عقب ببرد`,
    );
  }

  if (!relayChangedSinceBaseline) {
    return skip("no-relay-change", `relay/ از ${short(baseline)} تا اینجا عوض نشده`);
  }

  return go("relay-changed", `relay/ از ${short(baseline)} تغییر کرده`);
}

const go = (code, reason) => ({ action: "publish", code, reason });
const skip = (code, reason) => ({ action: "skip", code, reason });
const fail = (code, reason) => ({ action: "fail", code, reason });
const short = (s) => String(s ?? "").slice(0, 7);

// ── کاوشِ اپِ زنده ───────────────────────────────────────────────────────────

/**
 * اسکریپتی که داخلِ کانتینرِ زنده اجرا می‌شود.
 *
 * ⚠️ عمداً **بدونِ `+`، `&`، فاصله و نقل‌قول**. دلیلش در خودِ CLI است:
 * `@liara/cli@9.5.1` در `lib/commands/app/shell.js` فرمان را این‌طور می‌فرستد —
 *
 *     `${wsURL}/v1/exec?token=${token}&cmd=${flags.command}&project_id=...`
 *
 * یعنی **هیچ `encodeURIComponent`ی در کار نیست**. پس `+` هنگامِ decode به فاصله
 * تبدیل می‌شود، `&` رشته را قطع می‌کند و فاصله خودِ URL را خراب می‌کند. نسخهٔ
 * قبلی `console.log("FLAGS="+JSON.stringify(x))` بود و همان یک `+` کافی بود که
 * اسکریپت با SyntaxError بیفتد — مستقل از توکن و دسترسی.
 *
 * هیچ **مقدارِ** سکرتی چاپ نمی‌شود؛ فقط بود/نبود.
 */
export const PROBE_SOURCE =
  "const e=process.env;console.log(JSON.stringify({probe:1,node:process.version,PORT:e.PORT??null,IR_HISTORY_SECTIONS:e.IR_HISTORY_SECTIONS??null,BRSAPI_CLIENT_ENABLED:e.BRSAPI_CLIENT_ENABLED??null,BRSAPI_BUDGET_ENFORCE_LEGACY:e.BRSAPI_BUDGET_ENFORCE_LEGACY??null,BRSAPI_KEY_SET:Boolean(e.BRSAPI_KEY),SUPABASE_URL_SET:Boolean(e.SUPABASE_URL),SUPABASE_SERVICE_ROLE_KEY_SET:Boolean(e.SUPABASE_SERVICE_ROLE_KEY),RELAY_TOKEN_SET:Boolean(e.RELAY_TOKEN)}))";

/**
 * چون CLI خودش encode نمی‌کند، **ما** encode می‌کنیم. `cmd` سمتِ سرور مثلِ هر
 * پارامترِ query رمزگشایی می‌شود، پس فرمانِ درست به کانتینر می‌رسد.
 */
export function probeCommand(source = PROBE_SOURCE) {
  return encodeURIComponent("node -e " + source);
}

/** کاراکترهایی که در یک query stringِ رمزنشده معنای فرمان را عوض می‌کنند. */
export function urlHostileChars(source = PROBE_SOURCE) {
  return [...new Set(source.match(/[+&\s"'#%]/g) ?? [])];
}

// ── پاک‌سازیِ خروجی پیش از گزارش ─────────────────────────────────────────────

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
const SECRETISH = [
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]+)?/g,
  /\b[A-Fa-f0-9]{32,}\b/g,
  /\b[A-Za-z0-9_-]{40,}\b/g,
  /(token|api[-_]?token|key|secret|password)=([^\s&"']+)/gi,
];

/**
 * خروجیِ CLI هرگز خام گزارش نمی‌شود.
 *
 * دلیلِ مشخص: همان خطِ ۳۱ توکن را **داخلِ URL** می‌گذارد، پس هر پیامی که آن URL
 * را نقل کند توکن را با خودش می‌آورد. ماسکِ GitHub فقط مقدارِ دقیقِ سکرت را
 * می‌پوشاند، نه شکلِ تغییریافته‌اش.
 */
export function sanitiseProbeOutput(raw, secrets = [], { maxLines = 20, maxChars = 1500 } = {}) {
  let text = String(raw ?? "").replace(ANSI, "");
  for (const s of secrets) {
    const v = String(s ?? "").trim();
    if (v.length >= 8) text = text.split(v).join("«حذف‌شده»");
  }
  for (const re of SECRETISH) {
    text = text.replace(re, (m, k) => (k ? k + "=«حذف‌شده»" : "«حذف‌شده»"));
  }
  const lines = text.split("\n").map((l) => l.trimEnd()).filter((l) => l !== "");
  const out = lines.slice(-maxLines).join("\n");
  return out.length > maxChars ? out.slice(-maxChars) : out;
}

// ── تشخیص ───────────────────────────────────────────────────────────────────

/**
 * «نتوانستیم دستور را اجرا کنیم» با «اجرا شد ولی خروجی‌اش خراب بود» یکی نیست.
 *
 * نسخهٔ قبلی هر دو را «JSON معتبر نیست» می‌نامید، چون خروجی در یک متغیر گم
 * می‌شد و کدِ خروجِ دستور هم به‌خاطرِ لوله به `tr` از بین می‌رفت. اجرای واقعیِ
 * `34953490961` دقیقاً همین را نشان داد: ۱۲ ثانیه، بدونِ یک کلمه تشخیص.
 *
 * هر پنج حالت **جلوی انتشار را می‌گیرند**؛ تفکیک برای تشخیص است، نه برای عبور.
 */
export function classifyProbe({ exitCode, raw, secrets = [] }) {
  const clean = sanitiseProbeOutput(raw, secrets);
  const fail = (kind, summary) => ({ ok: false, kind, summary, detail: clean });

  if (exitCode === 124 || exitCode === 137) {
    return fail("timeout", "دستورِ liara shell در مهلتِ تعیین‌شده تمام نشد");
  }
  if (exitCode !== 0) {
    const hint = /40[13]|forbidden|unauthor|invalid token|authentication/i.test(clean)
      ? "دسترسی یا توکن پذیرفته نشد"
      : /404|not found|no such app|does not exist/i.test(clean)
        ? "اپ پیدا نشد"
        : /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|socket|network|proxy/i.test(clean)
          ? "اتصال برقرار نشد"
          : "اجرای دستور شکست خورد";
    return fail("command-failed", hint + " (کدِ خروج " + exitCode + ")");
  }
  if (clean.trim() === "") {
    return fail("no-output", "دستور موفق بود ولی هیچ خروجی‌ای نداد");
  }

  const candidates = [];
  for (const line of clean.split("\n")) {
    const t = line.trim().replace(/^.*?FLAGS=\s*/, "");
    if (!t.startsWith("{")) continue;
    try {
      const v = JSON.parse(t);
      if (v && typeof v === "object" && v.probe === 1) candidates.push(t);
    } catch {
      /* خطِ بعدی */
    }
  }
  if (candidates.length === 0) {
    return fail(
      "no-marker",
      "دستور اجرا شد ولی هیچ خطِ JSONِ کاوش برنگشت — اسکریپت داخلِ کانتینر بالا نیامد",
    );
  }
  return { ok: true, flagsJson: candidates[candidates.length - 1], detail: clean };
}

// ── پیش‌پرواز ────────────────────────────────────────────────────────────────

const FLAG_KEYS = [
  "node",
  "PORT",
  "IR_HISTORY_SECTIONS",
  "BRSAPI_CLIENT_ENABLED",
  "BRSAPI_BUDGET_ENFORCE_LEGACY",
  "BRSAPI_KEY_SET",
  "SUPABASE_URL_SET",
  "SUPABASE_SERVICE_ROLE_KEY_SET",
  "RELAY_TOKEN_SET",
];

function parseObject(raw) {
  let v;
  try {
    v = JSON.parse(String(raw ?? ""));
  } catch {
    return { ok: false, reason: "JSON معتبر نیست" };
  }
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    return { ok: false, reason: "شیٔ JSON نیست" };
  }
  return { ok: true, value: v };
}

/**
 * پرچم‌های **واقعیِ** اپِ در حالِ اجرا در برابرِ پیش‌نیازهای نسخهٔ هدف.
 *
 * `phase28Applied=false` یعنی نه `brsapi_budget_days` هست نه
 * `brsapi_budget_lease`. در آن حالت **هر دو** پرچم خطرناک‌اند، نه فقط یکی:
 *   · `BRSAPI_BUDGET_ENFORCE_LEGACY=1` → `BudgetUnavailableError`
 *     («امتناع از ارسالِ بی‌شمارش») در `brsapi-legacy-meter.mjs`
 *   · `BRSAPI_CLIENT_ENABLED=1` → مسیر به `brsapi-budget-store.mjs` می‌رسد که
 *     `rpc("brsapi_budget_lease", …)` صدا می‌زند — تابعی که وجود ندارد
 * هر دو به توقفِ دادهٔ بازار می‌رسند. این تابع **هیچ پرچمی را عوض نمی‌کند**؛
 * فقط انتشار را رد می‌کند.
 */
export function evaluateFlags(raw, opts = {}) {
  const { phase28Applied = false, targetSections = ["gold", "currency"] } = opts;
  const parsed = parseObject(raw);
  if (!parsed.ok) return { ok: false, failures: [`خروجیِ پیش‌پرواز ${parsed.reason}`], flags: null };

  const f = parsed.value;
  const failures = [];

  // ساختار — «FLAGS پیدا شد» کافی نیست.
  for (const k of FLAG_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(f, k)) failures.push(`کلیدِ «${k}» در خروجی نیست`);
  }
  if (failures.length) return { ok: false, failures, flags: null };

  if (typeof f.node !== "string" || !/^v\d+\./.test(f.node)) {
    failures.push(`node نامعتبر: ${JSON.stringify(f.node)}`);
  }
  for (const k of ["PORT", "IR_HISTORY_SECTIONS", "BRSAPI_CLIENT_ENABLED", "BRSAPI_BUDGET_ENFORCE_LEGACY"]) {
    if (f[k] !== null && typeof f[k] !== "string") failures.push(`${k} باید رشته یا null باشد`);
  }
  for (const k of ["BRSAPI_KEY_SET", "SUPABASE_URL_SET", "SUPABASE_SERVICE_ROLE_KEY_SET", "RELAY_TOKEN_SET"]) {
    if (typeof f[k] !== "boolean") failures.push(`${k} باید boolean باشد`);
  }
  if (failures.length) return { ok: false, failures, flags: null };

  // پیش‌نیازهای نسخهٔ هدف.
  if (!phase28Applied) {
    if (f.BRSAPI_BUDGET_ENFORCE_LEGACY === "1") {
      failures.push(
        "BRSAPI_BUDGET_ENFORCE_LEGACY=1 است ولی phase28 اجرا نشده — " +
          "کدِ هدف از ارسالِ بی‌شمارش امتناع می‌کند و دادهٔ بازار می‌ایستد",
      );
    }
    if (f.BRSAPI_CLIENT_ENABLED === "1") {
      failures.push(
        "BRSAPI_CLIENT_ENABLED=1 است ولی phase28 اجرا نشده — " +
          "کلاینتِ مرکزی rpc(brsapi_budget_lease) را صدا می‌زند که وجود ندارد",
      );
    }
  }

  if (!f.BRSAPI_KEY_SET) failures.push("BRSAPI_KEY روی اپ ست نیست — رله دادهٔ بازار نمی‌گیرد");
  if (!f.SUPABASE_URL_SET) failures.push("SUPABASE_URL روی اپ ست نیست");
  if (!f.SUPABASE_SERVICE_ROLE_KEY_SET) failures.push("SUPABASE_SERVICE_ROLE_KEY روی اپ ست نیست");

  // `IR_HISTORY_SECTIONS` هدفِ همین انتشار است: اگر روی اپ ست شده باشد و
  // بخشی بیرونِ هدف داشته باشد، انتشار کارِ خودش را نمی‌کند.
  const secs = sectionsOf(f.IR_HISTORY_SECTIONS);
  if (secs !== null) {
    const extra = secs.filter((s) => !targetSections.includes(s));
    if (extra.length) {
      failures.push(
        `IR_HISTORY_SECTIONS روی اپ «${f.IR_HISTORY_SECTIONS}» است و ` +
          `${extra.join("،")} بیرونِ هدف (${targetSections.join("،")}) می‌ماند — ` +
          "انتشار نشتی را نمی‌بندد. پرچم را در کنسول بردار یا اصلاح کن؛ این workflow تغییرش نمی‌دهد",
      );
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    flags: {
      node: f.node,
      PORT: f.PORT,
      IR_HISTORY_SECTIONS: f.IR_HISTORY_SECTIONS,
      effectiveSections: secs ?? targetSections,
      debugReachable: f.RELAY_TOKEN_SET === true,
    },
  };
}

function sectionsOf(v) {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  return String(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── پذیرش ───────────────────────────────────────────────────────────────────

/**
 * `/healthz` فقط می‌گوید یک فرایند روی پورت جواب می‌دهد — نسخهٔ قدیمی هم همین
 * را می‌گوید. شاهدِ نسخه اینجاست: کلیدِ `historySections` **فقط** در کدِ هدف
 * وجود دارد؛ نسخهٔ زنده (`6570aaf`) آرایهٔ بخش‌ها را ثابت و چهارتایی دارد و
 * چنین کلیدی در `/debug` منتشر نمی‌کند. پس نبودنِ کلید = نسخهٔ قدیمی، نه
 * «فیلدِ اختیاری».
 *
 * `{}`، فیلدِ مفقود و `written` نامطلوب هر سه **رد** می‌شوند.
 */
export function evaluateDebug(raw, opts = {}) {
  const { expectSections = ["gold", "currency"], phase28Applied = false } = opts;
  const parsed = parseObject(raw);
  if (!parsed.ok) return { ok: false, failures: [`پاسخِ /debug ${parsed.reason}`], summary: null };

  const d = parsed.value;
  const failures = [];

  if (Object.keys(d).length === 0) {
    return { ok: false, failures: ["پاسخِ /debug خالی است ({}) — شاهدِ نسخه نمی‌دهد"], summary: null };
  }

  const hs = d.historySections;
  if (hs === undefined || hs === null || typeof hs !== "object" || Array.isArray(hs)) {
    failures.push(
      "historySections در /debug نیست — یعنی نسخهٔ مستقر کدِ هدف نیست " +
        "(این کلید فقط در کدِ هدف وجود دارد)",
    );
  } else {
    if (!Array.isArray(hs.written) || !hs.written.every((s) => typeof s === "string")) {
      failures.push("historySections.written آرایهٔ رشته نیست");
    } else {
      const got = [...hs.written].sort();
      const want = [...expectSections].sort();
      if (got.join(",") !== want.join(",")) {
        failures.push(`historySections.written = [${got}] ولی انتظار [${want}] بود`);
      }
    }
    if (!Array.isArray(hs.missing)) failures.push("historySections.missing آرایه نیست");
    else if (hs.missing.length) failures.push(`historySections.missing خالی نیست: [${hs.missing}]`);
  }

  // پذیرش همان دو شرطِ پیش‌پرواز را روی نسخهٔ **مستقر** دوباره می‌سنجد: بینِ
  // خواندنِ پرچم‌ها و بالا آمدنِ نسخهٔ تازه، مقدارِ محیط می‌تواند عوض شده باشد.
  // بدونِ phase28 هر دو مسیر به توقفِ دادهٔ بازار می‌رسند، نه فقط enforcement.
  if (typeof d.brsapiLegacy?.enforced !== "boolean") {
    failures.push("brsapiLegacy.enforced در /debug نیست یا boolean نیست");
  } else if (d.brsapiLegacy.enforced === true && !phase28Applied) {
    failures.push("brsapiLegacy.enforced=true روی نسخهٔ مستقر، ولی phase28 اجرا نشده");
  }

  if (typeof d.brsapiClient?.enabled !== "boolean") {
    failures.push("brsapiClient.enabled در /debug نیست یا boolean نیست");
  } else if (d.brsapiClient.enabled === true && !phase28Applied) {
    failures.push(
      "brsapiClient.enabled=true روی نسخهٔ مستقر، ولی phase28 اجرا نشده — " +
        "کلاینتِ مرکزی rpc(brsapi_budget_lease) را صدا می‌زند که وجود ندارد",
    );
  }

  return {
    ok: failures.length === 0,
    failures,
    summary: failures.length
      ? null
      : {
          written: d.historySections.written,
          legacyEnforced: d.brsapiLegacy.enforced,
          clientEnabled: d.brsapiClient.enabled,
        },
  };
}

// ── گزارش ───────────────────────────────────────────────────────────────────

/**
 * «انتشار» و «پذیرش» دو پرسشِ جدا هستند و اینجا جدا جواب داده می‌شوند.
 *
 * نکتهٔ اصلی: **وجودِ زمانِ شروع، اثباتِ انتشار نیست.** زمانِ تلاش پیش از اجرای
 * CLI ثبت می‌شود، پس اگر CLI شکست بخورد همچنان یک timestamp وجود دارد. تنها
 * چیزی که «منتشر شد» را تعیین می‌کند، `outcome` واقعیِ همان گام است.
 */
export function summarize(input) {
  const {
    gateAction,
    gateCode = "",
    publishOutcome = "",
    startedAt = "",
    publishedAt = "",
    acceptance = "",
    rollback = false,
  } = input;

  let publish;
  if (gateAction !== "publish") {
    publish = { state: "not-attempted", text: `انجام نشد — ${gateCode || "دروازه"}` };
  } else if (publishOutcome === "success" && publishedAt) {
    publish = { state: "done", text: `انجام شد در \`${publishedAt}\`` };
  } else {
    publish = {
      state: "failed",
      text: `**شکست خورد** — تلاش از \`${startedAt || "نامشخص"}\``,
    };
  }

  let accept;
  if (publish.state !== "done") accept = { state: "not-attempted", text: "انجام نشد" };
  else if (rollback)
    accept = {
      state: "not-applicable",
      // فقط معیارِ **مخصوصِ نسخهٔ جدید** نامرتبط است. سلامت و تازگیِ داده
      // همچنان باید بررسی شوند — بازگشتِ خاموش هم یک خرابی است.
      text: "بازگشت — معیارِ نسخهٔ هدف اعمال نمی‌شود؛ **سلامت و تازگیِ داده همچنان بررسی شود**",
    };
  else if (["passed", "failed", "pending"].includes(acceptance)) {
    accept = { state: acceptance, text: { passed: "موفق", failed: "**رد شد**", pending: "در انتظار" }[acceptance] };
  } else accept = { state: "pending", text: "در انتظار" };

  return { publish, acceptance: accept };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
// هر زیرفرمان stdin/argv می‌گیرد و برای `$GITHUB_OUTPUT` خط `key=value`
// می‌نویسد. کدِ خروج: 0 تصمیمِ گرفته‌شده، 1 شکستِ دروازه.

import { readFileSync, existsSync } from "node:fs";

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

function emit(pairs) {
  const out = Object.entries(pairs).map(([k, v]) => `${k}=${v}`).join("\n");
  console.log(out);
}

function reportFailures(title, failures) {
  console.error(`::error::${title}`);
  for (const f of failures) console.error(`  · ${f}`);
}

const MAIN = {
  decide() {
    const a = JSON.parse(process.argv[3] ?? "{}");
    const r = decidePublish(a);
    emit({ action: r.action, code: r.code, reason: r.reason });
    // ⚠️ پیام‌ها فقط به stderr: stdoutِ این زیرفرمان مستقیم به
    // `$GITHUB_OUTPUT` می‌رود و هر خطِ بدونِ `key=value` آن فایل را خراب می‌کند.
    if (r.action === "fail") {
      console.error(`::error::دروازهٔ انتشار رد شد — ${r.reason}`);
      process.exit(1);
    }
    console.error(`::notice::${r.action}: ${r.reason}`);
  },
  /**
   * کلِ پیش‌پرواز در یک جا: خواندنِ خروجیِ ذخیره‌شده، کدِ خروج، تشخیص،
   * و بعد اعتبارسنجیِ ساختاری. تشخیص به stderr می‌رود تا stdout فقط
   * `key=value` بماند.
   */
  "probe-cmd"() {
    // فقط خودِ فرمان روی stdout؛ هیچ چیزِ دیگری، چون مستقیم به `-c` می‌رود.
    process.stdout.write(probeCommand());
  },
  preflight() {
    const [, , , rawPath, exitRaw, optsRaw] = process.argv;
    const exitCode = Number(exitRaw);
    const raw = existsSync(rawPath) ? readFileSync(rawPath, "utf8") : "";
    const secrets = [process.env.LIARA_API_TOKEN, process.env.RELAY_TOKEN].filter(Boolean);

    const probe = classifyProbe({ exitCode, raw, secrets });
    if (!probe.ok) {
      console.error(`::error::پیش‌پرواز رد شد (${probe.kind}) — ${probe.summary}`);
      console.error("خروجیِ پاک‌سازی‌شدهٔ دستور:");
      for (const line of (probe.detail || "(خالی)").split("\n")) console.error("  | " + line);
      console.error("انتشار انجام نمی‌شود. پرچمی هم تغییر داده نشد.");
      process.exit(1);
    }

    const r = evaluateFlags(probe.flagsJson, JSON.parse(optsRaw ?? "{}"));
    if (!r.ok) {
      reportFailures("پیش‌پرواز رد شد (bad-flags) — انتشار انجام نمی‌شود", r.failures);
      process.exit(1);
    }
    console.error(`::notice::پیش‌پرواز موفق — node ${r.flags.node}`);
    emit({
      node: r.flags.node,
      effective_sections: r.flags.effectiveSections.join(","),
      debug_reachable: String(r.flags.debugReachable),
    });
  },
  async flags() {
    const opts = JSON.parse(process.argv[3] ?? "{}");
    const r = evaluateFlags(await readStdin(), opts);
    if (!r.ok) {
      reportFailures("پیش‌پرواز رد شد — انتشار انجام نمی‌شود", r.failures);
      process.exit(1);
    }
    emit({
      node: r.flags.node,
      effective_sections: r.flags.effectiveSections.join(","),
      debug_reachable: String(r.flags.debugReachable),
    });
  },
  async accept() {
    const opts = JSON.parse(process.argv[3] ?? "{}");
    const r = evaluateDebug(await readStdin(), opts);
    if (!r.ok) {
      reportFailures("پذیرش رد شد", r.failures);
      process.exit(1);
    }
    console.log(`::notice::پذیرش: written=[${r.summary.written}] enforced=${r.summary.legacyEnforced}`);
  },
  report() {
    // ورودی از محیط می‌آید، نه از یک JSONِ ساخته‌شده در YAML: زنجیرهٔ
    // format/fromJSON در workflow با هر نقل‌قول یا کاراکترِ فارسی می‌شکست.
    const e = process.env;
    const a = {
      gateAction: e.GATE_ACTION || "",
      gateCode: e.GATE_CODE || "",
      gateReason: e.GATE_REASON || "",
      sha: e.SHA || "",
      gateSha: e.GATE_SHA || "",
      baseline: e.BASELINE || "",
      startedAt: e.STARTED_AT || "",
      publishedAt: e.PUBLISHED_AT || "",
      publishOutcome: e.PUBLISH_OUTCOME || "",
      release: e.RELEASE || "",
      acceptance: e.ACCEPTANCE || "",
      rollback: e.GATE_CODE === "rollback",
    };
    const r = summarize(a);
    const cell = (v) => (v ? `\`${v}\`` : "—");
    const rows = [
      ["تصمیمِ دروازه", `${cell(a.gateAction)} (${a.gateCode || "—"}) — ${a.gateReason || "—"}`],
      ["SHAِ منتشرشونده", cell(a.sha)],
      ["SHAِ منطقِ دروازه", cell(a.gateSha)],
      ["مبنای قبلی", cell(a.baseline)],
      ["**انتشار**", r.publish.text],
      ["release", cell(a.release)],
      ["**پذیرش**", r.acceptance.text],
    ];
    console.log("| مورد | مقدار |");
    console.log("|---|---|");
    for (const [k, v] of rows) console.log(`| ${k} | ${v} |`);
  },
  sha() {
    const v = validateShaInput(process.argv[3]);
    if (!v.ok) {
      console.error(`::error::SHA نامعتبر — ${v.reason}`);
      process.exit(1);
    }
    emit({ sha_input: v.value });
  },
  resolved() {
    const v = validateResolvedSha(process.argv[3]);
    if (!v.ok) {
      console.error(`::error::SHAِ resolve‌شده نامعتبر — ${v.reason}`);
      process.exit(1);
    }
    emit({ sha: v.value, short: v.value.slice(0, 7) });
  },
};

if (process.argv[1] && process.argv[1].endsWith("relay-gate.mjs")) {
  const cmd = process.argv[2];
  if (!MAIN[cmd]) {
    console.error(`usage: relay-gate.mjs <${Object.keys(MAIN).join("|")}> [json]`);
    process.exit(2);
  }
  await MAIN[cmd]();
}
