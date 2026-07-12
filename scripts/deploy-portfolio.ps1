# deploy-portfolio.ps1
# اجرا: راست-کلیک → Run with PowerShell
# ─────────────────────────────────────────────────────────────────────────────
# این اسکریپت secrets را از فایل .env.deploy (کنار خودش) می‌خواند.
# هرگز secrets را hardcode نکنید و .env.deploy را به git اضافه نکنید.
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

# ─── خواندن .env.deploy ──────────────────────────────────────────────────────
$envFile = Join-Path $PSScriptRoot ".env.deploy"

if (-not (Test-Path $envFile)) {
    Write-Host @"

خطا: فایل .env.deploy پیدا نشد!

لطفاً فایل .env.deploy را کنار اسکریپت بسازید با محتوای زیر:

    VERCEL_TOKEN=vcp_xxxx
    VERCEL_PROJECT_ID=prj_xxxx
    VERCEL_TEAM_ID=team_xxxx
    CRON_SECRET=xxxx
    GITHUB_REPO_ID=1234567890

"@ -ForegroundColor Red
    Read-Host "Enter بزن برای خروج"
    exit 1
}

# پارس فایل .env.deploy
$envVars = @{}
Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        $parts = $line -split "=", 2
        if ($parts.Count -eq 2) {
            $envVars[$parts[0].Trim()] = $parts[1].Trim()
        }
    }
}

# اعتبارسنجی متغیرهای الزامی
$required = @("VERCEL_TOKEN", "VERCEL_PROJECT_ID", "VERCEL_TEAM_ID", "CRON_SECRET", "GITHUB_REPO_ID")
foreach ($key in $required) {
    if (-not $envVars[$key]) {
        Write-Host "خطا: متغیر $key در .env.deploy تعریف نشده!" -ForegroundColor Red
        Read-Host "Enter بزن برای خروج"
        exit 1
    }
}

$TOKEN   = $envVars["VERCEL_TOKEN"]
$PROJ    = $envVars["VERCEL_PROJECT_ID"]
$TEAM    = $envVars["VERCEL_TEAM_ID"]
$SECRET  = $envVars["CRON_SECRET"]
$REPO_ID = $envVars["GITHUB_REPO_ID"]

$headers = @{
    Authorization  = "Bearer $TOKEN"
    "Content-Type" = "application/json"
}

# ─── گام ۰: شناسایی آخرین commit از git ─────────────────────────────────────
Write-Host "`n=== گام ۰: شناسایی آخرین commit ===" -ForegroundColor Cyan

$repoRoot = Split-Path $PSScriptRoot -Parent
$latestCommit = ""
try {
    Push-Location $repoRoot
    $latestCommit = (git rev-parse HEAD 2>$null).Trim()
    Pop-Location
} catch {
    Pop-Location
}

if ($latestCommit) {
    $shortCommit = $latestCommit.Substring(0, 7)
    Write-Host "آخرین commit محلی: $shortCommit ($latestCommit)" -ForegroundColor Green
} else {
    Write-Host "هشدار: نتوانستم commit فعلی را از git بخوانم." -ForegroundColor Yellow
    $shortCommit = ""
}

# ─── گام ۱: بررسی CRON_SECRET ────────────────────────────────────────────────
Write-Host "`n=== گام ۱: بررسی CRON_SECRET ===" -ForegroundColor Cyan

$envList = Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/$PROJ/env?teamId=$TEAM" `
    -Headers $headers -Method GET

$existing = $envList.envs | Where-Object { $_.key -eq "CRON_SECRET" }

if ($existing) {
    Write-Host "CRON_SECRET از قبل موجود بود — دست نخوردیم." -ForegroundColor Yellow
} else {
    Write-Host "CRON_SECRET پیدا نشد — در حال ست کردن..." -ForegroundColor Green
    $body = @{
        key    = "CRON_SECRET"
        value  = $SECRET
        type   = "encrypted"
        target = @("production")
    } | ConvertTo-Json

    Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/$PROJ/env?teamId=$TEAM" `
        -Headers $headers -Method POST -Body $body | Out-Null

    Write-Host "CRON_SECRET با موفقیت ست شد." -ForegroundColor Green
}

# ─── گام ۲: ساخت Deploy جدید از main ────────────────────────────────────────
Write-Host "`n=== گام ۲: ساخت Deploy جدید از main ===" -ForegroundColor Cyan

$deployBody = @{
    name      = "portfolio-platform"
    target    = "production"
    gitSource = @{
        type   = "github"
        ref    = "main"
        repoId = $REPO_ID
    }
} | ConvertTo-Json -Depth 5

$deploy = Invoke-RestMethod `
    -Uri "https://api.vercel.com/v13/deployments?teamId=$TEAM&forceNew=1" `
    -Headers $headers -Method POST -Body $deployBody

$deployId  = $deploy.id
$deployUrl = $deploy.url

Write-Host "Deploy شروع شد: $deployId" -ForegroundColor Green
Write-Host "URL: https://$deployUrl"

# ─── گام ۳: انتظار برای READY شدن ───────────────────────────────────────────
Write-Host "`n=== منتظر READY شدن... ===" -ForegroundColor Cyan

$maxWait = 300  # 5 دقیقه
$elapsed = 0
$state   = ""

while ($elapsed -lt $maxWait) {
    Start-Sleep -Seconds 10
    $elapsed += 10

    $status = Invoke-RestMethod `
        -Uri "https://api.vercel.com/v13/deployments/$deployId`?teamId=$TEAM" `
        -Headers $headers -Method GET

    $state = $status.readyState
    Write-Host "[$elapsed s] وضعیت: $state"

    if ($state -eq "READY" -or $state -eq "ERROR" -or $state -eq "CANCELED") {
        break
    }
}

# ─── نتیجه ───────────────────────────────────────────────────────────────────
Write-Host "`n=== نتیجه ===" -ForegroundColor Cyan
Write-Host "Deploy ID : $deployId"
Write-Host "وضعیت نهایی: $state"
Write-Host "URL Deploy : https://$deployUrl"

if ($state -eq "READY") {
    Write-Host "`nموفق! Deploy آماده است." -ForegroundColor Green

    # بررسی commit
    $meta   = $status.meta
    $commit = $meta.githubCommitSha

    if ($commit) {
        $deployShort = $commit.Substring(0, 7)
        Write-Host "Commit مستقرشده: $deployShort ($commit)"

        if ($shortCommit -and $commit.StartsWith($shortCommit)) {
            Write-Host "✓ commit صحیح است (مطابق با HEAD محلی)" -ForegroundColor Green
        } elseif ($shortCommit) {
            Write-Host "⚠ commit دیپلوی ($deployShort) با HEAD محلی ($shortCommit) متفاوت است — آیا push کردید؟" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "Deploy ناموفق یا لغو شد. لاگ را در Vercel Dashboard بررسی کنید." -ForegroundColor Red
}

Write-Host "`nاسکریپت تمام شد."
Read-Host "Enter بزن برای خروج"
