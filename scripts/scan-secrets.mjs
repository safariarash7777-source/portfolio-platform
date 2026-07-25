#!/usr/bin/env node
/**
 * اسکنِ الگوی سکرت — بدونِ هیچ وابستگی و بدونِ هیچ سرویسِ بیرونی.
 *
 * هدف: جلوگیری از commit شدنِ یک کلید/توکنِ واقعی. این ابزار جای بازبینیِ انسانی
 * را نمی‌گیرد و مدعیِ کشفِ همه‌چیز نیست؛ الگوهای پرتکرار و پرخطر را می‌گیرد.
 *
 *   node scripts/scan-secrets.mjs           # کلِ فایل‌های ردیابی‌شدهٔ گیت
 *   node scripts/scan-secrets.mjs --staged  # فقط فایل‌های staged
 *
 * خروج ۰ = تمیز · خروج ۱ = یافته · خروج ۲ = خطای اجرا
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const RULES = [
  { id: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, what: "توکنِ JWT (کلیدِ Supabase؟)" },
  { id: "supabase-key", re: /\bsb_(secret|publishable)_[A-Za-z0-9_-]{20,}/, what: "کلیدِ Supabase" },
  { id: "telegram-bot", re: /\b\d{8,10}:AA[A-Za-z0-9_-]{32,}/, what: "توکنِ باتِ تلگرام" },
  { id: "openai", re: /\bsk-[A-Za-z0-9]{32,}/, what: "کلیدِ OpenAI" },
  { id: "github-pat", re: /\bgh[pousr]_[A-Za-z0-9]{36,}/, what: "توکنِ گیت‌هاب" },
  { id: "aws-akid", re: /\bAKIA[0-9A-Z]{16}\b/, what: "کلیدِ دسترسیِ AWS" },
  { id: "private-key", re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/, what: "کلیدِ خصوصی" },
  { id: "db-url", re: /\b(postgres(ql)?|mysql|mongodb(\+srv)?):\/\/[^\s:@/]+:[^\s@/]{6,}@/, what: "رشتهٔ اتصالِ دیتابیس با رمز" },
  // انتسابِ یک مقدارِ واقعی به متغیرِ محیطیِ حساس (نه خالی، نه placeholder).
  // lookaheadِ منفی، *خواندنِ* متغیر را رد می‌کند: `const K = process.env.K || ""`
  // یک نشت نیست — الگوی درستِ کد است.
  {
    id: "env-assign",
    re: /\b(SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|CRON_SECRET|PLATFORM_WEBHOOK_SECRET|LEADS_WEBHOOK_SECRET|TELEGRAM_BOT_TOKEN|TELEGRAM_WEBHOOK_SECRET|ZARINPAL_MERCHANT_ID|RESEND_API_KEY|BRSAPI_KEY|RELAY_TOKEN|IR_MARKET_RELAY_TOKEN|ADMIN_SECRET|JWT_SECRET)\s*[=:]\s*(?!process\.env|import\.meta|Deno\.env|os\.environ|getenv|env\.|env\[|\$\{|\$\(|["'`]?\s*(process\.env|\$))["'`]?[A-Za-z0-9_\-./+]{12,}/,
    what: "انتسابِ مقدار به متغیرِ محیطیِ حساس",
  },
];

/** placeholderهای آشکار — نمونه‌های مستنداتی نباید build را قرمز کنند. */
const PLACEHOLDER =
  /(your[-_]?|example|placeholder|changeme|change-me|xxxx|<[^>]+>|\.\.\.|123456:ABC|user:password|dummy|sample|redacted|\bTODO\b)/i;

const SKIP_PATH =
  /(^|\/)(node_modules|\.next|out|build|dist|coverage)\/|\.(png|jpe?g|gif|webp|avif|ico|svg|woff2?|ttf|eot|pdf|zip|gz|mp4|lock)$|package-lock\.json$/;

function gitFiles(stagedOnly) {
  const args = stagedOnly
    ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]
    : ["ls-files"];
  return execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);
}

const stagedOnly = process.argv.includes("--staged");
let scanned = 0;
const findings = [];

for (const file of gitFiles(stagedOnly)) {
  if (SKIP_PATH.test(file)) continue;
  let text;
  try {
    if (statSync(file).size > 2_000_000) continue;
    text = readFileSync(file, "utf8");
  } catch {
    continue; // حذف‌شده یا باینری
  }
  if (text.includes("\u0000")) continue; // باینری
  scanned += 1;

  text.split("\n").forEach((line, i) => {
    // خطی که خودش قاعده را تعریف می‌کند، یافته نیست.
    if (file === "scripts/scan-secrets.mjs") return;
    if (PLACEHOLDER.test(line)) return;
    for (const rule of RULES) {
      if (rule.re.test(line)) {
        findings.push({ file, line: i + 1, rule: rule.id, what: rule.what });
        break;
      }
    }
  });
}

console.log(`اسکنِ سکرت: ${scanned} فایل بررسی شد${stagedOnly ? " (staged)" : ""}.`);

if (findings.length === 0) {
  console.log("✅ هیچ الگوی سکرتی پیدا نشد.");
  process.exit(0);
}

console.error(`\n❌ ${findings.length} یافتهٔ احتمالی:\n`);
for (const f of findings) {
  // خودِ مقدار هرگز چاپ نمی‌شود — فقط محل و نوع.
  console.error(`  ${f.file}:${f.line} — ${f.what} [${f.rule}]`);
}
console.error(
  "\nاگر یافته‌ای مثبتِ کاذب است، الگو را در scripts/scan-secrets.mjs دقیق‌تر کن؛" +
    "\nقاعده را حذف نکن. اگر واقعی است: سکرت را **بچرخان**، پاک‌کردنِ فایل کافی نیست."
);
process.exit(1);
