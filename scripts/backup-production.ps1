<#
.SYNOPSIS
    Manual production backup for Windows - free path, no plan upgrade.

.DESCRIPTION
    Persian step-by-step guide: docs/RUNBOOK-backup-windows.md

    -- THIS FILE IS DELIBERATELY ASCII-ONLY --------------------------------
    Windows PowerShell 5.1 reads a BOM-less UTF-8 file as the system ANSI
    code page. Non-ASCII characters then become mojibake, and any that land
    inside a string or a comment can swallow a quote or a brace, producing
    "missing closing brace" / "unterminated string" parse errors that point
    at innocent lines. That is exactly what happened on the owner's machine.

    Two independent protections, because one is not enough:
      1. the executable source contains no byte above 0x7F;
      2. the file is stored with a UTF-8 BOM.
    lib/ops/backup-scripts.test.ts fails if either is lost.

    Console output is therefore English. The Persian walkthrough lives in
    the runbook, which is Markdown and has no parser to break.

    -- MIRRORS scripts/backup-production.sh -------------------------------
    Both must behave identically. The test file compares their safety
    guards and goes red if one gains a guard the other lacks.

    -- RULES ENFORCED HERE -----------------------------------------------
      * The connection string is read with Read-Host -AsSecureString. It is
        never printed, never written to disk, never put in the manifest.
      * Backup files are written OUTSIDE any git repository; the script
        refuses to run if the destination is inside one.
      * The restore runs as ONE psql invocation, in ONE transaction, with
        ON_ERROR_STOP=1. Success is the process exit code, never a grep.
      * The restore target is an isolated local Supabase stack, not a plain
        Postgres container - plain Postgres lacks the managed auth/storage
        schemas that the data dump needs.
      * Verification compares exact row counts for every table plus a
        structural fingerprint, in BOTH directions.

    Remaining known leak: `supabase db dump` takes the connection string as
    an argument, so it is visible in the local process list while running.
    Fine on a personal laptop; do not run this on a shared machine.

    Prerequisites: Docker Desktop, Supabase CLI (or npx), Node.
#>

Set-StrictMode -Version 2.0

# ---- Why this is 'Continue' and not 'Stop' ---------------------------------
# On Windows PowerShell 5.1, ANY stderr output from an external program is
# turned into an ErrorRecord, and with $ErrorActionPreference = 'Stop' that
# record TERMINATES the script - even when the program succeeded and even
# when the stream was redirected with 2>$null.
#
# git, docker and the Supabase CLI all write ordinary progress and diagnostics
# to stderr. With 'Stop' this script died on its very first real run, inside
# the destination guard, on a `git rev-parse` that was behaving exactly as
# intended.
#
# Every external call below already checks $LASTEXITCODE explicitly and calls
# Die on failure, so 'Stop' was never what made this script safe. The exit
# codes are. Cleanup is guaranteed by the try/finally instead.
$ErrorActionPreference = 'Continue'

$Stamp      = Get-Date -Format 'yyyyMMdd-HHmmss'
$OutDir     = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { Join-Path $HOME "supabase-backups\prod-$Stamp" }
$RepoRoot   = Split-Path -Parent $PSScriptRoot
$SqlDir       = Join-Path $RepoRoot 'scripts\backup'
$InventorySql = Join-Path $SqlDir 'inventory.sql'
$AssertSql    = Join-Path $SqlDir 'assert-managed-schemas.sql'
$CompareJs    = Join-Path $SqlDir 'compare.mjs'

$VerifyId      = "prodverify$($Stamp -replace '-','')"
$VerifyWorkdir = Join-Path ([System.IO.Path]::GetTempPath()) $VerifyId
$PortBase      = 55000 + ((([int]($Stamp.Substring($Stamp.Length - 4))) % 900) * 10)

$PgImage = 'postgres:17-alpine'

function Say  { param([string]$Text) Write-Host "`n$Text" -ForegroundColor Cyan }
function Die  { param([string]$Text) Write-Host "`n[FAIL] $Text" -ForegroundColor Red; exit 1 }

