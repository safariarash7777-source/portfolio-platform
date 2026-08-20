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
    const restoreBlock = bash.slice(bash.indexOf("docker run --rm --network host -e DB_URL=\"$VERIFY_URL\" \\\n  -v \"$OUT_DIR:/backup:ro\""));
    assert.doesNotMatch(restoreBlock.slice(0, 900), /\|\|\s*true/);
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
  test("استکِ Supabaseِ محلیِ ایزوله، نه Postgresِ ساده", () => {
    assert.match(bashCode, /"\$\{SUPA\[@\]\}" init --workdir "\$VERIFY_WORKDIR"/);
    assert.match(ps1Code, /@\('init', '--workdir', \$VerifyWorkdir/);
    // مقصد دیگر یک Postgresِ سادهٔ خالی نیست؛ استکِ Supabase بالا می‌آید.
    assert.match(bashCode, /"\$\{SUPA\[@\]\}" start --workdir/);
    assert.match(ps1Code, /@\('start', '--workdir', \$VerifyWorkdir/);
  });

  test("شناسه و پورت‌ها یکتا هستند", () => {
    assert.match(bash, /VERIFY_ID="prodverify\$STAMP"/);
    assert.match(bash, /PORT_BASE=/);
    assert.match(ps1, /\$VerifyId\s*=\s*"prodverify/);
    assert.match(ps1, /\$PortBase\s*=/);
  });

  test("پروژهٔ محلیِ موجود متوقف یا بازنویسی نمی‌شود", () => {
    // هیچ‌کدام نباید `supabase stop` را بدونِ workdir صدا بزنند — آن نسخه
    // پروژهٔ جاری کاربر را می‌خواباند.
    assert.doesNotMatch(bashCode, /supabase" stop(?![\s\S]{0,60}--workdir)/);
    assert.match(bash, /stop --workdir "\$VERIFY_WORKDIR" --no-backup/);
    assert.match(ps1, /'stop', '--workdir', \$VerifyWorkdir, '--no-backup'/);
    // هیچ فراخوانیِ CLI نباید منتظرِ پاسخِ تعاملی بماند — اسکریپت بدونِ کاربر
    // جلوی صفحه هم باید تمام شود.
    assert.match(ps1Code, /'--yes'/);
    assert.match(bashCode, /--yes/);
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
    assert.match(compare, /process\.exit\(problems === 0 \? 0 : 1\)/);
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

  test("رشتهٔ اتصال داخلِ کانتینر بسط داده می‌شود، نه در argvِ میزبان", () => {
    assert.match(bash, /--entrypoint sh[\s\S]{0,120}psql "\$DB_URL"/);
    assert.match(ps1, /--entrypoint sh[\s\S]{0,160}psql "\$DB_URL"/);
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
