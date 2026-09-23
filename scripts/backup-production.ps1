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

    Remaining known leak, local-machine only: `supabase db dump` takes the
    connection string as an argument, so it is visible in a process list
    while running. psql no longer receives the password in argv (see
    scripts/backup/pgurl.sh); it gets it through PGPASSWORD, readable only by
    root in the container. Fine on a personal laptop; do not run this on a
    shared machine.

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

# UTF-8 WITHOUT a BOM, on every PowerShell version. Windows PowerShell 5.1's
# `Set-Content -Encoding UTF8` writes a BOM (PowerShell 7 does not), so a file
# written here on Windows did not compare equal to the same file written on
# Linux, and the Supabase CLI had to parse a config.toml that began with one.
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
function Write-Utf8NoBom {
    param([string]$Path, [string[]]$Lines)
    [System.IO.File]::WriteAllLines($Path, $Lines, $Utf8NoBom)
}

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

# Windows PowerShell 5.1 encodes pipeline text to a native process using
# $OutputEncoding, which defaults to ASCII. The connection string travels by
# stdin, so make that encoding explicit rather than assumed.
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$DbUrl = $DbUrl.Trim()
if ($DbUrl -notmatch '^postgres(ql)?://') {
    Die 'That does not look like a connection string. It must start with postgresql:// or postgres://'
}

