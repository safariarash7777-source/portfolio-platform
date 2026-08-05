import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * هم‌ترازیِ دو ابزارِ بکاپ — نسخهٔ Bash و نسخهٔ PowerShell.
 *
 * ── چرا این فایل وجود دارد ──────────────────────────────────────────────────
 * آرش از ویندوز استفاده می‌کند، ولی نسخهٔ Bash هم برای CI و لینوکس می‌ماند.
 * دو اسکریپت یعنی دو جا برای فراموش‌کردنِ یک گارد. خطرِ واقعی این نیست که
 * نسخهٔ ویندوزی کار نکند — آن را کاربر فوراً می‌فهمد. خطر این است که **کار
 * کند ولی یک گاردِ ایمنی نداشته باشد**: مثلاً بکاپ را داخلِ ریپو بنویسد، یا
 * «موفق» اعلام کند بدونِ آنکه بازگردانی را آزموده باشد.
 *
 * پس هر قابلیتِ ایمنی باید در **هر دو** فایل پیدا شود. اگر کسی یکی را عوض کند
 * و دیگری را نه، این تست قرمز می‌شود و می‌گوید کدام فایل کدام گارد را ندارد.
 *
 * ⚠️ این تستِ **ایستا** است: وجودِ الگو را می‌سنجد، نه اجرای واقعی را. اجرای
 * واقعی به Docker و اتصال به Production نیاز دارد و جای آن اینجا نیست.
 */

const ROOT = process.cwd();
const BASH = join(ROOT, "scripts", "backup-production.sh");
const PS1 = join(ROOT, "scripts", "backup-production.ps1");

const bash = existsSync(BASH) ? readFileSync(BASH, "utf8") : "";
const ps1 = existsSync(PS1) ? readFileSync(PS1, "utf8") : "";

test("هر دو نسخهٔ ابزارِ بکاپ وجود دارند", () => {
  assert.ok(bash.length > 0, "scripts/backup-production.sh پیدا نشد");
  assert.ok(ps1.length > 0, "scripts/backup-production.ps1 پیدا نشد");
});

/**
 * هر قابلیت با یک الگو برای هر زبان. اگر الگویی پیدا نشود یعنی یا گارد حذف
 * شده یا طوری بازنویسی شده که دیگر قابلِ تشخیص نیست — هر دو باید دیده شوند.
 */
const CAPABILITIES: Array<{ name: string; bash: RegExp; ps1: RegExp }> = [
  {
    name: "مقصدِ داخلِ مخزنِ گیت رد می‌شود",
    bash: /git -C .*rev-parse --git-dir/,
    ps1: /Test-Path \(Join-Path .*'\.git'\)/,
  },
  {
    name: "نصب‌بودن و اجرا‌بودنِ Docker بررسی می‌شود",
    bash: /command -v docker[\s\S]*docker info/,
    ps1: /Get-Command docker[\s\S]*docker info/,
  },
  {
    name: "اگر Supabase CLI نبود، مسیرِ npx پیشنهاد/استفاده می‌شود",
    bash: /npx/,
    ps1: /npx/,
  },
  {
    name: "رشتهٔ اتصال مخفی گرفته می‌شود (روی صفحه نمایش داده نمی‌شود)",
    bash: /read -rs/,
    ps1: /Read-Host[^\n]*-AsSecureString/,
  },
  {
    name: "هر سه فایلِ رسمی ساخته می‌شود",
    bash: /--role-only[\s\S]*--data-only/,
    ps1: /--role-only[\s\S]*--data-only/,
  },
  {
    name: "فایلِ خالی/ناقص رد می‌شود",
    bash: /خالی است/,
    ps1: /خالی است/,
  },
  {
    name: "بازگردانی در یک Postgresِ یک‌بارمصرف آزموده می‌شود",
    bash: /docker run -d --name/,
    ps1: /docker run -d --name/,
  },
  {
    name: "شمارشِ بازگردانده‌شده با Production مقایسه می‌شود",
    bash: /MISMATCH/,
    ps1: /\$mismatch/,
  },
  {
    name: "اختلاف در شمارش باعث شکست می‌شود",
    bash: /die "بکاپ ساخته شد ولی/,
    ps1: /Fail "بکاپ ساخته شد ولی/,
  },
  {
    name: "SHA-256 و اندازهٔ فایل‌ها ثبت می‌شود",
    bash: /sha256sum/,
    ps1: /Get-FileHash[^\n]*SHA256/,
  },
  {
    name: "MANIFEST تولید می‌شود",
    bash: /MANIFEST\.txt/,
    ps1: /MANIFEST\.txt/,
  },
  {
    name: "کانتینرِ موقت در پایان پاک می‌شود",
    bash: /docker rm -f/,
    ps1: /docker rm -f/,
  },
  {
    name: "شمارشِ مرجع از خودِ دیتابیس خوانده می‌شود، نه هاردکد",
    bash: /expected-counts\.txt/,
    ps1: /expected-counts\.txt/,
  },
];

