# run-case.ps1 - acceptance harness for scripts/backup-production.ps1 on Windows.
#
#   powershell -File scripts\backup\acceptance\run-case.ps1 -Case <name> -InputText <text>
#       [-Fault midrestore|dropnotes|empty] [-Keep] [-Shim] [-OutRoot <dir>]
#
# Runs the backup script UNCHANGED in Windows PowerShell 5.1, in its own
# console window, and types InputText into that console's hidden
# `Read-Host -AsSecureString` prompt through coninject.ps1 (it writes key
# events into that one console's input buffer: no window focus involved, no
# stdin pipe - the same code path an operator's keyboard takes).
#
# SYNTHETIC DATA ONLY. Use setup-source.sh first; never point this at
# production. See docs/ops/BACKUP-RUN-CARD.md for what was run and seen.
# ASCII only.
param(
    [Parameter(Mandatory = $true)][string]$Case,
    [string]$InputText = '',
    [string]$Fault = '',
    [switch]$Keep,
    [switch]$Shim,
    [string]$OutRoot = "$env:USERPROFILE\bk-acceptance"
)
$here = $PSScriptRoot
$repo = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $here))
$out  = Join-Path $OutRoot "out\$Case"
if (Test-Path $out) { throw "output dir exists: $out" }
New-Item -ItemType Directory -Force $out | Out-Null
$env:BACKUP_DIR = $out
$env:BK_FAULT = $Fault
$env:BACKUP_KEEP_VERIFY_STACK = $(if ($Keep) { '1' } else { '' })
$savedPath = $env:PATH
if ($Shim) { $env:PATH = "$here\shim;$env:PATH" }
$cmd = Join-Path $OutRoot "case-$Case.cmd"
Set-Content $cmd -Encoding ASCII -Value ("@echo off`r`ntitle bk-accept-$Case`r`n" +
  "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$repo\scripts\backup-production.ps1`" > `"$out\console.log`" 2>&1`r`n" +
  "echo %errorlevel% > `"$out\rc.txt`"")
$started = Get-Date
$p = Start-Process cmd.exe -ArgumentList "/c `"$cmd`"" -PassThru
$env:PATH = $savedPath
$child = $null
for ($i = 0; $i -lt 240; $i++) {
  Start-Sleep -Milliseconds 500
  if ($p.HasExited) { break }
  if ((Test-Path "$out\console.log") -and ((Get-Content "$out\console.log" -Raw) -match 'DO NOT paste it into a chat')) {
    $child = Get-CimInstance Win32_Process -Filter "Name='powershell.exe' AND ParentProcessId=$($p.Id)" | Select-Object -First 1
    if ($child) { break }
  }
}
if ($child) {
  Start-Sleep -Milliseconds 1500
  $tf = Join-Path $OutRoot "in-$Case.txt"
  [System.IO.File]::WriteAllText($tf, $InputText)
  Start-Process powershell.exe -WindowStyle Hidden -Wait -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$here\coninject.ps1`" -TargetPid $($child.ProcessId) -TextFile `"$tf`"" | Out-Null
  Write-Host "inject: $(Get-Content "$tf.result")"
}
$p.WaitForExit()
$rc = (Get-Content "$out\rc.txt" -ErrorAction SilentlyContinue | Select-Object -First 1)
Write-Host "case=$Case rc=$("$rc".Trim()) seconds=$([int]((Get-Date) - $started).TotalSeconds)"
