param(
  [ValidateSet('Reconcile','Prepare','Capture','Verify','Readback')][string]$Action,
  [string]$AttemptId,[string]$ReconciliationId,[string]$ReviewedAuthorizationSha256,
  [string]$ReviewedReconciliationSha256,
  [string]$Profile='CorrectedAcl19FailedV2R2',[string]$ReviewedProfileSha256
)
$ErrorActionPreference='Stop';$key=$null
try{
  . (Join-Path $PSScriptRoot 'native-adapter.ps1')
  if($Profile -cnotin @('CorrectedAcl19FailedV2R2','CorrectedCorePrivateV3')){throw 'EXPLICIT_PROFILE_REQUIRED'}
  $script:naSelectedProfile=$Profile;$script:naReviewedProfileSha256=$ReviewedProfileSha256
  Initialize-NA
  $root=Assert-NARoot (Get-NAMapping $AttemptId).root
  if($Profile -ceq 'CorrectedCorePrivateV3' -and $Action -cin @('Capture','Verify','Readback')){
    if($ReviewedAuthorizationSha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'REVIEWED_AUTHORIZATION_REQUIRED'}
    $preAuth=Join-Path $root "authority/$AttemptId.authorization.json";Assert-APFile $preAuth
    if([CheckpointCrypto]::FileHash($preAuth) -cne $ReviewedAuthorizationSha256){throw 'REVIEWED_AUTHORIZATION_CHANGED'}
  }
  $keyPath=Join-Path $root 'authority/controller-key.dpapi';Assert-APFile $keyPath
  $key=[Security.Cryptography.ProtectedData]::Unprotect((BoundedBytes $keyPath 16384),$apUtf8.GetBytes('NATIVE-ATTEMPT-CONTROLLER-V3:'+(Get-NAMapping $AttemptId).checkpoint),[Security.Cryptography.DataProtectionScope]::CurrentUser)
  if($key.Length -ne 32){throw 'CONTROLLER_KEY_LENGTH'}
  if($Action -ceq 'Reconcile'){$result=Invoke-NAReconciliation $key $ReconciliationId}
  elseif($Action -ceq 'Prepare'){$result=New-NAAuthorizationDraft $AttemptId $ReconciliationId $ReviewedReconciliationSha256 $key}
  else{
    if($ReviewedAuthorizationSha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'REVIEWED_AUTHORIZATION_REQUIRED'}
    $auth=Join-Path $root "authority/$AttemptId.authorization.json";Assert-APFile $auth
    if([CheckpointCrypto]::FileHash($auth) -cne $ReviewedAuthorizationSha256){throw 'REVIEWED_AUTHORIZATION_CHANGED'}
    $result=Invoke-APAttempt $Action $root $AttemptId $key 'independent-attempt-v3-native'
  }
  # Prepare returns only an unsigned review object. No authority is issued here.
  [Console]::WriteLine(($result|ConvertTo-Json -Depth 30 -Compress))
}catch{[Console]::Error.WriteLine('NATIVE_ATTEMPT_REJECTED code=REVIEW_OR_RECONCILIATION_REQUIRED');exit 1}
finally{if($key){[Array]::Clear($key,0,$key.Length)}}
