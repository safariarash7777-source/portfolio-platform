param([string]$ProjectRoot="C:\Users\Asus\Documents\Codex\2026-09-29\new-chat-2")
$ErrorActionPreference='Stop'
$hermesRoot=Join-Path $env:LOCALAPPDATA 'hermes'
$hermesCli=Join-Path $hermesRoot 'hermes-agent/.hermes/bin/hermes.exe'
$jobFile=Join-Path $hermesRoot 'cron/jobs.json'
$jobBytes=[IO.File]::ReadAllBytes($jobFile)
$jobs=Get-Content -LiteralPath $jobFile -Raw | ConvertFrom-Json
if ($jobs.PSObject.Properties.Name -contains 'jobs') {$jobs=$jobs.jobs}
$enabled=@($jobs | Where-Object {$_.enabled})
if ($enabled.Count -ne 1 -or $enabled[0].id -ne '9f78482170f4' -or $enabled[0].deliver -ne 'local') {throw 'Existing local FX job ownership changed; ticker withheld'}
$folder=Join-Path $ProjectRoot 'outputs/hermes-fx-ticker'
New-Item -ItemType Directory -Force -Path $folder | Out-Null
$started=[DateTimeOffset]::UtcNow
$log=Join-Path $folder ('tick-'+$started.ToString('yyyyMMddTHHmmssZ')+'.private.log')
Push-Location $ProjectRoot
try {
    & $hermesCli cron tick *> $log
    $result=$LASTEXITCODE
} finally {Pop-Location}
$receipt=[ordered]@{checked_at=[DateTimeOffset]::UtcNow.ToString('o');started_at=$started.ToString('o');exit_code=$result;existing_job_id='9f78482170f4';mode='one-shot-local-ticker';interval_minutes=15;local_dependency=$true;publication_verified=$false;economic_job_due_at_start=([DateTimeOffset]::Parse($enabled[0].next_run_at) -le $started)}
$path=Join-Path $folder 'last-tick.json'
$receipt | ConvertTo-Json | Set-Content -LiteralPath ($path+'.pending') -Encoding utf8
Move-Item -LiteralPath ($path+'.pending') -Destination $path -Force
exit $result
