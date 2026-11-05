param([Parameter(Mandatory)][string]$CanonicalRoot)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'harness-input.ps1')
$CanonicalRoot=Assert-CanonicalHarnessRoot $CanonicalRoot
. (Join-Path $PSScriptRoot 'offline-boundary.ps1')
# Existing real control flow, mocked I/O/provider boundaries only. No keys/crypto,
# authorization files, archive, native Capture/Verify or external writes.
$ErrorActionPreference='Stop';$root=$PSScriptRoot;$src=Join-Path $CanonicalRoot 'attempt-control'
function Extract($File,$Name){$t=$null;$e=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($File,[ref]$t,[ref]$e);if($e.Count){throw 'parse'};return $ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq $Name},$true).Extent.Text}
$read=Extract (Join-Path $src 'attempt-profile.ps1') 'Read-APAttempt'
$read=$read.Replace('[IO.File]::Open($lockPath,''Open'',''Read'',''None'')','([IO.MemoryStream]::new())').Replace('[CheckpointCrypto]::FileHash($manifest)','(MockHash)')
. (New-OfflineBlock ($read))
$invoke=Extract (Join-Path $src 'attempt-profile.ps1') 'Invoke-APAttempt'
$invoke=$invoke.Replace("[IO.File]::Open((Join-Path `$Root 'authority/checkpoint.lock'),'OpenOrCreate','ReadWrite','None')","(New-MockLock 'checkpoint')").Replace("[IO.File]::Open(`$lockPath,`$fileMode,'ReadWrite','None')",'(New-MockLock $lockPath)')
. (New-OfflineBlock ($invoke))
$bound=Extract (Join-Path $src 'native-v3-binding.ps1') 'Invoke-NAV3BoundAction'
$bound=$bound.Replace('[CheckpointCrypto]::FileHash($manifest)','(MockHash)')
. (New-OfflineBlock ($bound))
$apProfile='independent-attempt-v3-native';$script:naSelectedProfile='CorrectedCorePrivateV3'
$checks=[Collections.Generic.List[string]]::new()
function Assert($v,$n){if(-not $v){throw "failed: $n"};$checks.Add($n)}
function Test-Path {param($LiteralPath);return $script:paths.Contains(([string]$LiteralPath).Replace('\','/'))}
function New-MockLock($path){if($path -cne 'checkpoint'){$script:paths.Add($path.Replace('\','/'))|Out-Null};return [IO.MemoryStream]::new()}
function Assert-NARoot {param($r);return $r}
function APContext {return @{root='SYNTHETIC';destination='SYNTHETIC-DEST';attemptId=('a'*32);authorizationSha256=('b'*64);checkpoint='20261103T222239Z'}}
function CheckPath {param($p);return $p}
function CheckPrivateDirectory {}
function Assert-APFile {}
function Assert-NARegistry {}
function Assert-APOtherAttemptsClosed {if($script:otherUnknown){throw 'OTHER_ATTEMPT_RECONCILIATION_REQUIRED'}}
function Open-NAPriorLease {return @{synthetic=$true}}
function Close-NALease {}
function Assert-NALeaseStable {return @{synthetic=$true}}
function APInventory {return @('retained synthetic partial')}
function APBytes {return [byte[]]@(0)}
function APHash {return 'inventoryHash'}
function MockHash {return 'manifestHash'}
function APEvent($a,$kind,$details,$key){
 if($script:events.ContainsKey($kind)){throw 'CREATE_NEW_EVENT'}
 $script:events[$kind]=@{details=$details};$script:paths.Add("SYNTHETIC/authority/$('a'*32).$kind.json")|Out-Null
}
function APReadEvent($a,$kind,$key){if(-not $script:events.ContainsKey($kind)){throw 'NO_EVENT'};return $script:events[$kind]}
function Invoke-V3 {
 $script:providerCalls++
 # Assert actual event ordering across the provider boundary.
 $kind=if($Action -ceq 'Capture'){'capture-start'}else{'verify-start'}
 if(-not $script:events.ContainsKey($kind)){throw 'START_NOT_RECORDED'}
 if($Action -ceq 'Capture'){$script:paths.Add('SYNTHETIC-DEST')|Out-Null}
 if($script:failProvider){throw 'SYNTHETIC_LOST_RESPONSE'}
}
function Reset {$script:paths=[Collections.Generic.HashSet[string]]::new();$script:events=@{};$script:providerCalls=0;$script:failProvider=$false;$script:otherUnknown=$false}
function Call($action){return (Invoke-APAttempt $action 'SYNTHETIC' ('a'*32) ([byte[]]@()) $apProfile)}
function State {return (Read-APAttempt 'SYNTHETIC' ('a'*32) ([byte[]]@())).state}
function Rejected($action){$msg=$null;try{$null=Call $action}catch{$msg=$_.Exception.Message};return $msg}
Reset;$script:failProvider=$true
Assert ((Rejected 'Capture') -ceq 'SYNTHETIC_LOST_RESPONSE') 'failed provider leaves start and retained partial'
Assert ((State) -ceq 'OUTCOME_UNKNOWN') 'capture failure is not converted to authorized or success'
Assert ((Rejected 'Capture') -ceq 'READBACK_REQUIRED_NO_RETRY' -and $providerCalls -eq 1) 'unknown capture never calls provider twice'
Assert ($paths.Contains('SYNTHETIC-DEST') -and $events.ContainsKey('capture-start')) 'unknown artifacts and intent retained'
Reset;Assert ((Call 'Capture').state -ceq 'CAPTURED_NOT_VERIFIED') 'capture emits only bound backup state'
Assert ((State) -ceq 'CAPTURED_NOT_VERIFIED') 'independent readback sees bound state'
Assert ((Rejected 'Capture') -ceq 'READBACK_REQUIRED_NO_RETRY' -and $providerCalls -eq 1) 'completed capture is not replayed'
$script:failProvider=$true
Assert ((Rejected 'Verify') -ceq 'SYNTHETIC_LOST_RESPONSE') 'verify failure leaves authenticated start'
Assert ((State) -ceq 'VERIFY_OUTCOME_UNKNOWN') 'verify unknown preserved'
Assert ((Rejected 'Verify') -ceq 'READBACK_REQUIRED_NO_RETRY' -and $providerCalls -eq 2) 'unknown verify never repeated'
Reset;$null=Call 'Capture';Assert ((Call 'Verify').state -ceq 'VERIFIED_NATIVE_BACKUP_ONLY') 'mocked complete flow is backup only'
Assert ((State) -ceq 'VERIFIED_NATIVE_BACKUP_ONLY') 'existing authenticated readback recognizes external verified event'
Assert ((Call 'Readback').installAuthorized -ceq $false -and $providerCalls -eq 2) 'readback never reruns provider or authorizes install'
Reset;$script:otherUnknown=$true
Assert ((Rejected 'Capture') -ceq 'OTHER_ATTEMPT_RECONCILIATION_REQUIRED' -and $providerCalls -eq 0) 'another unresolved attempt blocks before provider'
$out=@{status='PASS_SYNTHETIC_MOCK_ATTEMPT_LIFECYCLE';count=$checks.Count;checks=$checks.ToArray();nativeActionsExecuted=$false;keysAccessed=$false;cryptoExecuted=$false;archiveAccessed=$false;externalWrites=$false;providerBoundaryMocked=$true;authenticationBoundaryMocked=$true;runtimeIntegrationProven=$false;actualNativeArchiveRecords=$null;actualNativeArchiveStreams=$null;releaseAuthorized=$false}
Complete-OfflineBoundary $out
$out|ConvertTo-Json -Depth 8 -Compress
