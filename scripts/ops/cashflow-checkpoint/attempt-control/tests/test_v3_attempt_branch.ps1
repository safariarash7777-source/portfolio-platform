param([Parameter(Mandatory)][string]$CanonicalRoot)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'harness-input.ps1')
$CanonicalRoot=Assert-CanonicalHarnessRoot $CanonicalRoot
. (Join-Path $PSScriptRoot 'offline-boundary.ps1')
$ErrorActionPreference='Stop';$root=$PSScriptRoot;$candidate=Join-Path $CanonicalRoot 'attempt-control';$baseline=Join-Path $PSScriptRoot 'baseline'
$src=$CanonicalRoot
$checks=[Collections.Generic.List[string]]::new()
function Assert($v,$n){if(-not $v){throw "failed: $n"};$checks.Add($n)}
function Reject([scriptblock]$f,$n){$bad=$false;try{& $f}catch{$bad=$true};Assert $bad $n}
function Extract($File,$Name){$t=$null;$e=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($File,[ref]$t,[ref]$e);if($e.Count){throw 'parse'};$f=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq $Name},$true);if(-not $f){throw 'function missing'};return $f.Extent.Text}
# Load only definitions. No Initialize, caller main, key, crypto or provider.
foreach($name in @('Test-V3Bool','Assert-V3AttemptBinding','Get-V3ActiveControllerBinding')){. (New-OfflineBlock ((Extract (Join-Path $src 'checkpoint-profile-v3.ps1') $name)))}
Reject {Get-V3ActiveControllerBinding 'Capture' @{}} 'standalone wrapper cannot bypass missing controller'
foreach($name in @('Get-NAV3Mapping','Assert-NAV3ActiveAttempt','Assert-NAV3AuthorizationShape','Get-NAV3Context')){. (New-OfflineBlock (Extract (Join-Path $candidate 'native-v3-binding.ps1') $name))}
. (New-OfflineBlock ((Extract (Join-Path $candidate 'native-adapter.ps1') 'Get-NAMapping')))
$script:naSelectedProfile='CorrectedCorePrivateV3';$script:naReviewedProfileSha256='c905b8a11fa740b4ff34bda468d567ef1382aaaf3cffa46325ede8f194c55494'
$script:naV3Policy=Get-Content -Raw -LiteralPath (Join-Path $src 'checkpoint-profile-v3-policy.json')|ConvertFrom-Json
$map=Get-NAMapping ('a'*32)
Assert ($map.checkpoint -ceq '20261103T222239Z' -and $map.root.EndsWith('attempt-control-20261103T222239Z') -and $map.destination.EndsWith('.attempt-'+('a'*32))) 'explicit V3 gets isolated Nov3 mapping'
$script:naSelectedProfile='CorrectedAcl19FailedV2R2';$old=Get-NAMapping ('a'*32)
Assert ($old.checkpoint -ceq '20261030T215307Z' -and $old.root.EndsWith('attempt-control-20261030T215307Z')) 'old explicit mapping unchanged'
Assert (('NATIVE-ATTEMPT-CONTROLLER-V3:'+$old.checkpoint) -ceq 'NATIVE-ATTEMPT-CONTROLLER-V3:20261030T215307Z') 'old controller entropy string unchanged'
$script:naSelectedProfile='CorrectedCorePrivateV3'
$a=$null;$AuthorityKey=$null;$lock=$null;$checkpointLock=$null;$priorLease=$null
Reject {Assert-NAV3ActiveAttempt 'Capture' $naV3Policy} 'loaded provider still rejects absent active signed attempt'
Reject {Get-NAV3Mapping 'latest'} 'no inferred latest attempt'
$indexPin=(Get-FileHash (Join-Path $candidate 'v3/source-pins.json') -Algorithm SHA256).Hash.ToLowerInvariant()
function NewAuth {
 $records=@(foreach($r in $naV3Policy.roles){[pscustomobject]@{role=$r.role;name=$r.name;origin=$r.origin;length=$r.length;sha256=$r.sha256;state=$(if($r.observedState -ceq 'observed_absent'){'absent'}else{'present'})}})
 return [pscustomobject]@{version=3;profile='independent-attempt-v3-native';checkpointProfile='CorrectedCorePrivateV3';attemptId=('a'*32);checkpoint=$map.checkpoint;root=$map.root;destination=$map.destination;policySha256=$script:naReviewedProfileSha256;sourceIndexSha256=$indexPin;parentBindingSha256=$naV3Policy.bindingSha256;helperSha256='1f1454f9aea632609c002335e628c2f463f96f28cb131bc95c2ff6f2bda2a9f2';nonce=('b'*64);reconciliationId=('c'*32);priorReceiptSha256=('d'*64);priorInventorySha256=('e'*64);captureAuthorized=$true;installAuthorized=$false;nativeAuthorized=$false;records=$records}
}
$a=NewAuth;Assert-NAV3AuthorizationShape $a $map;$checks.Add('complete typed V3 authorization shape accepted without I/O')
foreach($case in @(@('checkpoint','20261030T215307Z'),@('checkpointProfile','CorrectedAcl19FailedV2R2'),@('policySha256','0'*64),@('sourceIndexSha256','0'*64),@('destination',$old.destination),@('root',$old.root),@('captureAuthorized','True'),@('installAuthorized','False'),@('nativeAuthorized',$true))){
 $a=NewAuth;$a.($case[0])=$case[1];Reject {Assert-NAV3AuthorizationShape $a $map} ("authorization rejects "+$case[0])
}
$a=NewAuth;$a.records=$a.records[0..16];Reject {Assert-NAV3AuthorizationShape $a $map} '17-role historical authorization is not 26-role V3'
$a=NewAuth;$a.records[23].state='present';Reject {Assert-NAV3AuthorizationShape $a $map} 'absent role is not stream'
$a=NewAuth;$a.records[24].origin='checkpoint';Reject {Assert-NAV3AuthorizationShape $a $map} 'pinned memory role cannot become remote file'
# Gate gets authenticated material from APOpen, not an untrusted true flag.
function Assert-NARoot {param($r);return $r}
function APOpen {throw 'AUTHENTICATION_REJECTED'}
$failure=$null;try{Get-NAV3Context 'SYNTHETIC' ('a'*32) ([byte[]]@())}catch{$failure=$_.Exception.Message};Assert ($failure -ceq 'AUTHENTICATION_REJECTED') 'unsigned or corrupt authorization rejected before source access'
$OfflineFixture=$false
$v3AttemptBinding=[ordered]@{attemptId=('a'*32);nonce=('b'*64);authorizationSha256=('c'*64);priorReceiptSha256=('d'*64);policySha256=$script:naReviewedProfileSha256;sourceIndexSha256=$indexPin;checkpoint=$map.checkpoint;destination=$map.destination}
Assert-V3AttemptBinding $v3AttemptBinding;$checks.Add('binding accepts exact eight fields in capture dictionary')
$clone=($v3AttemptBinding|ConvertTo-Json)|ConvertFrom-Json;Assert-V3AttemptBinding $clone;$checks.Add('binding accepts parsed exact eight fields at verify')
$clone.nonce='0'*64;Reject {Assert-V3AttemptBinding $clone} 'manifest/header from another nonce rejected'
Reject {Assert-V3AttemptBinding $null} 'unbound old archive rejected'
$OfflineFixture=$true;Reject {Assert-V3AttemptBinding $v3AttemptBinding} 'synthetic cannot launder real attempt binding'
# Exact existing event/readback machinery retained, with one explicit dispatch
# at the already-held-lock boundary. No independent state machine introduced.
foreach($n in @('Read-APAttempt','APEvent','APReadEvent','APOpen','APSign','Assert-APOtherAttemptsClosed','APHeader')){
 Assert ((Extract (Join-Path $candidate 'attempt-profile.ps1') $n) -ceq (Extract (Join-Path $baseline 'attempt-profile.ps1') $n)) ("existing $n byte-exact")
}
$new=Extract (Join-Path $candidate 'attempt-profile.ps1') 'Invoke-APAttempt'
$addition="    if(`$script:naSelectedProfile -ceq 'CorrectedCorePrivateV3'){return (Invoke-NAV3BoundAction `$Action `$a `$AuthorityKey `$priorLease)}`r`n"
Assert ($new.Replace($addition,'') -ceq (Extract (Join-Path $baseline 'attempt-profile.ps1') 'Invoke-APAttempt')) 'only dispatch added after existing lock and readback checks'
Assert ($new.IndexOf('READBACK_CHANGED') -lt $new.IndexOf('Invoke-NAV3BoundAction')) 'unknown/re-read guard precedes V3 dispatch'
$frozen=Get-Content -Raw (Join-Path $candidate 'frozen-files.json')|ConvertFrom-Json
foreach($f in $frozen.files){Assert (((Get-FileHash (Join-Path $candidate ('frozen/'+$f.path)) -Algorithm SHA256).Hash.ToLowerInvariant()) -ceq $f.sha256) ('frozen unchanged: '+$f.path)}
$v3=Get-Content -Raw (Join-Path $src 'checkpoint-profile-v3.ps1')
Assert ($v3.IndexOf('Get-V3ActiveControllerBinding $Action $policy') -lt $v3.IndexOf('V3NativeMetadata $packet')) 'active controller gate occurs before metadata SSH'
Assert ($v3.Contains("if(`$synthetic){WriteNew (Join-Path `$Destination 'verified.json')")) 'native Verify preserves archive inventory for bound readback'
Assert ($v3.Contains("'independent-attempt-v3:'+`$v3AttemptBinding.authorizationSha256")) 'new archive entropy binds authenticated authorization'
Assert ($v3.Contains('}finally{if($master){[Array]::Clear($master,0,$master.Length)}')) 'profile owns key cleanup even when called by controller'
$out=@{status='PASS_SYNTHETIC_V3_ATTEMPT_BRANCH';count=$checks.Count;checks=$checks.ToArray();nativeActionsExecuted=$false;keysAccessed=$false;cryptoExecuted=$false;archiveAccessed=$false;externalWrites=$false;actualNativeArchiveRecords=$null;actualNativeArchiveStreams=$null;runtimeIntegrationProven=$false;releaseAuthorized=$false}
Complete-OfflineBoundary $out
$out|ConvertTo-Json -Depth 8 -Compress
