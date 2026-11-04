$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'receipt-guard.ps1')
$script:checks=0
function ValidReceipt {
  return [ordered]@{status='PASS_SYNTHETIC_EXISTING_ATTEMPT_CONTRACT';count=22;externalCalls=0;unexpectedBoundaryAttempts=0;sentinelProbeDenied=1;nativeActionsExecuted=$false;cryptoExecuted=$false;keysAccessed=$false;archiveAccessed=$false;externalWrites=$false}
}
function RejectReceipt([string]$Json) {
  $rejected=$false
  try { Assert-OfflineHarnessReceipt $Json 'PASS_SYNTHETIC_EXISTING_ATTEMPT_CONTRACT' 22 } catch { $rejected=$true }
  if (-not $rejected) { throw 'INVALID_RECEIPT_ACCEPTED' }
  $script:checks++
}
foreach ($case in @(@('PASS_SYNTHETIC_EXISTING_ATTEMPT_CONTRACT',22),@('PASS_SYNTHETIC_V3_ATTEMPT_BRANCH',76),@('PASS_SYNTHETIC_MOCK_ATTEMPT_LIFECYCLE',14))) {
  $r=ValidReceipt; $r.status=$case[0]; $r.count=$case[1]
  Assert-OfflineHarnessReceipt ($r|ConvertTo-Json -Compress) $case[0] $case[1]
  $script:checks++
}
$valid=ValidReceipt|ConvertTo-Json -Compress
foreach ($json in @('',' ','null','true','0','"receipt"','[]',('['+$valid+']'),('['+$valid+','+$valid+']'),($valid+$valid),($valid.Substring(0,$valid.Length-1)+',}'),('/*comment*/'+$valid))) { RejectReceipt $json }
foreach ($name in @('count','externalCalls','unexpectedBoundaryAttempts','sentinelProbeDenied')) {
  foreach ($value in @('22','0','1',$true,$false,$null,@(22),@(),@{value=0},-1,0.5,9007199254740992,[long]::MaxValue)) {
    $r=ValidReceipt; $r[$name]=$value; RejectReceipt ($r|ConvertTo-Json -Depth 10 -Compress)
  }
  $r=ValidReceipt; $r.Remove($name); RejectReceipt ($r|ConvertTo-Json -Compress)
  RejectReceipt ($valid.Substring(0,$valid.Length-1)+',"'+$name+'":0}')
}
foreach ($value in @($null,$true,22,@('PASS_SYNTHETIC_EXISTING_ATTEMPT_CONTRACT'),@{value='PASS_SYNTHETIC_EXISTING_ATTEMPT_CONTRACT'},'pass_synthetic_existing_attempt_contract','PASS_OTHER')) {
  $r=ValidReceipt; $r.status=$value; RejectReceipt ($r|ConvertTo-Json -Depth 10 -Compress)
}
foreach ($name in @('nativeActionsExecuted','cryptoExecuted','keysAccessed','archiveAccessed','externalWrites')) {
  foreach ($value in @($true,0,'false',$null,@($false))) {
    $r=ValidReceipt; $r[$name]=$value; RejectReceipt ($r|ConvertTo-Json -Depth 10 -Compress)
  }
}
foreach ($extra in @('"co\u0075nt":22','"Count":22','"detail":{"n":1,"n":2}','"detail":{"n":1,"N":2}','"detail":[{"n":1,"\u006e":2}]')) {
  RejectReceipt ($valid.Substring(0,$valid.Length-1)+','+$extra+'}')
}
foreach ($literal in @('22.0','2.2e1','NaN','Infinity','-Infinity')) { RejectReceipt ($valid.Replace('"count":22','"count":'+$literal)) }
Write-Output (@{status='PASS_PURE_RECEIPT_GUARD';checks=$script:checks;nativeActionsExecuted=$false;externalCalls=0}|ConvertTo-Json -Compress)
