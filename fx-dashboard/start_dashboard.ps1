# ============================================================================
#  Gold/FX Dashboard - robust always-available launcher
#  - Idempotent: if already running, just opens the browser.
#  - Frees a stale port, sets UTF-8, launches Streamlit hidden, waits for health.
#  Usage:  start_dashboard.ps1            (start + open browser)
#          start_dashboard.ps1 -NoBrowser (start only, for auto-start at login)
# ============================================================================
param([switch]$NoBrowser)

$ErrorActionPreference = "SilentlyContinue"

$Port   = 8501
# Resolve the dashboard directory from this script's own location (no hardcoded path)
$Dir    = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Url    = "http://localhost:$Port"
$Health = "$Url/_stcore/health"

function Test-Up {
    try { return (Invoke-WebRequest $Health -TimeoutSec 3 -UseBasicParsing).StatusCode -eq 200 }
    catch { return $false }
}

if (-not (Test-Up)) {
    # Free the port if a dead/zombie process is holding it
    foreach ($c in (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) {
        try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue } catch {}
    }

    $env:PYTHONUTF8 = "1"
    $env:PYTHONIOENCODING = "utf-8"
    $py = (Get-Command python -ErrorAction SilentlyContinue).Source
    if (-not $py) { $py = "python" }

    $args = @("-X","utf8","-m","streamlit","run","app.py",
              "--server.port","$Port","--server.headless","true",
              "--browser.gatherUsageStats","false")

    Start-Process -FilePath $py -ArgumentList $args -WorkingDirectory $Dir -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $Dir "dashboard_run.log") `
        -RedirectStandardError  (Join-Path $Dir "dashboard_run.err.log")

    # Wait up to ~30s for the server to become healthy
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 750
        if (Test-Up) { break }
    }
}

if (-not $NoBrowser) { Start-Process $Url }
