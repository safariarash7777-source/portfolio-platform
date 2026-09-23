import test, { describe } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * قراردادِ اجرایی و هم‌ترازیِ دو ابزارِ بکاپ.
 *
 * ── چرا این فایل وجود دارد ──────────────────────────────────────────────────
 *
 * آرش از **Windows PowerShell 5.1** استفاده می‌کند. خطرِ واقعی این نیست که
 * نسخهٔ ویندوزی کار نکند — آن را فوراً می‌فهمد. دو خطرِ ساکت‌تر هست:
 *
 *   ۱. اسکریپت اصلاً **Parse نشود** و خطاهایی بدهد که به خطوطِ بی‌گناه اشاره
 *      می‌کنند. این یک بار واقعاً اتفاق افتاد: فایل UTF-8 بدونِ BOM بود و
 *      PowerShell 5.1 آن را با code pageِ سیستم خواند.
 *   ۲. اسکریپت کار کند ولی یک **گاردِ ایمنی** نداشته باشد — بکاپ را داخلِ
 *      ریپو بنویسد، یا «موفق» بگوید بدونِ آنکه بازگردانی را آزموده باشد.
 *
 * ⚠️ محدودیتِ صادقانه: این تستِ **ایستا** است. رفتارِ واقعیِ ماشینِ
 * راستی‌آزمایی در `lib/ops/backup-restore.integration.test.ts` روی Postgresِ
 * واقعی اجرا می‌شود. هیچ‌کدام از این دو فایل ثابت نمی‌کند یک بکاپِ واقعیِ
 * Production قابلِ بازگردانی است — آن فقط با اجرای واقعی معلوم می‌شود.
 */

const ROOT = process.cwd();
const BASH = join(ROOT, "scripts", "backup-production.sh");
const PS1 = join(ROOT, "scripts", "backup-production.ps1");
const INVENTORY = join(ROOT, "scripts", "backup", "inventory.sql");
const COMPARE = join(ROOT, "scripts", "backup", "compare.mjs");
const ASSERT_SCHEMAS = join(ROOT, "scripts", "backup", "assert-managed-schemas.sql");

const bash = existsSync(BASH) ? readFileSync(BASH, "utf8") : "";
const ps1Bytes = existsSync(PS1) ? readFileSync(PS1) : Buffer.alloc(0);
const ps1 = ps1Bytes.toString("utf8").replace(/^﻿/, "");
const inventory = existsSync(INVENTORY) ? readFileSync(INVENTORY, "utf8") : "";
const compare = existsSync(COMPARE) ? readFileSync(COMPARE, "utf8") : "";

/**
 * خطوطِ **اجرایی**، بدونِ کامنت.
 *
 * ادعای «این الگو در فایل نیست» باید روی کد سنجیده شود، نه روی توضیح. این
 * فایل‌ها عمداً توضیح می‌دهند که *چرا* الگوی قدیمی غلط بود، پس خودِ الگو در
 * متنِ توضیحی هست. اولین نسخهٔ این تست همین را با کد اشتباه گرفت و چهار
 * ادعای درست را قرمز کرد.
 */