# ---- How the secret reaches psql ------------------------------------------
# Through the container's STDIN, read into a shell variable, and nowhere else.
#
# The previous version used `docker run -e DB_URL` passthrough. On the owner's
# machine the variable did not arrive: psql saw an empty conninfo and silently
# fell back to the local unix socket, producing a "connection to server on
# socket /var/run/postgresql/.s.PGSQL.5432 failed" that looks nothing like the
# real cause.
#
# stdin keeps the value out of the `docker run` command line and out of
# `docker inspect`, which an environment variable would not.
#
# Everything that happens to the value INSIDE the container lives in ONE file,
# scripts/backup/pgurl.sh, shared with backup-production.sh so there are not
# two fixes drifting apart (B-057). It strips the CR that a Windows pipe adds,
# stops with exit 64 on an empty or non-URI line before psql can fall back to
# the local socket, and moves the password into PGPASSWORD so it is no longer
# in psql's argv. `-w` makes psql fail instead of waiting for a prompt.
function Invoke-PsqlWithUrl {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$PsqlArgs,
        [string[]]$DockerArgs = @()
    )
    # `;` not `&&`: a sourced file that calls `exit` ends the whole shell, and a
    # missing file is a fatal error for `.`, so psql never runs in either case
    # (measured on busybox and dash). `&&` is also banned by the PS 5.1 guard.
    #
    # NO DOUBLE QUOTES in anything handed to a native command. Windows
    # PowerShell 5.1 does not escape them when it builds the command line:
    # '... -w "$PGURL" -c "SELECT 1"' reached docker split into two arguments
    # and psql received `-c SELECT`. Reproduced with PowerShell 7.4 under
    # $PSNativeCommandArgumentPassing = 'Legacy'. The URI is quoted inside sh,
    # by pgurl_psql in pgurl.sh; callers use single quotes only.
    if ($PsqlArgs.Contains('"')) { Die 'internal: psql arguments must not contain double quotes (Windows PowerShell 5.1).' }
    $inner = '. /sql/pgurl.sh; pgurl_psql ' + $PsqlArgs
    $Url | & docker run --rm -i -v "${SqlDir}:/sql:ro" @DockerArgs --entrypoint sh $PgImage -c $inner
}

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
    # Fail fast and unambiguously before anything expensive happens.
    Say '1/5 - checking the connection, then reading the production fingerprint'
    $probe = Invoke-PsqlWithUrl -Url $DbUrl -PsqlArgs '-X -q -t -A -c ''SELECT 1'''
    if ($LASTEXITCODE -ne 0 -or ("$probe".Trim() -ne '1')) {
        Die "Could not connect to production with that connection string.`nCheck it in Supabase Dashboard -> Connect. Nothing was written."
    }
    Write-Host '    connection OK'

    # psql writes the file itself (-o into a mounted folder). Piping psql's
    # output through PowerShell would decode it with the console code page on
    # 5.1 and re-encode it, so the bytes on disk would not be the bytes psql
    # produced.
    Invoke-PsqlWithUrl -Url $DbUrl -DockerArgs @('-v', "${OutDir}:/out") `
        -PsqlArgs '-X -q -v ON_ERROR_STOP=1 -f /sql/inventory.sql -o /out/inventory-source.txt'
    if ($LASTEXITCODE -ne 0) { Die 'Connected, but could not read the production fingerprint.' }
    $sourceRows = [System.IO.File]::ReadAllLines((Join-Path $OutDir 'inventory-source.txt'), $Utf8NoBom).Count
    Write-Host "    $sourceRows inventory rows recorded"

    # ---- 4) the three dump files, per the official Supabase method ----------
    Say '2/5 - taking the backup (roles / schema / data)'
    if ((Invoke-Supabase @('db', 'dump', '--db-url', $DbUrl, '-f', (Join-Path $OutDir 'roles.sql'), '--role-only')) -ne 0) { Die 'roles dump failed.' }
    if ((Invoke-Supabase @('db', 'dump', '--db-url', $DbUrl, '-f', (Join-Path $OutDir 'schema.sql'))) -ne 0) { Die 'schema dump failed.' }
    if ((Invoke-Supabase @('db', 'dump', '--db-url', $DbUrl, '-f', (Join-Path $OutDir 'data.sql'), '--use-copy', '--data-only', '-x', 'storage.buckets_vectors', '-x', 'storage.vector_indexes')) -ne 0) { Die 'data dump failed.' }

    # ---- 4b) source fingerprint AGAIN, after the dump -----------------------
    # Production keeps writing during the dump: the relay stores a snapshot
    # every five minutes and symbol_history takes over a thousand rows a day.
    # Without this second read the comparison fails a perfectly good backup,
    # and an operator who sees that learns to ignore the comparison - which is
    # worse than not having one.
    #
    # This is not a waiver, it is a measurement: a table that moved between the
    # two reads is proven to have been live in that window. A count outside the
    # range - especially BELOW it - is still a failure.
    Invoke-PsqlWithUrl -Url $DbUrl -DockerArgs @('-v', "${OutDir}:/out") `
        -PsqlArgs '-X -q -v ON_ERROR_STOP=1 -f /sql/inventory.sql -o /out/inventory-source-after.txt'
    if ($LASTEXITCODE -ne 0) { Die 'Could not read the second production fingerprint.' }

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
    $lines = [System.IO.File]::ReadAllLines($config, $Utf8NoBom) | ForEach-Object {
        if ($_ -match '^\s*port\s*=\s*(\d+)') {
            $original = $matches[1]
            if (-not $seen.ContainsKey($original)) { $seen[$original] = $next; $next = $next + 1 }
            $_ -replace '^\s*port\s*=\s*\d+', "port = $($seen[$original])"
        } else { $_ }
    }
    Write-Utf8NoBom -Path $config -Lines $lines

    if ((Invoke-Supabase @('start', '--workdir', $VerifyWorkdir)) -ne 0) { Die 'The local Supabase stack did not start.' }

    $statusEnv = & $SupaExe @($SupaArgs + @('status', '--workdir', $VerifyWorkdir, '-o', 'env'))
    $verifyUrl = $null
    foreach ($line in $statusEnv) {
        if ($line -match '^DB_URL="(.*)"$') { $verifyUrl = $matches[1] }
    }
    if ([string]::IsNullOrWhiteSpace($verifyUrl)) { Die 'Could not read the local stack database URL.' }
    # The throwaway stack's own password (the CLI default), not a secret. It is
    # only used inside the database container.
    $localPw = $null
    if ($verifyUrl -match '^postgres(ql){0,1}://[^:/@]+:([A-Za-z0-9._~-]+)@') { $localPw = $matches[2] }
    if ([string]::IsNullOrWhiteSpace($localPw)) { Die 'Could not read the local stack password from its status.' }

    # ---- 5b) no published port on a public interface ------------------------
    # The Supabase CLI publishes its ports on every interface by default, so a
    # stack holding REAL member data would be reachable from the local network.
    # Production data goes in ONLY if every published port is bound to
    # 127.0.0.1. Otherwise stop here, before anything is restored.
    $ports = @(& docker ps --filter "name=$VerifyId" --format '{{.Names}}|{{.Ports}}')
    if ($LASTEXITCODE -ne 0) { Die 'Could not list the local stack containers.' }
    $public = @($ports | Where-Object { $_ -match '(^|[|, ])(0\.0\.0\.0|\[::\]|::):\d+->' })
    if ($public.Count -gt 0) {
        Die ("The local stack publishes ports on every network interface:`n    " + ($public -join "`n    ") +
            "`nNo production data was restored into it.`nFix once: Docker Desktop -> Settings -> Docker Engine -> add`n    `"ip`": `"127.0.0.1`"`nApply & restart, then run this script again.")
    }
    $dbContainer = "supabase_db_$VerifyId"
    if (-not ($ports | Where-Object { $_ -like "$dbContainer|*" })) { Die "The database container $dbContainer was not found." }
    Write-Host '    every published port is bound to 127.0.0.1'

    # Everything below runs INSIDE the database container with `docker exec`:
    # no --network host (unreliable on Docker Desktop), no published port, and
    # psql is the server's own version. Files go in and out with `docker cp`,
    # so their bytes are never re-encoded by PowerShell.
    #
    # Connect as supabase_admin: roles.sql sets role parameters such as
    # log_min_messages that only a superuser may set. The same restore as
    # `postgres` fails there (measured by Codex on an isolated stack).
    function Invoke-InDb {
        param([string]$Command)
        if ($Command.Contains('"')) { Die 'internal: in-container commands must not contain double quotes (Windows PowerShell 5.1).' }
        & docker exec $dbContainer sh -c ("PGPASSWORD='$localPw' psql -h 127.0.0.1 -U supabase_admin -d postgres -X -q " + $Command)
    }
    & docker exec $dbContainer mkdir -p /tmp/restore
    if ($LASTEXITCODE -ne 0) { Die 'Could not prepare the local database container.' }
    foreach ($file in @((Join-Path $OutDir 'roles.sql'), (Join-Path $OutDir 'schema.sql'), (Join-Path $OutDir 'data.sql'), $AssertSql, $InventorySql)) {
        & docker cp $file "${dbContainer}:/tmp/restore/"
        if ($LASTEXITCODE -ne 0) { Die "Could not copy $(Split-Path -Leaf $file) into the local database container." }
    }

    # Managed schemas must exist BEFORE the restore, otherwise the target is
    # missing something the data dump needs.
    Invoke-InDb '-v ON_ERROR_STOP=1 -f /tmp/restore/assert-managed-schemas.sql'
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
    Say '4/5 - restoring in a single transaction (ON_ERROR_STOP=1, as supabase_admin)'
    $restoreLog = Join-Path $OutDir 'restore.log'
    Invoke-InDb ('--single-transaction --variable ON_ERROR_STOP=1 --file /tmp/restore/roles.sql --file /tmp/restore/schema.sql ' +
        '--command ''SET session_replication_role = replica'' --file /tmp/restore/data.sql > /tmp/restore/restore.log 2>&1')
    $restoreExit = $LASTEXITCODE
    & docker cp "${dbContainer}:/tmp/restore/restore.log" $restoreLog | Out-Null
    if ($restoreExit -ne 0) {
        Write-Host '    last log lines:'
        if (Test-Path $restoreLog) { [System.IO.File]::ReadAllLines($restoreLog, $Utf8NoBom) | Select-Object -Last 20 | ForEach-Object { Write-Host "      $_" } }
        Die "Restore failed with exit code $restoreExit. The whole transaction rolled back.`nLog: $restoreLog`nThe backup is NOT reliable. No migration runs on production."
    }
    Write-Host '    restore finished with exit code 0.'

    # ---- 7) bidirectional comparison ---------------------------------------
    Say '5/5 - comparing row counts and the structural fingerprint'
    Invoke-InDb '-v ON_ERROR_STOP=1 -f /tmp/restore/inventory.sql -o /tmp/restore/inventory-restored.txt'
    if ($LASTEXITCODE -ne 0) { Die 'Could not read the fingerprint of the restored database.' }
    & docker cp "${dbContainer}:/tmp/restore/inventory-restored.txt" (Join-Path $OutDir 'inventory-restored.txt')
    if ($LASTEXITCODE -ne 0) { Die 'Could not copy the restored fingerprint out of the container.' }

    & node $CompareJs (Join-Path $OutDir 'inventory-source.txt') (Join-Path $OutDir 'inventory-restored.txt') --source-after (Join-Path $OutDir 'inventory-source-after.txt') --report (Join-Path $OutDir 'comparison.txt')
    $compareExit = $LASTEXITCODE

    # ---- 8) manifest - non-sensitive only -----------------------------------
    # Three states, not two. "Unverified" is neither PASS nor FAIL, and
    # neither one may hide the other.
    $verdict = switch ($compareExit) {
        0       { 'PASS (structure verified - row counts exactly equal)' }
        2       { 'PARTIAL (structure verified - row-count equality NOT proven)' }
        default { 'FAIL' }
    }
    $cliVersion = (& $SupaExe @($SupaArgs + @('--version')) | Select-Object -Last 1)
    $manifest = New-Object System.Collections.Generic.List[string]
    $manifest.Add("backup taken:   $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')) UTC")
    $manifest.Add('project ref:    uooeygybrniptzdxuzhj (production)')
    $manifest.Add("supabase cli:   $cliVersion")
    $manifest.Add("verify target:  isolated local Supabase stack ($VerifyId)")
    $manifest.Add('restore method: docker exec in the db container, supabase_admin, one psql invocation, --single-transaction, ON_ERROR_STOP=1')
    $manifest.Add('local ports:    every published port bound to 127.0.0.1 (checked before restore)')
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
    Write-Utf8NoBom -Path $manifestPath -Lines $manifest.ToArray()
    Get-Content $manifestPath | ForEach-Object { Write-Host $_ }

    if ($compareExit -eq 2) {
        Write-Host ''
        Write-Host '[PARTIAL] Backup created, restore worked, structure verified -' -ForegroundColor Yellow
        Write-Host '          but row-count equality for the tables that were live' -ForegroundColor Yellow
        Write-Host '          during the dump was NOT proven.' -ForegroundColor Yellow
        Write-Host ''
        Write-Host 'This is NOT a PASS. The backup is probably sound; we cannot prove it.'
        Write-Host 'Until the inventory can be read in the dump own snapshot, this state'
        Write-Host 'does not on its own authorise a production migration.'
        Write-Host ''
        Write-Host "Details: $(Join-Path $OutDir 'comparison.txt')"
        Write-Host "Path: $OutDir"
        exit 2
    }

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
