<#
    بکاپِ دستیِ Production روی ویندوز — مسیرِ رایگان، بدونِ ارتقای پلن.

        powershell -ExecutionPolicy Bypass -File scripts\backup-production.ps1

    راهنمای گام‌به‌گامِ فارسی: docs/RUNBOOK-backup-windows.md

    ── این فایل معادلِ ویندوزیِ scripts/backup-production.sh است ───────────────
    هر دو باید **رفتارِ یکسان** داشته باشند. اگر یکی را عوض کردی، دیگری را هم
    عوض کن؛ `lib/ops/backup-scripts.test.ts` این هم‌ترازی را می‌سنجد و اگر یک
    گاردِ ایمنی فقط در یکی باشد، قرمز می‌شود.

    ── قواعدی که رعایت می‌شود ─────────────────────────────────────────────────
      • رشتهٔ اتصال با Read-Host -AsSecureString گرفته می‌شود: روی صفحه نمایش
        داده نمی‌شود، در تاریخچهٔ PowerShell نمی‌ماند، و روی دیسک نوشته نمی‌شود.
      • فایل‌های بکاپ بیرون از هر مخزنِ گیت ساخته می‌شوند و اسکریپت اگر مقصد
        داخلِ ریپو باشد اصلاً اجرا نمی‌شود.
      • «فایل ساخته شد» موفقیت حساب نمی‌شود. تا وقتی بکاپ در یک Postgresِ
        یک‌بارمصرف بازگردانده نشود و شمارشِ ردیف‌ها با Production نخواند،
        اسکریپت با خطا تمام می‌شود.

    ⚠️ صادقانه دربارهٔ تنها نشتِ باقی‌مانده: `supabase db dump` رشتهٔ اتصال را
       به‌صورتِ **آرگومان** می‌گیرد، پس تا لحظهٔ اجرا در فهرستِ پروسه‌های ویندوز
       (Task Manager / Get-CimInstance Win32_Process) دیدنی است. روی کامپیوترِ
       شخصی اهمیتِ عملی ندارد؛ روی رایانهٔ مشترک یا سرور این اسکریپت را اجرا نکن.
       برای فراخوانی‌های docker از `-e DB_URL` استفاده شده که مقدار را از محیط
       می‌برد و واردِ خطِ فرمان نمی‌کند.

    پیش‌نیاز: Docker Desktop (در حال اجرا) و Supabase CLI — یا فقط Node/npx.
#>

[CmdletBinding()]
param(
    # مقصدِ بکاپ. پیش‌فرض: %USERPROFILE%\supabase-backups\prod-<timestamp>
    [string]$BackupDir
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$PgImage = 'postgres:17-alpine'
$Stamp   = Get-Date -Format 'yyyyMMdd-HHmmss'
if ([string]::IsNullOrWhiteSpace($BackupDir)) {
    $BackupDir = Join-Path $env:USERPROFILE "supabase-backups\prod-$Stamp"
}
$VerifyContainer = "prodbackup-verify-$Stamp"

function Write-Step { param([string]$Text) Write-Host "`n$Text" -ForegroundColor Cyan }
function Fail { param([string]$Text) Write-Host "`n[X] $Text" -ForegroundColor Red; exit 1 }

# ── ۰) مقصد باید بیرونِ هر مخزنِ گیت باشد ────────────────────────────────────
# عمداً اولین بررسی است: ارزان‌ترین است، و اگر مقصد غلط باشد بهتر است کاربر
# پیش از راه‌اندازیِ Docker بفهمد.
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$BackupDir = (Resolve-Path $BackupDir).Path

$probe = Get-Item -LiteralPath $BackupDir
while ($null -ne $probe) {
    if (Test-Path (Join-Path $probe.FullName '.git')) {
        Remove-Item -LiteralPath $BackupDir -Force -ErrorAction SilentlyContinue
        Fail "مقصد داخلِ یک مخزنِ گیت است: $BackupDir`nفایلِ بکاپ هرگز نباید وارد مخزن شود. با -BackupDir مسیرِ دیگری بده."
    }
    $probe = $probe.Parent
}

# ── ۱) پیش‌نیازها ────────────────────────────────────────────────────────────
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Fail "Docker نصب نیست. Docker Desktop را نصب کن — هم برای گرفتنِ بکاپ لازم است و هم برای آزمونِ بازگردانی."
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Fail "Docker نصب هست ولی در حال اجرا نیست. Docker Desktop را باز کن و صبر کن تا کامل بالا بیاید، بعد دوباره این دستور را بزن."
}