test("هر گاردِ ایمنی در هر دو نسخه وجود دارد", () => {
  const missing: string[] = [];
  for (const cap of CAPABILITIES) {
    if (!cap.bash.test(bash)) missing.push(`backup-production.sh — ${cap.name}`);
    if (!cap.ps1.test(ps1)) missing.push(`backup-production.ps1 — ${cap.name}`);
  }
  assert.deepEqual(missing, [], `گاردِ گمشده:\n${missing.join("\n")}`);
});

test("فهرستِ گاردها پوچ نیست", () => {
  // اگر روزی کسی CAPABILITIES را خالی کند، تستِ بالا بی‌صدا سبز می‌شود.
  assert.ok(CAPABILITIES.length >= 12, `فقط ${CAPABILITIES.length} گارد سنجیده می‌شود`);
});

// ── هیچ سکرتی داخلِ خودِ اسکریپت‌ها ─────────────────────────────────────────

test("هیچ‌کدام از اسکریپت‌ها رشتهٔ اتصال یا رمزِ درون‌خطی ندارند", () => {
  // الگو در زمانِ اجرا ساخته می‌شود تا خودِ این فایل شبیهِ سکرت به‌نظر نرسد و
  // اسکنرِ سکرت روی تستِ خودمان گیر نکند — درسی که یک بار گرفتیم.
  const scheme = ["postgres", "postgresql"].join("|");
  const inlineConn = new RegExp(`(${scheme})://[^\\s:@/]+:[^\\s@/]{4,}@`);
  for (const [name, src] of [["sh", bash], ["ps1", ps1]] as const) {
    assert.doesNotMatch(src, inlineConn, `${name}: رشتهٔ اتصالِ درون‌خطی`);
    assert.doesNotMatch(src, /\bsbp_[A-Za-z0-9]{20,}/, `${name}: توکنِ Supabase`);
    assert.doesNotMatch(src, /\beyJ[A-Za-z0-9_-]{10,}\./, `${name}: JWT`);
  }
});

test("رشتهٔ اتصال چاپ یا در فایل نوشته نمی‌شود", () => {
  // هیچ‌کدام نباید مقدارِ متغیرِ اتصال را echo/Write کنند.
  assert.doesNotMatch(bash, /echo\s+"?\$DB_URL/, "sh: رشتهٔ اتصال چاپ می‌شود");
  assert.doesNotMatch(ps1, /Write-(Host|Output)\s+\$env:DB_URL/, "ps1: رشتهٔ اتصال چاپ می‌شود");
  assert.doesNotMatch(ps1, /Write-(Host|Output)\s+\$plain/, "ps1: رشتهٔ اتصال چاپ می‌شود");
});

test("نسخهٔ ویندوزی رشتهٔ اتصال را از محیط پاک می‌کند", () => {
  assert.match(ps1, /Remove-Item Env:\\DB_URL/, "ps1: DB_URL از محیطِ پروسه پاک نمی‌شود");
});

test("هر دو نسخه دربارهٔ دیده‌شدن در فهرستِ پروسه‌ها صادق‌اند", () => {
  // این محدودیت واقعی است و پنهان‌کردنش بدتر از خودِ محدودیت است.
  assert.match(bash, /ps\b/, "sh: هشدارِ فهرستِ پروسه‌ها نیست");
  assert.match(ps1, /پروسه/, "ps1: هشدارِ فهرستِ پروسه‌ها نیست");
});

// ── MANIFEST فقط چیزهای بی‌خطر دارد ────────────────────────────────────────

test("MANIFEST فقط تاریخ، پروژه، اندازه و هش دارد", () => {
  for (const [name, src] of [["sh", bash], ["ps1", ps1]] as const) {
    const hasSafeFields =
      /backup taken/.test(src) && /project:/.test(src) && /sha256=/.test(src) && /bytes/.test(src);
    assert.ok(hasSafeFields, `${name}: MANIFEST فیلدهای مورد انتظار را ندارد`);
    // هیچ فیلدِ حساسی نباید واردِ MANIFEST شود.
    assert.doesNotMatch(src, /MANIFEST[\s\S]{0,400}DB_URL/, `${name}: DB_URL نزدیکِ MANIFEST`);
  }
});

// ── .gitignore لایهٔ دوم است ────────────────────────────────────────────────

test(".gitignore ورودِ فایل‌های بکاپ به مخزن را می‌بندد", () => {
  const gitignore = readFileSync(join(ROOT, ".gitignore"), "utf8");
  for (const pattern of ["roles.sql", "schema.sql", "data.sql", "supabase-backups/"]) {
    assert.ok(
      gitignore.split("\n").some((l) => l.trim() === pattern),
      `.gitignore الگوی «${pattern}» را ندارد`
    );
  }
});

test("هیچ فایلِ بکاپی داخلِ مخزن نیست", () => {
  for (const f of ["roles.sql", "schema.sql", "data.sql"]) {
    assert.ok(!existsSync(join(ROOT, f)), `${f} داخلِ ریشهٔ مخزن پیدا شد`);
  }
});
