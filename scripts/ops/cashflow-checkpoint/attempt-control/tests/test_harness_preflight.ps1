param([Parameter(Mandatory)][string]$CanonicalRoot)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'harness-input.ps1')
$CanonicalRoot=Assert-CanonicalHarnessRoot $CanonicalRoot
$pwsh=(Get-Process -Id $PID).Path
$invalid=@('', ' ', (Join-Path $CanonicalRoot '__missing_canonical_root_for_test__'), (Join-Path $CanonicalRoot 'README.md'), $PSScriptRoot)
if (Test-Path -LiteralPath $invalid[2]) { throw 'NEGATIVE_PATH_UNEXPECTEDLY_EXISTS' }
$checks=0
foreach ($suite in @('test_attempt_contract.ps1','test_v3_attempt_branch.ps1','test_attempt_lifecycle.ps1')) {
  foreach ($value in $invalid) {
    $start=[Diagnostics.ProcessStartInfo]::new($pwsh)
    $start.UseShellExecute=$false; $start.CreateNoWindow=$true
    $start.RedirectStandardOutput=$true; $start.RedirectStandardError=$true
    foreach ($arg in @('-NoProfile','-NonInteractive','-File',(Join-Path $PSScriptRoot 'invoke-preflight-case.ps1'),'-Harness',(Join-Path $PSScriptRoot $suite),'-Root',$value)) { $start.ArgumentList.Add($arg) }
    $process=[Diagnostics.Process]::new(); $process.StartInfo=$start
    try {
      if (-not $process.Start()) { throw 'CHILD_NOT_STARTED' }
      $stdout=$process.StandardOutput.ReadToEndAsync(); $stderr=$process.StandardError.ReadToEndAsync()
      if (-not $process.WaitForExit(15000)) { $process.Kill($true); throw 'PREFLIGHT_CHILD_TIMEOUT' }
      $text=$stdout.GetAwaiter().GetResult(); $null=$stderr.GetAwaiter().GetResult()
      if ($process.ExitCode -eq 0 -or -not [string]::IsNullOrWhiteSpace($text)) { throw 'INVALID_CANONICAL_ROOT_DID_NOT_FAIL_CLOSED' }
      $checks++
    } finally { $process.Dispose() }
  }
}
Write-Output (@{status='PASS_CANONICAL_ROOT_NEGATIVE_CASES';checks=$checks;freshChildProcesses=$checks;callerErrorActionPreference='Continue';nativeActionsExecuted=$false}|ConvertTo-Json -Compress)