# ---- 0) destination must be outside every git repository --------------------
# Deliberately the first check: it is the cheapest, and a wrong destination
# should be caught before Docker is started.
# Walk the directory chain looking for a .git entry. This used to shell out to
# `git rev-parse --git-dir`, which is the more thorough check, but it meant the
# guard depended on git being installed AND on git's stderr behaviour. Pure
# PowerShell has neither problem and cannot be killed by a stderr line.
function Test-InsideGitRepo {
    param([string]$Path)
    $dir = Get-Item -LiteralPath $Path -ErrorAction SilentlyContinue
    while ($null -ne $dir) {
        if (Test-Path -LiteralPath (Join-Path $dir.FullName '.git')) { return $true }
        $dir = $dir.Parent
    }
    return $false
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
if (Test-InsideGitRepo -Path $OutDir) {
    Die "Destination is inside a git repository: $OutDir`nA backup must never enter the repo. Set BACKUP_DIR to another path."
}

# ---- 1) prerequisites -------------------------------------------------------
function Test-Command { param([string]$Name) $null -ne (Get-Command $Name -ErrorAction SilentlyContinue) }

if (-not (Test-Command 'docker')) { Die 'Docker is not installed. The Supabase CLI needs it to start the stack.' }
& docker info 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { Die 'Docker is installed but not running. Open Docker Desktop.' }
if (-not (Test-Command 'node')) { Die 'Node is not installed. The structural comparison needs it.' }
if (-not (Test-Path $InventorySql)) { Die "Missing file: $InventorySql" }
if (-not (Test-Path $AssertSql))    { Die "Missing file: $AssertSql" }
if (-not (Test-Path $CompareJs))    { Die "Missing file: $CompareJs" }

# On Windows, `npx` resolves to npx.ps1 under some setups, which cannot be
# invoked as a native command and fails in confusing ways. Prefer the real
# executable: supabase.exe first, then npx.cmd.
$SupaExe  = $null
$SupaArgs = @()
if (Test-Command 'supabase') {
    $SupaExe = (Get-Command 'supabase').Source
} elseif (Test-Command 'npx.cmd') {
    $SupaExe = (Get-Command 'npx.cmd').Source
    $SupaArgs = @('--yes', 'supabase')
} else {
    Die 'Neither `supabase` nor `npx.cmd` was found. One of them is required.'
}

function Invoke-Supabase {
    param([string[]]$Arguments)
    & $SupaExe @($SupaArgs + $Arguments)
    return $LASTEXITCODE
}

# ---- 2) connection string: prompted, never stored ---------------------------
Write-Host @'

Copy the production connection string from the dashboard:
  Supabase Dashboard -> project -> Connect -> Session pooler or Direct connection

Nothing is echoed while you type. The value is not stored, not printed, and
does not stay in shell history. DO NOT paste it into a chat.

'@

$secure = Read-Host -Prompt 'connection string' -AsSecureString
$bstr   = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $DbUrl = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
if ([string]::IsNullOrWhiteSpace($DbUrl)) { Die 'Nothing was entered.' }

# The value is passed to containers through the environment, never on argv.
$env:DB_URL = $DbUrl

# ---- cleanup on every exit path --------------------------------------------
# Success, ordinary failure, partial startup and Ctrl-C all land here. A
# leaked stack holds ports open AND keeps production data on disk.
function Invoke-Cleanup {
    if (Test-Path $VerifyWorkdir) {
        Say 'Cleaning up the temporary stack'
        Invoke-Supabase @('stop', '--workdir', $VerifyWorkdir, '--no-backup', '--yes') | Out-Null
        Remove-Item -Recurse -Force $VerifyWorkdir -ErrorAction SilentlyContinue
    }
    $env:DB_URL = $null
}

$restoreExit = -1
$compareExit = -1

try {
    # ---- 3) source fingerprint, before the dump -----------------------------
    # The connection string is expanded INSIDE the container, so it never
    # reaches the host argv or the process list. The SQL file is mounted
    # rather than piped: Windows PowerShell 5.1 encodes pipeline text to a
    # native process using $OutputEncoding, which defaults to ASCII, and
    # inventory.sql contains Persian comments. Piping it would corrupt them.
    Say '1/5 - reading the production fingerprint (read only)'
    & docker run --rm -e DB_URL -v "${SqlDir}:/sql:ro" --entrypoint sh $PgImage `
        -c 'psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f /sql/inventory.sql' |
        Set-Content -Encoding UTF8 (Join-Path $OutDir 'inventory-source.txt')
    if ($LASTEXITCODE -ne 0) { Die 'Could not connect to production or read the fingerprint.' }
    $sourceRows = (Get-Content (Join-Path $OutDir 'inventory-source.txt')).Count
    Write-Host "    $sourceRows inventory rows recorded"

    # ---- 4) the three dump files, per the official Supabase method ----------
    Say '2/5 - taking the backup (roles / schema / data)'
    if ((Invoke-Supabase @('db', 'dump', '--db-url', $DbUrl, '-f', (Join-Path $OutDir 'roles.sql'), '--role-only')) -ne 0) { Die 'roles dump failed.' }
    if ((Invoke-Supabase @('db', 'dump', '--db-url', $DbUrl, '-f', (Join-Path $OutDir 'schema.sql'))) -ne 0) { Die 'schema dump failed.' }
    if ((Invoke-Supabase @('db', 'dump', '--db-url', $DbUrl, '-f', (Join-Path $OutDir 'data.sql'), '--use-copy', '--data-only', '-x', 'storage.buckets_vectors', '-x', 'storage.vector_indexes')) -ne 0) { Die 'data dump failed.' }

    foreach ($name in @('roles', 'schema', 'data')) {
        $path = Join-Path $OutDir "$name.sql"
        if (-not (Test-Path $path) -or (Get-Item $path).Length -eq 0) { Die "$name.sql is empty - the backup is incomplete." }
    }

    # ---- 5) isolated local Supabase stack -----------------------------------
    # A plain postgres container is NOT a faithful target: the schema dump
    # omits managed schemas such as auth and storage, while the data dump
    # contains their data (auth.users). On plain Postgres those tables do
    # not exist, so the restore either breaks or hides the breakage.
    Say "3/5 - starting an isolated local Supabase stack ($VerifyId)"
    New-Item -ItemType Directory -Force -Path $VerifyWorkdir | Out-Null
    if ((Invoke-Supabase @('init', '--workdir', $VerifyWorkdir, '--yes')) -ne 0) { Die 'supabase init failed in the temp workdir.' }

    # Unique ports, so the owner's own local project is never touched.
    $config = Join-Path $VerifyWorkdir 'supabase\config.toml'
    if (-not (Test-Path $config)) { Die 'config.toml was not created.' }
    $seen = @{}
    $next = $PortBase
    $lines = Get-Content $config | ForEach-Object {
        if ($_ -match '^\s*port\s*=\s*(\d+)') {
            $original = $matches[1]
            if (-not $seen.ContainsKey($original)) { $seen[$original] = $next; $next = $next + 1 }
            $_ -replace '^\s*port\s*=\s*\d+', "port = $($seen[$original])"
        } else { $_ }
    }
    Set-Content -Path $config -Value $lines -Encoding UTF8

    if ((Invoke-Supabase @('start', '--workdir', $VerifyWorkdir)) -ne 0) { Die 'The local Supabase stack did not start.' }

    $statusEnv = & $SupaExe @($SupaArgs + @('status', '--workdir', $VerifyWorkdir, '-o', 'env'))
    $verifyUrl = $null
    foreach ($line in $statusEnv) {
        if ($line -match '^DB_URL="(.*)"$') { $verifyUrl = $matches[1] }
    }
    if ([string]::IsNullOrWhiteSpace($verifyUrl)) { Die 'Could not read the local stack database URL.' }

    # Managed schemas must exist BEFORE the restore, otherwise the target is
    # missing something the data dump needs.
    & docker run --rm --network host -e DB_URL=$verifyUrl -v "${SqlDir}:/sql:ro" --entrypoint sh $PgImage `
        -c 'psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f /sql/assert-managed-schemas.sql'
    if ($LASTEXITCODE -ne 0) {
        Die 'The restore target lacks the managed schemas. It is not faithful, so a restore there would prove nothing.'
    }

    # ---- 6) atomic restore --------------------------------------------------
    # One psql invocation, one transaction, ON_ERROR_STOP=1, official order:
    # roles -> schema -> session_replication_role=replica -> data.
    #
    # Success is the EXIT CODE. The previous version appended `|| true` and
    # then grepped the log for '^ERROR', but file-based psql errors start
    # with 'psql:/path/file.sql:123: ERROR:', not with 'ERROR'. That made an
    # indicator that could never go red.
    #
    # Note also that -c is supplied ONLY for the data step, as part of this
    # single invocation. The previous version always passed -c "" for roles
    # and schema; Windows PowerShell 5.1 can drop an empty native argument,
    # which shifts -f into the value position for -c.
    Say '4/5 - restoring in a single transaction (ON_ERROR_STOP=1)'
    $restoreLog = Join-Path $OutDir 'restore.log'
    & docker run --rm --network host -e DB_URL=$verifyUrl -v "${OutDir}:/backup:ro" --entrypoint sh $PgImage `
        -c 'psql --single-transaction --variable ON_ERROR_STOP=1 --file /backup/roles.sql --file /backup/schema.sql --command "SET session_replication_role = replica" --file /backup/data.sql --dbname "$DB_URL"' *> $restoreLog
    $restoreExit = $LASTEXITCODE
    if ($restoreExit -ne 0) {
        Write-Host '    last log lines:'
        Get-Content $restoreLog -Tail 20 | ForEach-Object { Write-Host "      $_" }
        Die "Restore failed with exit code $restoreExit. The whole transaction rolled back.`nLog: $restoreLog`nThe backup is NOT reliable. No migration runs on production."
    }
    Write-Host '    restore finished with exit code 0.'

    # ---- 7) bidirectional comparison ---------------------------------------
    Say '5/5 - comparing row counts and the structural fingerprint'
    & docker run --rm --network host -e DB_URL=$verifyUrl -v "${SqlDir}:/sql:ro" --entrypoint sh $PgImage `
        -c 'psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f /sql/inventory.sql' |
        Set-Content -Encoding UTF8 (Join-Path $OutDir 'inventory-restored.txt')
    if ($LASTEXITCODE -ne 0) { Die 'Could not read the fingerprint of the restored database.' }

    & node $CompareJs (Join-Path $OutDir 'inventory-source.txt') (Join-Path $OutDir 'inventory-restored.txt') --report (Join-Path $OutDir 'comparison.txt')
    $compareExit = $LASTEXITCODE

    # ---- 8) manifest - non-sensitive only -----------------------------------
    $verdict = if ($compareExit -eq 0) { 'PASS' } else { 'FAIL' }
    $cliVersion = (& $SupaExe @($SupaArgs + @('--version')) | Select-Object -Last 1)
    $manifest = New-Object System.Collections.Generic.List[string]
    $manifest.Add("backup taken:   $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')) UTC")
    $manifest.Add('project ref:    uooeygybrniptzdxuzhj (production)')
    $manifest.Add("supabase cli:   $cliVersion")
    $manifest.Add("verify target:  isolated local Supabase stack ($VerifyId)")
    $manifest.Add('restore method: single psql invocation, --single-transaction, ON_ERROR_STOP=1')
    $manifest.Add("restore exit:   $restoreExit")
    $manifest.Add('verification:   dynamic row counts (public+auth+storage) + structural fingerprint, both directions')
    $manifest.Add('exclusions:     storage.buckets_vectors, storage.vector_indexes (documented)')
    $manifest.Add("inventory rows: $sourceRows")
    $manifest.Add("result:         $verdict")
    $manifest.Add('')
    foreach ($name in @('roles', 'schema', 'data')) {
        $path = Join-Path $OutDir "$name.sql"
        $size = (Get-Item $path).Length
        $hash = (Get-FileHash -Algorithm SHA256 $path).Hash.ToLower()
        $manifest.Add(('{0,-10} {1,12} bytes  sha256={2}' -f "$name.sql", $size, $hash))
    }
    $manifestPath = Join-Path $OutDir 'MANIFEST.txt'
    Set-Content -Path $manifestPath -Value $manifest -Encoding UTF8
    Get-Content $manifestPath | ForEach-Object { Write-Host $_ }

    if ($compareExit -ne 0) {
        Die "The backup was created but the comparison did not match.`nDetails: $(Join-Path $OutDir 'comparison.txt')`nThe backup is NOT reliable. No migration runs on production."
    }

    Write-Host ''
    Write-Host '[OK] Backup created AND it passed the restore test.' -ForegroundColor Green
    Write-Host ''
    Write-Host "Path: $OutDir"
    Write-Host ''
    Write-Host 'Next step: send only MANIFEST.txt to Claude. None of its lines are'
    Write-Host 'sensitive - no connection string, no password, no user data.'
    Write-Host ''
    Write-Host 'Keep this folder safe. It contains real user data. Do not put it in'
    Write-Host 'the repo, GitHub, Telegram or email.'
}
finally {
    Invoke-Cleanup
}
