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

// ── ادعای «زنده/لحظه‌ای» در تیترها ──────────────────────────────────────────
//
// چرا این گارد وجود دارد: `P2-MANUS-MEGA-002` همهٔ «لحظه‌ای»ها را از مسیرهای
// عمومی برداشت، ولی **تیترها را جا انداخت**. نتیجه یک صفحهٔ متناقض بود:
//
//     <h2>بازار، همین حالا — زنده</h2>
//     <span>آخرین وضعیت بازار</span>  ← همین PR این را درست کرده بود
//     <span>به‌روزرسانی: ۷ دقیقه پیش</span>
//
// تیترِ درشت ادعای real-time می‌کرد و دو خط پایین‌تر خودش تکذیبش می‌کرد. همین
// الگو در `/market/stocks` هم بود: `<h1>تابلوی زندهٔ بازار سهام</h1>` در حالی
// که `metadata.title` همان PR «تابلوی بازار سهام» شده بود.
//
// دادهٔ این صفحات snapshot است، نه جریانِ زنده. تیتر بلندترین ادعای صفحه است و
// کاربر معمولاً فقط همان را می‌خواند.
//
// دامنه عمداً محدود است به `components/landing` و `components/market` — یعنی
// همان سطحِ عمومیِ بازار. `components/symbol` و داشبورد بیرون‌اند چون آنجا
// دادهٔ واقعاً زنده از رله می‌آید و ادعا درست است.
const REALTIME_CLAIMS = ["زنده", "زندهٔ", "لحظه‌ای", "لحظه ای"];
const HEADING_DIRS = [join("components", "landing"), join("components", "market")];

test("قرارداد واژگان: هیچ تیتری در سطح عمومیِ بازار ادعای «زنده/لحظه‌ای» نمی‌کند", () => {
  const offenders: string[] = [];
  for (const dir of HEADING_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      const src = readFileSync(file, "utf8");
      // متنِ داخلِ <h1>…</h1> تا <h4>…</h4>، شاملِ حالتِ چندخطی.
      for (const m of src.matchAll(/<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/g)) {
        const text = m[2];
        if (!REALTIME_CLAIMS.some((w) => text.includes(w))) continue;
        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(`${file.replace(ROOT + "/", "")}:${line}: ${text.trim().slice(0, 80)}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `تیتر با ادعای real-time روی دادهٔ snapshot:\n${offenders.join("\n")}`
  );
});