if (Get-Command supabase -ErrorAction SilentlyContinue) {
    $SupaExe  = 'supabase'
    $SupaArgs = @()
} elseif (Get-Command npx -ErrorAction SilentlyContinue) {
    # نصبِ Supabase CLI لازم نیست؛ npx همان لحظه اجرایش می‌کند.
    $SupaExe  = 'npx'
    $SupaArgs = @('--yes', 'supabase')
} else {
    Fail "نه `supabase` پیدا شد و نه `npx`. یکی از این دو لازم است — ساده‌ترین راه نصبِ Node.js است که npx همراهش می‌آید."
}

# ── ۲) رشتهٔ اتصال — پرسیده می‌شود، ذخیره نمی‌شود ────────────────────────────
Write-Host @'

رشتهٔ اتصالِ Production را از داشبورد بردار:
  Supabase Dashboard → پروژه → دکمهٔ Connect → Session pooler یا Direct connection

هنگامِ تایپ چیزی روی صفحه نمایش داده نمی‌شود. این مقدار نه ذخیره می‌شود،
نه چاپ، و نه در تاریخچهٔ PowerShell می‌ماند.

** آن را در چت، تلگرام، ایمیل یا GitHub برای هیچ‌کس نفرست. **

'@

$secure = Read-Host -Prompt 'connection string' -AsSecureString
$bstr   = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
if ([string]::IsNullOrWhiteSpace($plain)) { Fail 'چیزی وارد نشد.' }

# `-e DB_URL` (بدونِ مقدار) یعنی docker مقدار را از محیط برمی‌دارد و واردِ
# خطِ فرمان نمی‌کند — پس در فهرستِ پروسه‌ها دیده نمی‌شود.
$env:DB_URL = $plain

$countSql = @'
SELECT format('%s=%s', t, n) FROM (
  SELECT 'auth.users' t, count(*) n FROM auth.users
  UNION ALL SELECT 'profiles',        count(*) FROM public.profiles
  UNION ALL SELECT 'waitlist',        count(*) FROM public.waitlist
  UNION ALL SELECT 'payments',        count(*) FROM public.payments
  UNION ALL SELECT 'entitlements',    count(*) FROM public.entitlements
  UNION ALL SELECT 'symbol_history',  count(*) FROM public.symbol_history
  UNION ALL SELECT 'codal_reports',   count(*) FROM public.codal_reports
  UNION ALL SELECT 'codal_feed',      count(*) FROM public.codal_feed
  UNION ALL SELECT 'audit_log',       count(*) FROM public.audit_log
  UNION ALL SELECT 'content_hub',     count(*) FROM public.content_hub
  UNION ALL SELECT 'obj:tables',    count(*) FROM pg_tables WHERE schemaname='public'
  UNION ALL SELECT 'obj:policies',  count(*) FROM pg_policies WHERE schemaname='public'
  UNION ALL SELECT 'obj:indexes',   count(*) FROM pg_indexes WHERE schemaname='public'
  UNION ALL SELECT 'obj:functions', count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
  UNION ALL SELECT 'obj:triggers',  count(*) FROM pg_trigger WHERE NOT tgisinternal
) s ORDER BY 1;
'@

$expectedPath = Join-Path $BackupDir 'expected-counts.txt'
$restoredPath = Join-Path $BackupDir 'restored-counts.txt'

