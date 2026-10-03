param([string]$ProjectRoot="C:\Users\Asus\Documents\Codex\2026-09-29\new-chat-2",[switch]$Uninstall)
$ErrorActionPreference='Stop'
$name='Hermes-FX-ExistingJob-Ticker'
if ($Uninstall) {Unregister-ScheduledTask -TaskName $name -Confirm:$false;exit}
$folder=Join-Path $ProjectRoot 'outputs/hermes-fx-ticker'
New-Item -ItemType Directory -Force -Path $folder | Out-Null
$existing=Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
if ($existing) {Export-ScheduledTask -TaskName $name | Set-Content -LiteralPath (Join-Path $folder 'previous-task.xml') -Encoding utf8}
$ticker=Join-Path $PSScriptRoot 'windows-hermes-ticker.ps1'
$pwsh=(Get-Process -Id $PID).Path
$arguments='-NoProfile -WindowStyle Hidden -File "'+$ticker+'" -ProjectRoot "'+$ProjectRoot+'"'
$action=New-ScheduledTaskAction -Execute $pwsh -Argument $arguments -WorkingDirectory $ProjectRoot
$user=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$triggers=@((New-ScheduledTaskTrigger -AtLogOn -User $user),(New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15)))
$principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 90) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $name -Action $action -Trigger $triggers -Principal $principal -Settings $settings -Description 'Ticks existing five-day local Hermes FX job; no server migration.' -Force | Out-Null
Export-ScheduledTask -TaskName $name | Set-Content -LiteralPath (Join-Path $folder 'installed-task.xml') -Encoding utf8
Write-Output '{"task":"Hermes-FX-ExistingJob-Ticker","mode":"local-interactive","tick_minutes":15,"job_cadence_days":5,"requires_laptop_and_login":true}'