function stripHash(text: string): string {
  return text
    .replace(/<#[\s\S]*?#>/g, "")
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

function stripSqlComments(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
}

const bashCode = stripHash(bash);
const ps1Code = stripHash(ps1);
const inventoryCode = stripSqlComments(inventory);

test("همهٔ اجزای ابزارِ بکاپ وجود دارند", () => {
  assert.ok(bash.length > 0, "scripts/backup-production.sh پیدا نشد");
  assert.ok(ps1.length > 0, "scripts/backup-production.ps1 پیدا نشد");
  assert.ok(inventory.length > 0, "scripts/backup/inventory.sql پیدا نشد");
  assert.ok(compare.length > 0, "scripts/backup/compare.mjs پیدا نشد");
  assert.ok(existsSync(ASSERT_SCHEMAS), "scripts/backup/assert-managed-schemas.sql پیدا نشد");
});

// ── ۱. قراردادِ اجرا روی Windows PowerShell 5.1 ─────────────────────────────

describe("قراردادِ Windows PowerShell 5.1", () => {
  test("فایل BOM دارد", () => {
    // بدونِ BOM، PowerShell 5.1 فایلِ UTF-8 را با code pageِ ANSIِ سیستم
    // می‌خواند. این تنها راهِ قابلِ اتکا برای گفتنِ «این فایل UTF-8 است».
    assert.deepEqual(
      Array.from(ps1Bytes.subarray(0, 3)),
      [0xef, 0xbb, 0xbf],
      "scripts/backup-production.ps1 باید با BOMِ UTF-8 ذخیره شود"
    );
  });

  test("هیچ بایتِ غیرِ ASCII در فایل نیست", () => {
    // لایهٔ دومِ محافظت: حتی اگر BOM جایی گم شود، فایلی که فقط ASCII دارد
    // زیرِ هر code pageی یکسان Parse می‌شود. متنِ فارسی در runbook است.
    const offenders: string[] = [];
    ps1.split("\n").forEach((line, index) => {
      const bad = Array.from(line).filter((ch) => ch.charCodeAt(0) > 127);
      if (bad.length) offenders.push(`خط ${index + 1}: ${bad.join("")}`);
    });
    assert.deepEqual(offenders, [], `کاراکترِ غیرِ ASCII در .ps1:\n${offenders.join("\n")}`);
  });

  /**
   * نحوِ مخصوصِ PowerShell 7 روی 5.1 **خطای Parse** می‌دهد، نه خطای زمانِ
   * اجرا — یعنی کلِ فایل پیش از اجرای خطِ اول می‌شکند.
   */
  const PS7_ONLY: Array<{ name: string; pattern: RegExp }> = [
    { name: "عملگرِ زنجیرهٔ && یا ||", pattern: /(^|\s)(&&|\|\|)(\s|$)/m },
    { name: "عملگرِ ??", pattern: /\?\?/ },
    { name: "عملگرِ سه‌تایی ? :", pattern: /\)\s*\?\s*[^\s]+\s*:\s*/ },
    { name: "دسترسیِ ایمن ?.", pattern: /\$\w+\?\./ },
    { name: "ForEach-Object -Parallel", pattern: /-Parallel\b/ },
    { name: "Join-String", pattern: /\bJoin-String\b/ },
    { name: "$IsWindows / $IsLinux", pattern: /\$Is(Windows|Linux|MacOS)\b/ },
    { name: "ConvertFrom-Json -AsHashtable", pattern: /-AsHashtable\b/ },
    { name: "Get-Error", pattern: /\bGet-Error\b/ },
  ];

  for (const { name, pattern } of PS7_ONLY) {
    test(`نحوِ مخصوصِ PowerShell 7 استفاده نشده: ${name}`, () => {
      assert.doesNotMatch(ps1Code, pattern, `${name} روی PowerShell 5.1 Parse نمی‌شود`);
    });
  }

  test("آرگومانِ nativeِ خالی فرستاده نمی‌شود", () => {
    // PowerShell 5.1 ممکن است آرگومانِ خالی را حذف کند و آرگومانِ بعدی جای
    // آن بنشیند. نسخهٔ قبل همیشه `-c $pre` می‌فرستاد که برای roles/schema
    // تهی بود، و `-f` می‌توانست بشود مقدارِ `-c`.
    assert.doesNotMatch(ps1Code, /-c\s+""/);
    assert.doesNotMatch(ps1Code, /-c\s+\$pre\b/);
    // `--command` باید دقیقاً یک بار بیاید: مرحلهٔ data.
    const commandCount = (ps1Code.match(/--command/g) ?? []).length;
    assert.equal(commandCount, 1, "--command باید فقط برای مرحلهٔ data باشد");
  });

  test("هیچ نقل‌قولِ دوتایی در آرگومانِ دستورِ native نیست (Windows PowerShell 5.1)", () => {
    // PS 5.1 نقل‌قولِ دوتاییِ درونِ آرگومان را escape نمی‌کند؛ '-c "SELECT 1"'
    // در docker دو تکه شد و psql فقط `-c SELECT` گرفت. با PowerShell 7.4 و
    // $PSNativeCommandArgumentPassing='Legacy' بازتولید شد.
    const calls = [...ps1Code.matchAll(/(?:-PsqlArgs|Invoke-InDb)\s*\(?\s*'((?:[^']|'')*)'/g)].map((m) => m[1]);
    assert.ok(calls.length >= 5, `فراخوانی‌ها پیدا نشد (${calls.length})`);
    for (const c of calls) assert.equal(c.includes('"'), false, `نقل‌قولِ دوتایی: ${c}`);
    assert.match(ps1Code, /\$PsqlArgs\.Contains\('"'\)/, "نگهبانِ زمانِ اجرا در Invoke-PsqlWithUrl");
    assert.match(ps1Code, /\$Command\.Contains\('"'\)/, "نگهبانِ زمانِ اجرا در Invoke-InDb");
  });

  test("متن بدونِ BOM نوشته می‌شود و خروجیِ native از pipeline به فایل نمی‌رود", () => {
    // Set-Content -Encoding UTF8 در PS 5.1 BOM می‌گذارد؛ `| Set-Content` خروجیِ psql را
    // با کدپیجِ کنسول دوباره کد می‌کند؛ `*>` در 5.1 فایلِ UTF-16 می‌سازد.
    assert.doesNotMatch(ps1Code, /Set-Content[^\n]*-Encoding\s+UTF8/i);
    assert.doesNotMatch(ps1Code, /\|\s*Set-Content/);
    assert.doesNotMatch(ps1Code, /\|\s*Out-File/);
    assert.doesNotMatch(ps1Code, /\*>/);
    assert.match(ps1Code, /UTF8Encoding\(\$false\)/);
  });

  test("بازگردانی فقط پس از بررسیِ پورتِ عمومی و داخلِ کانتینرِ db با supabase_admin", () => {
    for (const [label, code] of [["bash", bashCode], ["ps1", ps1Code]] as const) {
      // `-a`: یک کانتینرِ متوقف‌شده هم جزوِ این اجرا است و باید دیده شود.
      const gate = code.search(/docker ps (-a )?--filter/);
      const restore = code.indexOf("SET session_replication_role = replica");
      assert.ok(gate > 0 && restore > gate, `${label}: بررسیِ پورت باید پیش از بازگردانی باشد`);
      assert.match(code, /0\\\.0\\\.0\\\.0/, `${label}: الگوی 0.0.0.0`);
      assert.match(code, /-U supabase_admin/, `${label}: supabase_admin`);
      assert.match(code, /docker exec/, `${label}: docker exec`);
      assert.doesNotMatch(code, /--network host/, `${label}: --network host نباید باشد`);
    }
  });

  test("روی ویندوز npx.cmd انتخاب می‌شود، نه npx", () => {
    // `npx` می‌تواند به `npx.ps1` resolve شود که به‌عنوانِ دستورِ native
    // اجرا نمی‌شود و خطای گیج‌کننده می‌دهد.
    assert.match(ps1Code, /npx\.cmd/);
    assert.doesNotMatch(ps1Code, /Test-Command\s+'npx'/);
  });

  test("خطوطِ فارسیِ ورودی از طریقِ pipe به پروسهٔ native نمی‌روند", () => {
    // در PowerShell 5.1 مقدارِ پیش‌فرضِ $OutputEncoding برابرِ ASCII است، پس
    // pipe کردنِ inventory.sql (که کامنتِ فارسی دارد) آن را خراب می‌کرد.
    // فایل باید mount شود، نه pipe.
    assert.doesNotMatch(ps1Code, /Get-Content[^\n]*\$InventorySql\s*\|/);
    assert.match(ps1Code, /-f \/sql\/inventory\.sql/);
  });
});

// ── ۲. بازگردانیِ اتمیک و حساس به خطا ───────────────────────────────────────

describe("بازگردانی بر پایهٔ کدِ خروجی", () => {
  const RESTORE: Array<{ name: string; bash: RegExp; ps1: RegExp }> = [
    {
      name: "یک تراکنش",
      bash: /--single-transaction/,
      ps1: /--single-transaction/,
    },
    {
      name: "ON_ERROR_STOP=1",
      bash: /--variable ON_ERROR_STOP=1/,
      ps1: /--variable ON_ERROR_STOP=1/,
    },
    {
      name: "ترتیبِ رسمی roles → schema → replica → data",
      bash: /roles\.sql[\s\S]{0,200}schema\.sql[\s\S]{0,200}session_replication_role = replica[\s\S]{0,200}data\.sql/,
      ps1: /roles\.sql[\s\S]{0,200}schema\.sql[\s\S]{0,200}session_replication_role = replica[\s\S]{0,200}data\.sql/,
    },
    {
      name: "کدِ خروجی خوانده و بررسی می‌شود",
      bash: /RESTORE_RC=\$\?[\s\S]{0,200}if \[ "\$RESTORE_RC" -ne 0 \]/,
      ps1: /\$restoreExit = \$LASTEXITCODE[\s\S]{0,120}if \(\$restoreExit -ne 0\)/,
    },
  ];

  for (const { name, bash: b, ps1: p } of RESTORE) {
    test(`bash — ${name}`, () => assert.match(bash, b));
    test(`powershell — ${name}`, () => assert.match(ps1, p));
  }

  test("کدِ خروجیِ بازگردانی با || true بلعیده نمی‌شود", () => {
    // نسخهٔ قبل دقیقاً همین کار را می‌کرد و بعد در لاگ دنبالِ `^ERROR`
    // می‌گشت — الگویی که خطاهای فایل‌محورِ psql هرگز با آن شروع نمی‌شوند.
    for (const [label, text, marker] of [
      ["bash", bash, 'in_db "--single-transaction'],
      ["ps1", ps1, "Invoke-InDb ('--single-transaction"],
    ] as const) {
      const at = text.indexOf(marker);
      assert.ok(at > 0, `${label}: بلوکِ بازگردانی پیدا نشد — آزمون نباید بی‌صدا تهی شود`);
      const block = text.slice(at, at + 400);
      assert.doesNotMatch(block, /\|\|\s*true/, `${label}: کدِ خروجی بلعیده می‌شود`);
      assert.match(text.slice(at, at + 900), /RESTORE_RC=\$\?|\$restoreExit = \$LASTEXITCODE/, `${label}: کدِ خروجی ثبت نمی‌شود`);
    }
    assert.doesNotMatch(bashCode, /ON_ERROR_STOP=0/);
  });

  test("موفقیت با grep روی لاگ سنجیده نمی‌شود", () => {
    for (const [label, text] of [["bash", bash], ["ps1", ps1]] as const) {
      assert.doesNotMatch(stripHash(text), /grep -ci? '\^ERROR'/, `${label} هنوز به grep تکیه دارد`);
      assert.doesNotMatch(stripHash(text), /Select-String[^\n]*\^ERROR/, `${label} هنوز به grep تکیه دارد`);
    }
  });
});

// ── ۳. مقصدِ وفادار و پاکسازی ───────────────────────────────────────────────

describe("مقصدِ بازگردانی", () => {
  const COMPOSE = join(ROOT, "scripts", "backup", "verify-stack.compose.yml");
  const compose = existsSync(COMPOSE) ? readFileSync(COMPOSE, "utf8") : "";
  const composeCode = stripHash(compose);

  test("استکِ Supabaseِ یک‌بارمصرف از یک فایلِ compose، نه Postgresِ ساده و نه supabase start", () => {
    assert.ok(compose.length > 0, "scripts/backup/verify-stack.compose.yml پیدا نشد");
    for (const service of ["db:", "auth:", "storage:"]) {
      assert.match(composeCode, new RegExp(`^  ${service}`, "m"), `سرویسِ ${service} در compose نیست`);
    }
    // هر دو اسکریپت همان فایل را بالا می‌آورند و تا سالم‌شدن منتظر می‌مانند.
    assert.match(bashCode, /COMPOSE_FILE="\$SQL_DIR\/verify-stack\.compose\.yml"/);
    assert.match(ps1Code, /'verify-stack\.compose\.yml'/);
    assert.match(bashCode, /compose up --detach --wait/);
    assert.match(ps1Code, /@\('up', '--detach', '--wait'/);
    // `supabase start` همهٔ پورت‌ها را روی 0.0.0.0 منتشر می‌کرد (اندازه‌گیری‌شده).
    for (const [label, code] of [["bash", bashCode], ["ps1", ps1Code]] as const) {
      assert.doesNotMatch(code, /\bstart --workdir|'start', '--workdir'/, `${label}: هنوز supabase start`);
      assert.doesNotMatch(code, /\binit --workdir|'init', '--workdir'/, `${label}: هنوز supabase init`);
    }
  });

  test("فایلِ compose هیچ پورتی منتشر نمی‌کند و شبکه‌اش internal است", () => {
    assert.doesNotMatch(composeCode, /^\s*ports\s*:/m, "کلیدِ ports در compose");
    assert.doesNotMatch(composeCode, /network_mode\s*:\s*host/, "network_mode: host");
    assert.doesNotMatch(composeCode, /privileged\s*:\s*true/, "privileged");
    assert.doesNotMatch(composeCode, /docker\.sock/, "دسترسی به docker.sock");
    assert.match(composeCode, /^networks:\s*\n\s+verify:\s*\n\s+internal: true/m, "شبکهٔ verify باید internal باشد");
    // jobهای pg_cronِ بازگردانی‌شده نباید پیش از شمارش داده را عوض کنند.
    assert.match(composeCode, /cron\.launch_active_jobs=off/);
  });

  test("هر تصویر با digest ثابت pin شده و Auth ≥ v2.197.0 است", () => {
    const images = [...composeCode.matchAll(/^\s*image:\s*(\S+)/gm)].map((m) => m[1]);
    assert.equal(images.length, 3, `سه تصویر انتظار می‌رفت: ${images.join(", ")}`);
    for (const image of images) assert.match(image, /:[\w.-]+@sha256:[0-9a-f]{64}$/, `بدونِ digest: ${image}`);
    const auth = images.find((i) => /gotrue/.test(i)) ?? "";
    const [, minor, patch] = auth.match(/:v2\.(\d+)\.(\d+)@/) ?? [];
    assert.ok(Number(minor) > 197 || (Number(minor) === 197 && Number(patch) >= 0), `Auth قدیمی‌تر از v2.197.0: ${auth}`);
  });

  test("ایزوله‌بودن روی کانتینرهای در حالِ اجرا خوانده می‌شود، نه از فایل", () => {
    for (const [label, code] of [["bash", bashCode], ["ps1", ps1Code]] as const) {
      assert.match(code, /\.HostConfig\.PortBindings/, `${label}: PortBindings خوانده نمی‌شود`);
      assert.match(code, /\.HostConfig\.PublishAllPorts/, `${label}: PublishAllPorts خوانده نمی‌شود`);
      assert.match(code, /\{\{\.Internal\}\}/, `${label}: internal بودنِ شبکه خوانده نمی‌شود`);
      assert.match(code, /->/, `${label}: هر پورتِ منتشرشده (نه فقط 0.0.0.0) باید رد شود`);
      const gate = code.indexOf("{{.Internal}}");
      const restore = code.indexOf("SET session_replication_role = replica");
      assert.ok(gate > 0 && restore > gate, `${label}: بررسیِ ایزوله‌بودن باید پیش از بازگردانی باشد`);
    }
  });

  test("شناسهٔ اجرا یکتا است و همهٔ منابع با برچسبِ همان اجرا ساخته و پاک می‌شوند", () => {
    assert.match(bash, /VERIFY_ID="prodverify\$\{STAMP\/\/-\/\}"/);
    assert.match(ps1, /\$VerifyId\s*=\s*"prodverify/);
    assert.match(compose, /com\.portfolio\.backup-verify: \$\{VERIFY_ID\}/);
    assert.match(bash, /com\.portfolio\.backup-verify=\$VERIFY_ID/);
    assert.match(ps1, /com\.portfolio\.backup-verify=\$VerifyId/);
  });

  test("پاکسازی فقط پروژهٔ همین اجرا را برمی‌دارد، نه چیزِ دیگری روی ماشین", () => {
    assert.match(bashCode, /compose down --volumes --remove-orphans/);
    assert.match(ps1Code, /@\('down', '--volumes', '--remove-orphans'/);
    for (const [label, code] of [["bash", bashCode], ["ps1", ps1Code]] as const) {
      // compose() / Invoke-Compose همیشه `-p <VERIFY_ID>` می‌دهند.
      assert.match(code, /docker compose -p (\$VERIFY_ID|"\$VERIFY_ID"|\$VerifyId)/, `${label}: compose بدونِ -p`);
      for (const broad of [/system prune/, /volume prune/, /network prune/, /container prune/, /docker rm -f \$\(docker ps/]) {
        assert.doesNotMatch(code, broad, `${label}: پاکسازیِ فراگیر ${broad}`);
      }
    }
    // هیچ فراخوانیِ CLI نباید منتظرِ پاسخِ تعاملی بماند.
    assert.match(ps1Code, /'--yes'/);
    assert.match(bashCode, /--yes/);
  });

  test("ساختارِ auth/storageِ مقصد پیش از بازگردانی با Production سنجیده می‌شود، دوطرفه", () => {
    const managed = readFileSync(join(ROOT, "scripts", "backup", "managed-schemas.sql"), "utf8");
    for (const section of ["mschema_migrations|", "mtable|", "mcolumn|", "mconstraint|", "menum|", "mfunction|"]) {
      assert.ok(managed.includes(section), `بخشِ ${section} در managed-schemas.sql نیست`);
    }
    assert.match(managed, /SET search_path = pg_catalog;/, "بدونِ search_pathِ ثابت نام‌ها روی دو اتصال فرق می‌کنند");
    for (const [label, code] of [["bash", bashCode], ["ps1", ps1Code]] as const) {
      assert.match(code, /managed-source\.txt/, `${label}: ساختارِ Production خوانده نمی‌شود`);
      const gate = code.search(/managed-comparison\.txt/);
      const restore = code.indexOf("SET session_replication_role = replica");
      assert.ok(gate > 0 && gate < restore, `${label}: مقایسهٔ ساختارِ مدیریت‌شده باید پیش از بازگردانی باشد`);
    }
  });

  test("اگر dump موفق بود ولی بازگردانی نه، فایل‌ها می‌مانند و MANIFEST «RESTORE UNVERIFIED» می‌گوید", () => {
    for (const [label, code] of [["bash", bashCode], ["ps1", ps1Code]] as const) {
      assert.match(code, /RESTORE UNVERIFIED/, `${label}`);
      assert.doesNotMatch(code, /Remove-Item[^\n]*\$OutDir|rm -rf "\$OUT_DIR"/, `${label}: پوشهٔ بکاپ پاک می‌شود`);
    }
  });

  test("پیش‌درآمدِ بازگردانی: امتیازِ پیش‌فرضِ نقشِ اجراکننده پیش از schema.sql برداشته می‌شود", () => {
    // بدونِ آن، anon روی جدولی که در مبدأ `REVOKE ALL ... FROM anon` داشت دوباره
    // همه‌چیز می‌گرفت (اندازه‌گیری‌شده با دادهٔ مصنوعی). Production یک جدول در
    // public دارد که anon رویش SELECT ندارد.
    const prelude = readFileSync(join(ROOT, "scripts", "backup", "restore-prelude.sql"), "utf8");
    assert.match(prelude, /ALTER DEFAULT PRIVILEGES FOR ROLE %I%s REVOKE ALL ON %s FROM %s/);
    assert.match(prelude, /WHERE defaclrole = current_user::regrole/, "فقط نقشِ همین تراکنش");
    for (const [label, code] of [["bash", bashCode], ["ps1", ps1Code]] as const) {
      assert.match(
        code,
        /--file \/tmp\/restore\/roles\.sql --file \/tmp\/restore\/restore-prelude\.sql --file \/tmp\/restore\/schema\.sql/,
        `${label}: پیش‌درآمد باید بینِ roles و schema و داخلِ همان تراکنش باشد`
      );
    }
  });

  test("inventory با search_pathِ ثابت خوانده می‌شود تا دو اتصال یک متن ببینند", () => {
    // supabase_admin، auth را در search_path دارد و `auth.users(id)` را `users(id)`
    // چاپ می‌کرد؛ یک بازگردانیِ سالم FAIL می‌شد.
    assert.match(inventoryCode, /^SET search_path = pg_catalog;/m);
    assert.match(inventory, /digest\|auth\.users\.credentials\|/, "اثرِ انگشتِ هشِ رمزِ کاربران");
  });

  test("jobهای pg_cron که در dump نیستند شمرده و در manifest اعلام می‌شوند", () => {
    for (const [label, text] of [["bash", bash], ["ps1", ps1]] as const) {
      assert.match(text, /NOT IN BACKUP:\s+pg_cron jobs/, `${label}`);
      assert.match(stripHash(text), /FROM cron\.job/, `${label}: شمارشِ cron.job`);
    }
  });

  test("CLIِ dump روی npx pin شده و پیش از پرسیدنِ رمز اجرا می‌شود", () => {
    assert.match(ps1Code, /\$SupaPin\s*=\s*'supabase@\d+\.\d+\.\d+'/);
    assert.match(bashCode, /SUPA_PIN="supabase@\d+\.\d+\.\d+"/);
    assert.ok(ps1.indexOf("$supaVersion =") < ps1.indexOf("Read-Host -Prompt"), "ps1: بررسیِ CLI باید پیش از رمز باشد");
    assert.ok(bash.indexOf("SUPA_VERSION=") < bash.indexOf("read -rsp"), "bash: بررسیِ CLI باید پیش از رمز باشد");
    // stdoutِ CLI نباید واردِ مقدارِ برگشتیِ Invoke-Supabase شود.
    assert.match(ps1Code, /& \$SupaExe @\(\$SupaArgs \+ \$Arguments\) \| Out-Host/);
  });

  test("pgurl.sh روی هر checkout با LF می‌ماند و CRLF پیش از اجرا گرفته می‌شود", () => {
    // core.autocrlf=true (پیش‌فرضِ Git for Windows) آن را CRLF کرد و busybox sh
    // روی خطِ ۳۳ شکست — روی لپ‌تاپِ آرش اندازه‌گیری شد.
    const attrs = existsSync(join(ROOT, ".gitattributes")) ? readFileSync(join(ROOT, ".gitattributes"), "utf8") : "";
    assert.match(attrs, /^scripts\/backup\/\*\*\s+text eol=lf$/m);
    assert.match(attrs, /^\*\.sh\s+text eol=lf$/m);
    assert.match(ps1Code, /pgurl\.sh[\s\S]{0,40}\)\)\.Contains\("`r"\)/);
    assert.match(bashCode, /grep -q \$'\\r' "\$SQL_DIR\/pgurl\.sh"/);
  });

  test("وفاداریِ مقصد پیش از بازگردانی تأیید می‌شود", () => {
    for (const [label, text] of [["bash", bash], ["ps1", ps1]] as const) {
      assert.match(text, /assert-managed-schemas\.sql/, `${label}`);
    }
  });

  test("پاکسازی روی همهٔ مسیرهای خروج اجرا می‌شود", () => {
    assert.match(bash, /trap cleanup EXIT INT TERM/);
    assert.match(ps1, /finally\s*\{[\s\S]{0,80}Invoke-Cleanup/);
  });
});

// ── ۴. راستی‌آزمایی: یک منبع، دوطرفه ────────────────────────────────────────

describe("راستی‌آزمایی", () => {
  test("منطقِ مقایسه یک بار نوشته شده و هر دو اسکریپت همان را صدا می‌زنند", () => {
    // نسخهٔ قبل مقایسه را در bash و PowerShell جداگانه داشت. هر واگرایی یعنی
    // یکی چیزی می‌بیند که دیگری نمی‌بیند، و چون هر دو «سبز» می‌گویند، معلوم
    // نمی‌شود کدام درست است.
    assert.match(bash, /compare\.mjs|\$COMPARE_JS/);
    assert.match(ps1, /\$CompareJs/);
  });

  test("شمارشِ ردیف پویا است، نه فهرستِ ثابت", () => {
    assert.match(inventory, /FROM pg_class c/);
    assert.match(inventory, /query_to_xml/);
    assert.match(inventory, /n\.nspname IN \('public', 'auth', 'storage'\)/);
  });

  test("از تخمینِ reltuples استفاده نمی‌شود", () => {
    assert.doesNotMatch(inventoryCode, /reltuples/);
  });

  test("تریگرها با pg_class و pg_namespace محدود می‌شوند", () => {
    // ایرادِ نسخهٔ قبل: `count(*) FROM pg_trigger WHERE NOT tgisinternal`
    // همهٔ اسکیماها را می‌شمرد، برخلافِ بقیهٔ سنجه‌ها که فقط public بودند.
    assert.match(
      inventoryCode,
      /FROM pg_trigger t\s*\nJOIN pg_class c ON c\.oid = t\.tgrelid\s*\nJOIN pg_namespace n/
    );
    assert.doesNotMatch(inventoryCode, /FROM pg_trigger\s+WHERE NOT tgisinternal/);
  });

  test("اثرِ انگشت شاملِ همهٔ چیزهای خواسته‌شده است", () => {
    for (const section of [
      "table|", "column|", "constraint|", "rls|", "policy|", "index|",
      "sequence|", "view|", "matview|", "function|", "trigger|",
      "grant_table|", "grant_routine|", "grant_sequence|",
    ]) {
      assert.ok(inventory.includes(section), `بخشِ ${section} در inventory.sql نیست`);
    }
  });

  test("مقایسه هر دو جهت را می‌بیند", () => {
    assert.match(compare, /missing/);
    assert.match(compare, /extra/);
    assert.match(compare, /changed/);
    // سه حالت، نه دو: ۰ تأییدشده · ۲ تأییدنشده · ۱ شکست.
    assert.match(compare, /process\.exit\(!structureOk \? 1 : dataVerified \? 0 : 2\)/);
  });

  test("هر دو اسکریپت حالتِ «تأییدنشده» را از PASS و FAIL جدا می‌کنند", () => {
    // اگر یکی از دو مسیر کدِ ۲ را با ۰ یکی بگیرد، «اثبات نشد» بی‌صدا به
    // «تأیید شد» تبدیل می‌شود — دقیقاً همان چیزی که این تفکیک برای بستنش آمد.
    assert.match(bash, /COMPARE_RC" -eq 2/, "bash حالتِ PARTIAL را جدا نمی‌کند");
    assert.match(bash, /PARTIAL/, "bash در MANIFEST حالتِ PARTIAL را نمی‌نویسد");
    assert.match(ps1, /compareExit -eq 2/, "ps1 حالتِ PARTIAL را جدا نمی‌کند");
    assert.match(ps1, /PARTIAL/, "ps1 در MANIFEST حالتِ PARTIAL را نمی‌نویسد");
  });

  test("نسخهٔ طرحِ Auth ثبت و پیش از بازگردانی سنجیده می‌شود", () => {
    for (const name of ["auth.schema_migrations", "storage.migrations"]) {
      assert.ok(inventory.includes(`('${name}')`), `${name} استثنای مستندِ شمارش نیست`);
    }
    for (const [label, code] of [["bash", bashCode], ["ps1", ps1Code]] as const) {
      assert.match(code, /auth-version\.txt/, `${label}: نسخهٔ Authِ Production ثبت نمی‌شود`);
      const gate = code.search(/older than production|قدیمی‌تر است/);
      const restore = code.indexOf("SET session_replication_role = replica");
      assert.ok(gate > 0 && gate < restore, `${label}: بررسیِ نسخهٔ Auth باید پیش از بازگردانی باشد`);
    }
  });

  test("استثناها صریح و مستند هستند", () => {
    for (const name of ["storage.buckets_vectors", "storage.vector_indexes"]) {
      assert.ok(inventory.includes(name), `${name} به‌عنوانِ استثنا ثبت نشده`);
      assert.ok(bash.includes(name), `bash استثنای ${name} را به dump نمی‌دهد`);
      assert.ok(ps1.includes(name), `ps1 استثنای ${name} را به dump نمی‌دهد`);
    }
  });
});

// ── ۵. سکرت و مقصد ─────────────────────────────────────────────────────────

describe("سکرت و مقصدِ بکاپ", () => {
  test("رشتهٔ اتصال با ورودیِ مخفی گرفته می‌شود", () => {
    assert.match(bash, /read -rsp/);
    assert.match(ps1, /Read-Host[^\n]*-AsSecureString/);
  });

  test("رشتهٔ اتصال از stdin می‌رود، نه از argv و نه از متغیرِ محیطی", () => {
    // پاس‌ترویِ `-e DB_URL` روی دستگاهِ آرش نرسید و psql بی‌صدا سراغِ سوکتِ
    // محلی رفت. متغیرِ محیطی ضمناً در `docker inspect` هم دیده می‌شود.
    // B-057: خواندن از stdin و هر کارِ دیگر روی مقدار در **یک** فایل است که هر دو
    // اسکریپت منبع می‌کنند — گارد جابه‌جا شد، ضعیف نشد.
    const pgurl = existsSync(join(ROOT, "scripts", "backup", "pgurl.sh"))
      ? readFileSync(join(ROOT, "scripts", "backup", "pgurl.sh"), "utf8") : "";
    assert.match(pgurl, /IFS= read -r PGURL/, "pgurl.sh باید از stdin بخواند");
    assert.match(pgurl, /tr -d '\\r'/, "pgurl.sh باید CR را حذف کند");
    assert.match(pgurl, /export PGPASSWORD/, "pgurl.sh باید رمز را از argv بیرون ببرد");
    assert.ok([...pgurl].every((c) => c.charCodeAt(0) < 128), "pgurl.sh باید ASCII باشد");
    // پیاده‌سازیِ واحد: نقل‌قولِ URI فقط داخلِ pgurl.sh است (pgurl_psql).
    assert.match(pgurl, /pgurl_psql\(\) \{\n  exec psql -w "\$PGURL" "\$@"\n\}/, "pgurl_psql باید URI را داخلِ sh نقل‌قول کند");
    for (const [label, code] of [["bash", bashCode], ["ps1", ps1Code]] as const) {
      assert.match(code, /\. \/sql\/pgurl\.sh; pgurl_psql /, `${label} باید از pgurl.sh بگذرد`);
      assert.doesNotMatch(code, /read -r PGURL; exec psql/, `${label} مسیرِ قدیمیِ بی‌گارد را دارد`);
      assert.doesNotMatch(code, /docker run --rm -e DB_URL\b/, `${label} هنوز پاس‌ترو دارد`);
      assert.doesNotMatch(code, /-e DB_URL=\$DbUrl/, `${label} سکرت را در argv می‌گذارد`);
    }
  });

  test("شکلِ رشتهٔ اتصال پیش از هر کارِ سنگین بررسی می‌شود", () => {
    assert.match(bashCode, /postgres:\/\/\*\|postgresql:\/\/\*/);
    assert.match(ps1Code, /notmatch '\^postgres\(ql\)\?:\/\/'/);
  });

  test("اتصال قبل از dump با یک probe تأیید می‌شود", () => {
    // بدونِ این، اولین نشانهٔ خرابی یک خطای گمراه‌کنندهٔ psql بعد از دانلودِ
    // چند گیگابایت image بود.
    assert.match(bashCode, /SELECT 1/);
    assert.match(ps1Code, /SELECT 1/);
  });

  test("نشتِ باقی‌مانده صادقانه مستند شده است", () => {
    assert.match(bash, /process list|خروجیِ `ps`|ps`/);
    assert.match(ps1, /process list/);
  });

  test("manifest هیچ میدانِ حساسی ندارد", () => {
    for (const [label, text] of [["bash", bash], ["ps1", ps1]] as const) {
      const start = text.indexOf("backup taken");
      assert.ok(start > 0, `${label}: بخشِ manifest پیدا نشد`);
      const manifest = text.slice(start, start + 1400);
      for (const forbidden of ["DB_URL", "password", "connection string", "SERVICE_ROLE"]) {
        assert.ok(
          !manifest.includes(forbidden),
          `${label}: manifest نباید «${forbidden}» داشته باشد`
        );
      }
    }
  });

  test("مقصد داخلِ هیچ مخزنِ گیتی نیست", () => {
    assert.match(bashCode, /rev-parse --git-dir/);
    // ⚠️ نسخهٔ ویندوزی عمداً به git شل‌اوت **نمی‌کند**. در PowerShell 5.1 هر
    // خطِ stderr از یک برنامهٔ خارجی زیرِ ErrorActionPreference='Stop' اسکریپت
    // را می‌کشد — و همین در اولین اجرای واقعی اتفاق افتاد، دقیقاً وقتی گارد
    // درست کار می‌کرد. پیمایشِ خالصِ پوشه‌ها نه به git وابسته است نه به stderr.
    assert.match(ps1Code, /function Test-InsideGitRepo/);
    assert.match(ps1Code, /Test-InsideGitRepo -Path \$OutDir/);
  });

  test("stderrِ برنامه‌های خارجی اسکریپتِ ویندوزی را نمی‌کشد", () => {
    // git/docker/supabase همگی روی stderr پیام می‌دهند. 'Stop' هرگز چیزی را
    // ایمن نکرده بود؛ بررسیِ صریحِ $LASTEXITCODE این کار را می‌کند.
    assert.match(ps1Code, /\$ErrorActionPreference = 'Continue'/);
    assert.doesNotMatch(ps1Code, /\$ErrorActionPreference = 'Stop'/);
    assert.match(ps1Code, /\$LASTEXITCODE/);
  });

  test("گاردِ مقصد پیش از هر کارِ دیگری اجرا می‌شود", () => {
    // اگر بعد از راه‌اندازیِ Docker بود، کاربر دقایقی صبر می‌کرد تا بفهمد
    // مسیر را اشتباه داده.
    assert.ok(
      bash.indexOf("rev-parse --git-dir") < bash.indexOf("command -v docker"),
      "bash: گاردِ مقصد باید قبل از بررسیِ Docker باشد"
    );
    assert.ok(
      ps1.indexOf("Test-InsideGitRepo -Path $OutDir") < ps1.indexOf("Test-Command 'docker'"),
      "ps1: گاردِ مقصد باید قبل از بررسیِ Docker باشد"
    );
  });
});

// ── ۶. صداقتِ ادعا ─────────────────────────────────────────────────────────

test("هیچ‌کدام «موفق» نمی‌گویند مگر مقایسه سبز باشد", () => {
  assert.match(bash, /if \[ "\$COMPARE_RC" -eq 0 \][\s\S]{0,600}بکاپ ساخته شد و/);
  assert.match(ps1, /if \(\$compareExit -ne 0\)[\s\S]{0,300}Die/);
});

/* ── پنجرهٔ زندهٔ بکاپ — `compare.mjs --source-after` ─────────────────────────
 *
 * اثرِ انگشتِ مبدأ پیش از dump خوانده می‌شود و dump چند دقیقه طول می‌کشد.
 * Production در همان چند دقیقه می‌نویسد. بدونِ این پنجره، یک بکاپِ کاملاً
 * سالم مردود می‌شود و اپراتور یاد می‌گیرد این مقایسه را جدی نگیرد — که از
 * نبودِ مقایسه بدتر است.
 *
 * ولی پنجره نباید به «هر عددی قبول است» تبدیل شود: عددِ کمتر از کمینهٔ
 * پنجره یعنی داده از دست رفته و باید همچنان شکست باشد.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync as writeFile } from "node:fs";
import { tmpdir } from "node:os";

const CMP = join(process.cwd(), "scripts", "backup", "compare.mjs");

function runCompare(before: string, restored: string, after?: string): { code: number; out: string } {
  const dir = mkdtempSync(join(tmpdir(), "cmp-"));
  const f = (name: string, body: string) => {
    const p = join(dir, name);
    writeFile(p, body, "utf8");
    return p;
  };
  const args = [CMP, f("before.txt", before), f("restored.txt", restored)];
  if (after !== undefined) args.push("--source-after", f("after.txt", after));
  try {
    const out = execFileSync("node", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

/** یک جدولِ زنده و یک جدولِ ساکن و یک شیءِ ساختاری. */
const BEFORE = [
  "rowcount|public.symbol_history|2108888",
  "rowcount|public.profiles|2",
  "column|public.payments.amount|integer",
].join("\n");
const AFTER_LIVE = [
  "rowcount|public.symbol_history|2109300",
  "rowcount|public.profiles|2",
  "column|public.payments.amount|integer",
].join("\n");

test("بدونِ پنجره: رشدِ طبیعیِ حینِ بکاپ به‌عنوان شکست گزارش می‌شود", () => {
  // تضمین: بدونِ `--source-after` رفتار عیناً همان قبل است (سازگاریِ عقب‌رو).
  const restored = BEFORE.replace("2108888", "2109100");
  const r = runCompare(BEFORE, restored);
  assert.equal(r.code, 1);
});

test("با پنجره: عددِ داخلِ بازه **تأییدنشده** است، نه پذیرفته‌شده", () => {
  // تضمینِ این تست: کدِ ۲ (تأییدنشده) از کدِ ۰ (تأییدشده) جدا می‌ماند.
  // چیزی که **اثبات نمی‌کند**: اینکه آن جدول واقعاً سالم بازگردانده شده.
  const restored = BEFORE.replace("2108888", "2109100");
  const r = runCompare(BEFORE, restored, AFTER_LIVE);
  assert.equal(r.code, 2, "داخلِ بازه نباید PASS بدهد");
  assert.match(r.out, /تأیید نشد|تأییدنشده/);
  assert.match(r.out, /symbol_history/);
  assert.match(r.out, /PARTIAL/);
});

test("با پنجره: مرزهای بازه هم تأییدنشده‌اند، نه پذیرفته", () => {
  for (const v of ["2108888", "2109300"]) {
    const r = runCompare(BEFORE, BEFORE.replace("2108888", v), AFTER_LIVE);
    // مرزِ پایین برابرِ عددِ «قبل» است، پس آن یکی برابریِ دقیق است و PASS.
    const expected = v === "2108888" ? 0 : 2;
    assert.equal(r.code, expected, `مرزِ ${v}`);
  }
});

test("با پنجره: عددِ کمتر از کمینه همچنان شکست است — آن از‌دست‌رفتنِ داده است", () => {
  const restored = BEFORE.replace("2108888", "2108000");
  const r = runCompare(BEFORE, restored, AFTER_LIVE);
  assert.equal(r.code, 1);
  assert.match(r.out, /بیرونِ آن است/);
});

test("با پنجره: عددِ بیشتر از بیشینه هم شکست است — پنجره سقف دارد", () => {
  const restored = BEFORE.replace("2108888", "2200000");
  assert.equal(runCompare(BEFORE, restored, AFTER_LIVE).code, 1);
});

test("جدولِ ساکن پنجره نمی‌گیرد — برابریِ دقیق لازم است", () => {
  // `profiles` بینِ دو خواندن تکان نخورده، پس هیچ عذری ندارد.
  const restored = BEFORE.replace("public.profiles|2", "public.profiles|3");
  assert.equal(runCompare(BEFORE, restored, AFTER_LIVE).code, 1);
});

test("زنده‌بودنِ دیتابیس دربارهٔ **ساختار** هیچ عذری نمی‌سازد", () => {
  const restored = BEFORE.replace("payments.amount|integer", "payments.amount|bigint");
  assert.equal(runCompare(BEFORE, restored, AFTER_LIVE).code, 1);
});

test("جدولِ غایب با جدولِ زنده یکی نیست", () => {
  const restored = BEFORE.split("\n").filter((l) => !l.includes("symbol_history")).join("\n");
  const r = runCompare(BEFORE, restored, AFTER_LIVE);
  assert.equal(r.code, 1);
  assert.match(r.out, /غایب/);
});

test("هر دو اسکریپت فهرستِ مبدأ را دو بار می‌خوانند و پنجره را پاس می‌دهند", () => {
  // پاریتی عمدی است: اگر فقط یکی از دو مسیر پنجره را بفرستد، همان مسیرِ دیگر
  // روی یک دیتابیسِ زنده بکاپِ سالم را مردود می‌کند — و چون هر دو «اسکریپتِ
  // رسمی» هستند، معلوم نمی‌شود کدام درست گفته.
  for (const [name, src] of [["bash", bash], ["ps1", ps1]] as const) {
    assert.match(src, /inventory-source-after\.txt/, `${name}: خواندنِ دومِ مبدأ ندارد`);
    assert.match(src, /--source-after/, `${name}: پنجره را به compare نمی‌دهد`);
  }
});

test("خواندنِ دوم **پس از** dump است، نه پیش از آن", () => {
  // اگر پیش از dump خوانده شود، پنجره خالی می‌ماند و کلِ این کار بی‌اثر است.
  const afterIdx = bash.indexOf("inventory-source-after.txt");
  const dumpIdx = bash.indexOf("--data-only");
  assert.ok(dumpIdx > 0 && afterIdx > dumpIdx, "در bash خواندنِ دوم باید بعد از dumpِ داده باشد");
  const psAfter = ps1.indexOf("inventory-source-after.txt");
  const psDump = ps1.indexOf("--data-only");
  assert.ok(psDump > 0 && psAfter > psDump, "در ps1 خواندنِ دوم باید بعد از dumpِ داده باشد");
});

/* ── محدودهٔ تضمین: چه چیزی را این مقایسه **نمی‌بیند** ────────────────────────
 *
 * سه سناریوی زیر به درخواستِ بازبینیِ مستقل اضافه شده‌اند. دو تای آخرشان
 * عمداً ثابت می‌کنند مقایسه **کور** است — و همین دلیلِ وجودِ حالتِ سومِ
 * «تأییدنشده» است. تستی که فقط موفقیت را نشان دهد، این کوری را پنهان می‌کرد.
 */

test("بکاپِ ناقص با شمارشِ داخلِ بازه → تأییدنشده، نه PASS", () => {
  // تضمینِ این تست: یک بازگردانیِ **ناقص** (۴۰۰ ردیف کمتر از عددِ پس از dump)
  // که تصادفاً داخلِ پنجره می‌افتد، هرگز کدِ ۰ نمی‌گیرد.
  // اثبات **نمی‌کند**: که مقایسه بتواند ناقص‌بودن را *تشخیص* دهد — نمی‌تواند.
  // فقط از ادعای «تأیید شد» خودداری می‌کند.
  const restored = BEFORE.replace("2108888", "2108900"); // داخلِ 2108888..2109300
  const r = runCompare(BEFORE, restored, AFTER_LIVE);
  assert.equal(r.code, 2, "ناقص‌بودنِ ممکن نباید PASS بگیرد");
  assert.match(r.out, /PARTIAL/);
  assert.doesNotMatch(r.out, /صفر اختلاف/);
});

test("تغییرِ محتوا بدونِ تغییرِ تعداد → این مقایسه آن را **نمی‌بیند**", () => {
  // تضمینِ این تست: ثبتِ صریحِ یک نقطهٔ کور. فهرست فقط `count(*)` دارد و هیچ
  // checksumی از محتوا نمی‌گیرد، پس دو دیتابیس با ردیف‌های متفاوت ولی تعدادِ
  // یکسان اینجا «برابر» دیده می‌شوند.
  // یعنی **حتی کدِ ۰ هم «دادهٔ یکسان» را اثبات نمی‌کند** — «تعدادِ یکسان» را
  // می‌گوید. بستنِ این شکاف snapshotِ مشترک می‌خواهد، نه یک تستِ بیشتر.
  const r = runCompare(BEFORE, BEFORE, AFTER_LIVE);
  assert.equal(r.code, 0, "تعدادها برابرند، پس مقایسه سبز است");
  assert.match(r.out, /محتوا را نمی‌بیند/, "این محدودیت باید در گزارش نوشته شود");
});

test("درج و حذفِ هم‌زمان → تعداد دست‌نخورده می‌ماند و باز هم دیده نمی‌شود", () => {
  // تضمینِ این تست: همان نقطهٔ کور، از راهی که در یک دیتابیسِ زنده **محتمل‌تر**
  // است — یک درج و یک حذف در همان پنجره. عدد تکان نمی‌خورد.
  // برای جدولِ append-only این سناریو نباید رخ دهد؛ برای بقیه می‌تواند.
  const before = "rowcount|public.notes|100";
  const after = "rowcount|public.notes|100";      // خالص: بدونِ تغییر
  const restored = "rowcount|public.notes|100";   // ولی محتوا متفاوت
  const r = runCompare(before, restored, after);
  assert.equal(r.code, 0);
  assert.match(r.out, /محتوا را نمی‌بیند/);
});

test("گزارش صریح می‌گوید hash فقط تمامیتِ فایل را نشان می‌دهد", () => {
  // ادعای «sha256 دارد پس بکاپ کامل است» یک استنتاجِ غلطِ رایج است.
  const r = runCompare(BEFORE, BEFORE, AFTER_LIVE);
  assert.match(r.out, /sha256ِ فایل‌ها هم فقط تمامیتِ/);
  assert.match(bash, /not the completeness of the source data/);
});

test("چهار وضعیت جدا گزارش می‌شوند، نه یک PASS/FAILِ واحد", () => {
  const r = runCompare(BEFORE, BEFORE, AFTER_LIVE);
  for (const label of [/restore/, /ساختار بررسی‌شده/, /تطبیقِ شمارشِ ردیف‌ها/, /تطبیق با snapshotِ مشترک/]) {
    assert.match(r.out, label);
  }
  // تطبیق با snapshotِ مشترک هنوز انجام نمی‌شود و باید همین را بگوید.
  assert.match(r.out, /انجام نشد/);
});

// ── compare.mjs و BOM ───────────────────────────────────────────────────────
describe("compare.mjs با فایلِ BOMدار", () => {
  test("فایلی که Windows PowerShell 5.1 با BOM نوشته با همان فایلِ لینوکسی برابر است", async () => {
    const { mkdtempSync, writeFileSync: write } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { spawnSync } = await import("node:child_process");
    const dir = mkdtempSync(join(tmpdir(), "cmp-bom-"));
    const body = "table|public.t|r\nrowcount|public.t|2\n";
    write(join(dir, "win.txt"), "﻿" + body.replace(/\n/g, "\r\n"));
    write(join(dir, "linux.txt"), body);
    const r = spawnSync("node", [join(ROOT, "scripts", "backup", "compare.mjs"), join(dir, "win.txt"), join(dir, "linux.txt")], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    // و برعکس: BOM یک اختلافِ واقعی را پنهان نمی‌کند.
    write(join(dir, "linux2.txt"), body.replace("|2", "|3"));
    const bad = spawnSync("node", [join(ROOT, "scripts", "backup", "compare.mjs"), join(dir, "win.txt"), join(dir, "linux2.txt")], { encoding: "utf8" });
    assert.notEqual(bad.status, 0);
  });
});
