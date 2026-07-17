// تست قرارداد واژگان — ابرتسک «پاک‌سازی و تثبیت» C1
// کل app/ و components/ را اسکن می‌کند و «کاربرد مثبت» واژه‌های ممنوع را fail می‌کند.
// واژه‌های ممنوع در UI زنده: «توصیه» و «سیگنال» (به‌عنوان توصیف خدمت/خروجی پلتفرم).
// allowlist صریح: جمله‌های نفی‌دار/سلب مسئولیت (…نیست، بدونِ…، هیچ…) و کامنت‌های کد.
import { strict as assert } from "node:assert";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd());
const SCAN_DIRS = ["app", "components"];
const FORBIDDEN = ["توصیه", "سیگنال"];

// الگوهای نفی/سلب مسئولیت که کاربردشان مجاز است (نفی‌دار — نه توصیفِ مثبتِ خدمت)
const ALLOW_PATTERNS: RegExp[] = [
  // «…توصیهٔ خرید یا فروش نیست/نیستند/محسوب نمی‌شوند/وجود ندارد»
  /توصیه[^\n.؛!?]{0,80}(نیست|نیستند|نمی‌شو|نمی شود|وجود ندارد|ندارد)/,
  // «به هیچ وجه «توصیه به خرید یا فروش» …» (سلب مسئولیت حقوقی)
  /هیچ\s*وجه\s*[«"]?توصیه/,
  // «بدونِ توصیه / بدون توصیهٔ خرید/فروش» و «بدونِ سیگنالِ مستقیم»
  /بدون[ِ\s]+(توصیه|سیگنال)/,
  // «هیچ توصیه‌ای …» / «هیچ‌کدام … توصیهٔ …» (در ادامهٔ جمله نفی می‌آید)
  /هیچ[‌\s-]*(کدام|گونه)?[^\n]{0,80}توصیه/,
  // «هیچ واژهٔ سیگنالی» (قانون داخلی در کامنت/متن)
  /واژ[هٔ‌ه\s]*سیگنالی/,
  // «نه توصیه» («سنجش قاعده‌پذیری، نه توصیه»)
  /نه\s+توصیه/,
  // «سیگنال‌فروشی نیست/نداریم» و ترکیب‌های نفی‌دار سیگنال
  /سیگنال[^\n.؛!?]{0,60}(نیست|نیستند|نداریم|نمی‌دهیم)/,
];

function isCodeComment(line: string): boolean {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("{/*");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      walk(p, out);
    } else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)) {
      out.push(p);
    }
  }
  return out;
}

test("قرارداد واژگان: هیچ کاربرد مثبت «توصیه/سیگنال» در UI زنده نیست", () => {
  const offenders: string[] = [];
  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!FORBIDDEN.some((w) => line.includes(w))) return;
        if (isCodeComment(line)) return; // کامنت کد — مجاز
        // متن JSX چندخطی: جمله ممکن است در خط بعد نفی شود — خط فعلی + خط بعد را با هم بسنج
        const joined = `${line} ${(lines[i + 1] ?? "").trim()}`;
        if (ALLOW_PATTERNS.some((re) => re.test(line) || re.test(joined))) return; // نفی/سلب مسئولیت — مجاز
        offenders.push(`${file.replace(ROOT + "/", "")}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `کاربرد مثبت واژهٔ ممنوع پیدا شد:\n${offenders.join("\n")}`
  );
});
