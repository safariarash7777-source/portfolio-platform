param([Parameter(Mandatory)][string]$CanonicalRoot)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'harness-input.ps1')
$CanonicalRoot=Assert-CanonicalHarnessRoot $CanonicalRoot
. (Join-Path $PSScriptRoot 'offline-boundary.ps1')
# Read-only source extraction and synthetic control-flow mocks. No controller
# Initialize, key, encryption, archive, SSH, filesystem lock or native action.
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$controller=Join-Path $PSScriptRoot 'baseline'
$pins=@{'attempt-profile.ps1'='6931b653d0f7b354172493ddf965fea9f3f1892d11241a790ea0ad1ff4cc1eb7';'native-adapter.ps1'='f75a6f20496fb3f34a701bd40124dc2ec542f8ba0c7bf40a9a29d83418740bdc';'native-caller.ps1'='3e5fa182e93b2b49eec824333e3ce5b637bedc776f519fb0d99b97dd0802d8b3'}
foreach($n in $pins.Keys){if((Get-FileHash -LiteralPath (Join-Path $controller $n) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pins[$n]){throw 'controller source changed'}}
function Extract($File,$Name){
 $t=$null;$e=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($File,[ref]$t,[ref]$e)
 if($e.Count){throw 'parse'}
 $f=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq $Name},$true)
 if(-not $f){throw 'function missing'};return $f.Extent.Text
}
$read=Extract (Join-Path $controller 'attempt-profile.ps1') 'Read-APAttempt'
# Substitute only the two direct filesystem operations; all state-transition and
# authenticated-event decision logic is the exact reviewed controller function.
$read=$read.Replace('[IO.File]::Open($lockPath,''Open'',''Read'',''None'')','(MockLockProbe)')
$read=$read.Replace('[CheckpointCrypto]::FileHash($manifest)','(MockManifestHash)')
. (New-OfflineBlock ($read))
$checks=[Collections.Generic.List[string]]::new()
function Assert($v,$n){if(-not $v){throw "failed: $n"};$checks.Add($n)}
function Reject([scriptblock]$f,$n){$bad=$false;try{& $f}catch{$bad=$true};Assert $bad $n}
function APContext {return @{root='SYNTHETIC';destination='SYNTHETIC-DEST';attemptId=('a'*32);authorizationSha256=('b'*64)}}
function Test-Path {param($LiteralPath);return $script:paths.Contains(([string]$LiteralPath).Replace('\','/'))}
function Assert-APFile {}
function CheckPath {param($p);return $p}
function CheckPrivateDirectory {}
function MockLockProbe {if($script:locked){throw [IO.IOException]::new('synthetic busy')};return [IO.MemoryStream]::new()}
function MockManifestHash {return 'manifestHash'}
function APInventory {return @('synthetic inventory')}
function APBytes {param($v);return [byte[]]@(0)}
function APHash {return 'inventoryHash'}
function APReadEvent {param($a,$kind,$key);if($script:badEvent){throw 'AUTHENTICATION'};return $script:events[$kind]}
function Reset {
 $script:paths=[Collections.Generic.HashSet[string]]::new();$script:events=@{};$script:badEvent=$false;$script:locked=$false
}
function AddEvent($kind,$details){$script:paths.Add("SYNTHETIC/authority/$('a'*32).$kind.json")|Out-Null;$script:events[$kind]=@{details=$details}}
function ReadState {return (Read-APAttempt 'SYNTHETIC' ('a'*32) ([byte[]]@())).state}
Reset;Assert ((ReadState) -ceq 'AUTHORIZED_NOT_STARTED') 'no markers is authorized not started only'
$paths.Add("SYNTHETIC/authority/$('a'*32).lock")|Out-Null;$locked=$true
Assert ((ReadState) -ceq 'RUNNING_OR_LOCKED') 'busy lock is not success'
$locked=$false;Assert ((ReadState) -ceq 'OUTCOME_UNKNOWN') 'released lock without result stays unknown'
Reset;AddEvent 'capture-start' @{};Assert ((ReadState) -ceq 'OUTCOME_UNKNOWN') 'start event without bound stays unknown'
Reset;$paths.Add('SYNTHETIC-DEST')|Out-Null;Assert ((ReadState) -ceq 'OUTCOME_UNKNOWN') 'partial destination alone stays unknown'
Reset;AddEvent 'bound' @{manifestSha256='manifestHash';archiveInventorySha256='inventoryHash'}
Assert ((ReadState) -ceq 'CAPTURED_NOT_VERIFIED') 'bound inventory is capture only'
AddEvent 'verify-start' @{};Assert ((ReadState) -ceq 'VERIFY_OUTCOME_UNKNOWN') 'lost verify response stays unknown'
AddEvent 'verified' @{manifestSha256='manifestHash';installAuthorized=$false}
Assert ((ReadState) -ceq 'VERIFIED_NATIVE_BACKUP_ONLY') 'verified event is backup only'
$badEvent=$true;Reject {ReadState} 'unauthenticated event never becomes success'
Reset;AddEvent 'verified' @{manifestSha256='manifestHash';installAuthorized=$false}
Reject {ReadState} 'verified event cannot replace missing bound manifest'

# Invoke real dispatch only up to its first filesystem-lock boundary. A sentinel
# replaces CheckPath before IO; provider/crypto/lock code is never reached.
. (New-OfflineBlock ((Extract (Join-Path $controller 'attempt-profile.ps1') 'Invoke-APAttempt')))
$apProfile='independent-attempt-v3-native'
function Assert-NARoot {param($r);return $r}
function Read-APAttempt {return @{state=$script:state}}
function CheckPath {throw 'SYNTHETIC_LOCK_BOUNDARY'}
foreach($stateName in @('RUNNING_OR_LOCKED','OUTCOME_UNKNOWN','VERIFY_OUTCOME_UNKNOWN','VERIFIED_NATIVE_BACKUP_ONLY')){
 $script:state=$stateName
 foreach($action in @('Capture','Verify')){
  $code=$null;try{Invoke-APAttempt $action 'SYNTHETIC' ('a'*32) ([byte[]]@()) $apProfile}catch{$code=$_.Exception.Message}
  Assert ($code -ceq 'READBACK_REQUIRED_NO_RETRY') "$action refuses $stateName before lock/provider"
 }
}
foreach($case in @(@('Capture','AUTHORIZED_NOT_STARTED'),@('Verify','CAPTURED_NOT_VERIFIED'))){
 $script:state=$case[1];$code=$null
 try{Invoke-APAttempt $case[0] 'SYNTHETIC' ('a'*32) ([byte[]]@()) $apProfile}catch{$code=$_.Exception.Message}
 Assert ($code -ceq 'SYNTHETIC_LOCK_BOUNDARY') "$($case[0]) accepts only its expected previous state"
}
Reject {Invoke-APAttempt 'Capture' 'SYNTHETIC' ('a'*32) ([byte[]]@()) 'CorrectedCorePrivateV3'} 'old controller rejects V3 profile name'
. (New-OfflineBlock ((Extract (Join-Path $controller 'native-adapter.ps1') 'Get-NAMapping')))
$map=Get-NAMapping ('a'*32)
Assert ($map.checkpoint -ceq '20261030T215307Z' -and $map.checkpoint -cne '20261103T222239Z') 'old attempt maps Oct30 not Nov3'
$out=@{status='PASS_SYNTHETIC_EXISTING_ATTEMPT_CONTRACT';count=$checks.Count;checks=$checks.ToArray();controllerPins=$pins;sourceInstrumentation=@('lock probe replaced by in-memory stub','manifest hash replaced by fixed synthetic value','all authenticated event reads mocked','native initialization never called');nativeActionsExecuted=$false;keysAccessed=$false;cryptoExecuted=$false;archiveAccessed=$false;externalWrites=$false;actualNativeArchiveRecords=$null;actualNativeArchiveStreams=$null;integrationComplete=$false;releaseAuthorized=$false}
Complete-OfflineBoundary $out
$out|ConvertTo-Json -Depth 8 -Compress