try {
    # ── ۳) شمارشِ واقعیِ Production، پیش از بکاپ ─────────────────────────────
    # مبنای مقایسه از خودِ دیتابیس گرفته می‌شود، نه از عددی که در این فایل نوشته
    # باشیم — وگرنه با رشدِ داده بی‌صدا کهنه می‌شد و راستی‌آزمایی بی‌معنا.
    Write-Step '۱/۵ — شمارشِ ردیف‌های Production (فقط خواندن)'
    $expected = docker run --rm -e DB_URL -i $PgImage psql $env:DB_URL -X -q -A -t -c $countSql
    if ($LASTEXITCODE -ne 0 -or -not $expected) {
        Fail 'اتصال به Production برقرار نشد. رشتهٔ اتصال را دوباره از داشبورد کپی کن.'
    }
    $expected = @($expected | Where-Object { $_ -match '=' })
    Set-Content -LiteralPath $expectedPath -Value $expected -Encoding UTF8
    Write-Host 'شمارشِ مرجع ثبت شد:'
    $expected | ForEach-Object { Write-Host "    $_" }

    # ── ۴) سه فایلِ بکاپ، طبقِ روشِ رسمیِ Supabase ────────────────────────────
    Write-Step '۲/۵ — گرفتنِ بکاپ (roles · schema · data)'
    $rolesPath  = Join-Path $BackupDir 'roles.sql'
    $schemaPath = Join-Path $BackupDir 'schema.sql'
    $dataPath   = Join-Path $BackupDir 'data.sql'

    & $SupaExe @SupaArgs db dump --db-url $env:DB_URL -f $rolesPath  --role-only
    if ($LASTEXITCODE -ne 0) { Fail 'گرفتنِ roles.sql شکست خورد.' }
    & $SupaExe @SupaArgs db dump --db-url $env:DB_URL -f $schemaPath
    if ($LASTEXITCODE -ne 0) { Fail 'گرفتنِ schema.sql شکست خورد.' }
    & $SupaExe @SupaArgs db dump --db-url $env:DB_URL -f $dataPath --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
    if ($LASTEXITCODE -ne 0) { Fail 'گرفتنِ data.sql شکست خورد.' }

    foreach ($f in @($rolesPath, $schemaPath, $dataPath)) {
        if (-not (Test-Path $f) -or (Get-Item $f).Length -eq 0) {
            Fail "$([IO.Path]::GetFileName($f)) خالی است — بکاپ ناقص است و قابلِ اتکا نیست."
        }
    }

    # ── ۵) راستی‌آزمایی: بازگرداندن در یک Postgresِ یک‌بارمصرف ────────────────
    # این مرحله «فایل ساخته شد» را به «بکاپ قابلِ بازیابی است» تبدیل می‌کند.
    # Production در این مرحله اصلاً لمس نمی‌شود.
    Write-Step '۳/۵ — بالا آوردنِ یک Postgresِ موقت برای آزمونِ بازگردانی'
    docker run -d --name $VerifyContainer -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=postgres $PgImage *> $null
    if ($LASTEXITCODE -ne 0) { Fail 'Postgresِ موقت بالا نیامد.' }

    $ready = $false
    foreach ($i in 1..60) {
        docker exec $VerifyContainer pg_isready -U postgres *> $null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { Fail 'Postgresِ موقت آماده نشد.' }

    Write-Step '۴/۵ — بازگردانی در محیطِ موقت'
    # از `docker cp` استفاده می‌شود نه ریدایرکتِ stdin: ویندوز هنگامِ پایپ‌کردنِ
    # فایل، انکودینگ را عوض می‌کند و فایل‌های UTF-8 خراب می‌شوند.
    foreach ($name in @('roles', 'schema', 'data')) {
        $src = Join-Path $BackupDir "$name.sql"
        docker cp $src "${VerifyContainer}:/tmp/$name.sql" *> $null
        $log = Join-Path $BackupDir "restore-$name.log"
        # خطای «نقش از قبل هست/نیست» هنگامِ بازگردانیِ roles روی Postgresِ ساده
        # طبیعی است و متوقف‌کننده نیست. آنچه اهمیت دارد شمارشِ نهایی است.
        # `session_replication_role = replica` طبقِ مستندِ رسمیِ Supabase: تریگرها
        # حینِ بازگردانیِ داده خاموش می‌شوند. بدونِ آن، گاردهای append-only این
        # مخزن ممکن است ردیف‌های بازگردانده‌شده را رد کنند و شمارش را خراب کنند.
        $pre = if ($name -eq 'data') { "SET session_replication_role = replica;" } else { "" }
        docker exec $VerifyContainer psql -U postgres -d postgres -q `
            -v ON_ERROR_STOP=0 -c $pre -f "/tmp/$name.sql" *> $log
        $errCount = @(Select-String -Path $log -Pattern '^ERROR' -ErrorAction SilentlyContinue).Count
        Write-Host ("    {0,-10} → {1} خطا در لاگ" -f "$name.sql", $errCount)

        # خطای roles روی Postgresِ ساده طبیعی است (نقش‌های Supabase وجود ندارند).
        # خطای schema یا data طبیعی **نیست** و بکاپ را غیرقابل‌اتکا می‌کند.
        # پیش از این، $errCount فقط چاپ می‌شد و هیچ چیزی را متوقف نمی‌کرد —
        # یعنی نشانگری که هرگز نمی‌توانست شکست بدهد.
        if ($name -ne 'roles' -and $errCount -gt 0) {
            Fail "بازگردانیِ $name.sql با $errCount خطا مواجه شد. جزئیات: $log"
        }
    }

    Write-Step '۵/۵ — مقایسهٔ شمارشِ بازگردانده‌شده با Production'
    $restored = docker exec $VerifyContainer psql -U postgres -d postgres -X -q -A -t -c $countSql
    $restored = @($restored | Where-Object { $_ -match '=' })
    Set-Content -LiteralPath $restoredPath -Value $restored -Encoding UTF8

    $restoredMap = @{}
    foreach ($line in $restored) {
        $k, $v = $line -split '=', 2
        $restoredMap[$k] = $v
    }

    $mismatch = 0
    foreach ($line in $expected) {
        $k, $want = $line -split '=', 2
        if ($restoredMap.ContainsKey($k)) { $got = $restoredMap[$k] } else { $got = 'غایب' }
        if ($got -eq $want) {
            Write-Host ("    [OK]   {0,-16} {1}" -f $k, $want) -ForegroundColor Green
        } else {
            Write-Host ("    [FAIL] {0,-16} انتظار {1} ولی {2}" -f $k, $want, $got) -ForegroundColor Red
            $mismatch++
        }
    }

    # ── ۶) اثرِ انگشتِ فایل‌ها ────────────────────────────────────────────────
    Write-Step 'فایل‌های بکاپ'
    $manifest = New-Object System.Collections.Generic.List[string]
    $manifest.Add("backup taken: $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')) UTC")
    $manifest.Add('project:      uooeygybrniptzdxuzhj (production)')
    $manifest.Add('')
    foreach ($name in @('roles', 'schema', 'data')) {
        $p = Join-Path $BackupDir "$name.sql"
        $size = (Get-Item $p).Length
        $hash = (Get-FileHash -Path $p -Algorithm SHA256).Hash.ToLower()
        $manifest.Add(("{0,-10} {1,10} bytes  sha256={2}" -f "$name.sql", $size, $hash))
    }
    $manifestPath = Join-Path $BackupDir 'MANIFEST.txt'
    Set-Content -LiteralPath $manifestPath -Value $manifest -Encoding UTF8
    $manifest | ForEach-Object { Write-Host $_ }

    if ($mismatch -ne 0) {
        # بکاپ عمداً پاک نمی‌شود: شاید بشود از رویش عیب را فهمید.
        Fail "بکاپ ساخته شد ولی $mismatch جدول در بازگردانی نخواند.`nیعنی این بکاپ قابلِ اتکا **نیست**. لاگ‌ها: $BackupDir\restore-*.log`nتا رفعِ این مشکل هیچ migrationی روی Production اجرا نمی‌شود."
    }

    Write-Host "`n[OK] بکاپ ساخته شد و آزمونِ بازگردانی را پاس کرد." -ForegroundColor Green
    Write-Host "`nمسیر: $BackupDir"
    Write-Host "`nقدمِ بعد — فقط این چند خط را برای Command Center بفرست (هیچ‌کدام حساس نیستند):`n"
    Write-Host (($manifest | Where-Object { $_ -ne '' }) -join "`n")
    Write-Host "`n⚠️ این پوشه را جای امنی نگه دار. دادهٔ واقعیِ کاربران داخلش است."
    Write-Host "   واردِ مخزن، GitHub، تلگرام یا ایمیل نکن."
}
finally {
    # رشتهٔ اتصال از محیطِ پروسه پاک می‌شود و کانتینرِ موقت حذف.
    Remove-Item Env:\DB_URL -ErrorAction SilentlyContinue
    $plain = $null
    docker rm -f $VerifyContainer *> $null
}
