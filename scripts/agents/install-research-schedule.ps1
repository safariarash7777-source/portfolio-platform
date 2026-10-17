param([Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference = 'Stop'
$repository = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$workerHome = Join-Path $env:LOCALAPPDATA 'PortfolioResearch'
if (!(Test-Path -LiteralPath (Join-Path $workerHome 'bridge_ed25519'))) { throw 'Dedicated bridge identity missing' }
if (!(Test-Path -LiteralPath $NodePath)) { throw 'Node runtime missing' }
if (!(Test-Path -LiteralPath (Join-Path $workerHome 'last-run.json'))) { throw 'Verify a real worker run before scheduling' }
$receipt = Get-Content -LiteralPath (Join-Path $workerHome 'last-run.json') -Raw | ConvertFrom-Json
if ($receipt.status -notin @('stored','unchanged')) { throw 'A successful stored draft is required before scheduling' }
$escape = { param($value) "'" + $value.Replace("'", "''") + "'" }
$script = @"
`$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $(& $escape $repository)
`$env:PORTFOLIO_RESEARCH_HOME = $(& $escape $workerHome)
`$log = Join-Path `$env:PORTFOLIO_RESEARCH_HOME 'worker.log'
if ((Test-Path -LiteralPath `$log) -and (Get-Item -LiteralPath `$log).Length -gt 1048576) {
  Move-Item -LiteralPath `$log -Destination (`$log + '.previous') -Force
}
& $(& $escape $NodePath) $(& $escape (Join-Path $repository 'node_modules/tsx/dist/cli.mjs')) $(& $escape (Join-Path $repository 'scripts/agents/research-worker.ts')) --run *>> `$log
exit `$LASTEXITCODE
"@
$launcher = Join-Path $workerHome 'run.ps1'
[IO.File]::WriteAllText($launcher, $script, [Text.UTF8Encoding]::new($true))
$taskName = 'Portfolio-Research-Hermes'
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $launcher + '"') -WorkingDirectory $repository
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Hours 1)
$logon = New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 8) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($trigger,$logon) -Settings $settings -Principal $principal -Description 'Private Codal research via local Hermes ChatGPT subscription; draft only; unchanged inputs skip inference.' -Force | Out-Null
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName,State
Get-ScheduledTaskInfo -TaskName $taskName | Select-Object LastRunTime,LastTaskResult,NextRunTime
