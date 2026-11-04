# Explicit Nov3 provider branch of the existing native caller/attempt engine.
# Loading definitions is inert. No authority issuance, fallback or new action.
function Get-NAV3Mapping([string]$AttemptId){
  if($AttemptId -cnotmatch '^[a-f0-9]{32}$'){throw 'EXPLICIT_ATTEMPT_REQUIRED'}
  $base='C:\Users\Asus\.codex\private\cashflow-release';$stamp='20261103T222239Z'
  return @{checkpoint=$stamp;root="$base\attempt-control-$stamp";legacy="$base\$stamp";destination="$base\$stamp.attempt-$AttemptId"}
}
function Initialize-NAV3 {
  if($script:naSelectedProfile -cne 'CorrectedCorePrivateV3' -or $script:naReviewedProfileSha256 -cne 'c905b8a11fa740b4ff34bda468d567ef1382aaaf3cffa46325ede8f194c55494'){throw 'V3_EXPLICIT_REVIEWED_PROFILE_REQUIRED'}
  . (Join-Path $PSScriptRoot 'attempt-profile.ps1')
  $t=$null;$e=$null;$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'attempt-profile.ps1'),[ref]$t,[ref]$e)
  if($e.Count){throw 'ATTEMPT_PARSE'}
  foreach($f in $ast.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst]},$false)){Set-Item "function:script:$($f.Name)" (Get-Item "function:$($f.Name)").ScriptBlock}
  # Original initializer pins Crypto and local helpers exactly. Its R2 definitions
  # remain loaded but are never a provider fallback for this explicit branch.
  $script:apUtf8=[Text.UTF8Encoding]::new($false,$true);$script:apProfile='independent-attempt-v3-native'
  Initialize-AP;$script:utf8=$apUtf8
  Import-NAFrozenFunction (Join-Path $apLegacy 'backup-checkpoint.ps1') 'JsonBytes'
  $script:naV3Source=Join-Path $PSScriptRoot 'v3'
  $indexRaw=[IO.File]::ReadAllBytes((Join-Path $naV3Source 'source-pins.json'))
  if((APHash $indexRaw) -cne 'b2014ef2c2a3cfa45951f5187b02f4fadf6d08683968ee49ee0bb21d4d7da663'){throw 'V3_SOURCE_INDEX'}
  $index=$apUtf8.GetString($indexRaw)|ConvertFrom-Json
  foreach($f in $index.files){if((APHash ([IO.File]::ReadAllBytes((Join-Path $naV3Source $f.path)))) -cne $f.sha256){throw 'V3_SOURCE_PIN'}}
  foreach($name in @('checkpoint-profile-v3.ps1','checkpoint-profile-v3-native.ps1')){
    $t=$null;$e=$null;$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $naV3Source $name),[ref]$t,[ref]$e)
    if($e.Count){throw 'V3_SOURCE_PARSE'}
    foreach($fn in $ast.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst]},$false)){
      $text=$fn.Extent.Text.Replace("function $($fn.Name)","function script:$($fn.Name)").Replace('$PSScriptRoot','$script:naV3Source')
      . ([scriptblock]::Create($text))
    }
  }
  $script:naV3PolicyRaw=Get-V3PolicyRaw;$script:naV3Policy=$apUtf8.GetString($naV3PolicyRaw)|ConvertFrom-Json
  $script:naV3Packet=V3Packet $naV3PolicyRaw
  Set-Item function:script:NAOriginalInventory (Get-Item function:APInventory).ScriptBlock
  Set-Item function:script:APInventory {param([string]$dir)
    if($script:naLease -and $dir -ceq $script:naLease.directory){if($script:naLease.absent){return @()};return @(Get-NALeaseInventory $script:naLease)}
    return @(NAOriginalInventory $dir)
  }
}
function Assert-NAV3Registry([string]$Root){
  $Root=Assert-NARoot $Root;$dir=Join-Path $Root 'authority'
  foreach($f in Get-ChildItem -LiteralPath $dir -Force){
    if($f.PSIsContainer){throw 'REGISTRY_SUBDIRECTORY'};Assert-APFile $f.FullName
    if($f.Name -cmatch '^([a-f0-9]{32})\.(lock|capture-start\.json|bound\.json|verify-start\.json|verified\.json)$'){
      if(-not (Test-Path -LiteralPath (Join-Path $dir "$($Matches[1]).authorization.json"))){throw 'ORPHAN_PENDING_ATTEMPT'}
    }elseif($f.Name -cnotmatch '^([a-f0-9]{32}\.(authorization|reconciliation)\.json|checkpoint\.lock|controller-key\.dpapi)$'){throw 'UNKNOWN_REGISTRY_FILE'}
  }
  $map=Get-NAV3Mapping ('0'*32);$base=Split-Path $map.legacy
  foreach($d in Get-ChildItem -LiteralPath $base -Filter '20261103T222239Z.attempt-*' -Force){
    $id=$d.Name.Replace('20261103T222239Z.attempt-','')
    if($id -cnotmatch '^[a-f0-9]{32}$' -or -not $d.PSIsContainer -or -not (Test-Path -LiteralPath (Join-Path $dir "$id.authorization.json"))){throw 'ORPHAN_ARCHIVE_ATTEMPT'}
    CheckPrivateDirectory (CheckPath $d.FullName)
  }
}
function Get-NAV3PriorState {
  $map=Get-NAV3Mapping ('0'*32);$parent=CheckPath (Split-Path $map.legacy);CheckPrivateDirectory $parent
  $acl=(Get-Acl -LiteralPath $parent).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]'Access,Owner,Group')
  if(Test-Path -LiteralPath $map.legacy){$inventory=@(APInventory $map.legacy);$state='CURRENT_ARCHIVE_EXCLUSIVELY_QUIESCENT'}
  else{$inventory=@();$state='NO_LOCAL_ARCHIVE_OBSERVED'}
  return @{state=$state;parentAcl=$acl;inventorySha256=(APHash (APBytes $inventory));historicalWriter='UNKNOWN';neverCreated=$null;historicalNotDeleted=$null}
}
function Open-NAV3PriorLease {
  $map=Get-NAV3Mapping ('0'*32);$null=Get-NAProcessObservation
  $lease=@{directory=$map.legacy;files=@();absent=$false}
  try{
    $lease.absent=-not (Test-Path -LiteralPath $map.legacy)
    if(-not $lease.absent){
      CheckPrivateDirectory (CheckPath $map.legacy)
      foreach($f in Get-ChildItem -LiteralPath $map.legacy -Force|Sort-Object Name){
        if($f.PSIsContainer){throw 'PRIOR_SUBDIRECTORY'};Assert-APFile $f.FullName
        $lease.files+=@{name=$f.Name;stream=[IO.File]::Open($f.FullName,'Open','Read','None')}
      }
      $lease.inventory=@(Get-NALeaseInventory $lease)
    }
    $script:naLease=$lease;$lease.prior=Get-NAV3PriorState
    $null=Assert-NAV3LeaseStable $lease;return $lease
  }catch{Close-NALease $lease;throw}
}
function Assert-NAV3LeaseStable($Lease){
  $observation=Get-NAProcessObservation
  if($Lease.absent -eq (Test-Path -LiteralPath $Lease.directory)){throw 'PRIOR_EXISTENCE_CHANGED'}
  $now=Get-NAV3PriorState
  if((APHash (APBytes $now)) -cne (APHash (APBytes $Lease.prior))){throw 'PRIOR_ARCHIVE_CHANGED'}
  return @{version=3;profile='native-current-closure-v3';checkpoint='20261103T222239Z';checkpointProfile='CorrectedCorePrivateV3';policySha256=$script:naReviewedProfileSha256;prior=$now;processObservation=$observation;installAuthorized=$false}
}
function Invoke-NAV3Reconciliation([byte[]]$Key,[string]$Id){
  if($Id -cnotmatch '^[a-f0-9]{32}$'){throw 'RECONCILIATION_ID'}
  $root=Assert-NARoot (Get-NAV3Mapping ('0'*32)).root;$lock=$null;$lease=$null
  try{
    $path=CheckPath (Join-Path $root 'authority/checkpoint.lock');$lock=[IO.File]::Open($path,'OpenOrCreate','ReadWrite','None');Assert-APFile $path
    Assert-NARegistry $root;$lease=Open-NAPriorLease;$r=Assert-NALeaseStable $lease
    $out=Join-Path $root "authority/$Id.reconciliation.json";WriteNew $out (APSign $r $Key)
    return @{receiptSha256=[CheckpointCrypto]::FileHash($out);reconciliationId=$Id;historicalWriter='UNKNOWN';state=$r.prior.state;installAuthorized=$false}
  }finally{if($lease){Close-NALease $lease};if($lock){$lock.Dispose()}}
}
function Assert-NAV3AuthorizationShape($a,$map){
  if($a.version -ne 3 -or $a.profile -cne 'independent-attempt-v3-native' -or $a.checkpointProfile -cne 'CorrectedCorePrivateV3' -or
    $a.checkpoint -cne $map.checkpoint -or $a.root -cne $map.root -or $a.destination -cne $map.destination -or
    $a.policySha256 -cne $script:naReviewedProfileSha256 -or $a.sourceIndexSha256 -cne 'b2014ef2c2a3cfa45951f5187b02f4fadf6d08683968ee49ee0bb21d4d7da663' -or
    $a.parentBindingSha256 -cne $naV3Policy.bindingSha256 -or $a.helperSha256 -cne '1f1454f9aea632609c002335e628c2f463f96f28cb131bc95c2ff6f2bda2a9f2' -or
    $a.nonce -cnotmatch '^[a-f0-9]{64}$' -or $a.reconciliationId -cnotmatch '^[a-f0-9]{32}$' -or
    $a.priorReceiptSha256 -cnotmatch '^[a-f0-9]{64}$' -or $a.priorInventorySha256 -cnotmatch '^[a-f0-9]{64}$' -or
    -not (Test-V3Bool $a.captureAuthorized $true) -or -not (Test-V3Bool $a.installAuthorized $false) -or -not (Test-V3Bool $a.nativeAuthorized $false)){throw 'V3_AUTHORIZATION_BINDING'}
  if($a.records.Count -ne $naV3Policy.roles.Count){throw 'V3_AUTHORIZED_SCHEMA'}
  for($i=0;$i -lt $a.records.Count;$i++){
    $r=$naV3Policy.roles[$i];$e=$a.records[$i];$state=if($r.observedState -ceq 'observed_absent'){'absent'}else{'present'}
    if($e.role -cne $r.role -or $e.name -cne $r.name -or $e.origin -cne $r.origin -or $e.state -cne $state -or $e.length -ne $r.length -or $e.sha256 -cne $r.sha256){throw 'V3_AUTHORIZED_ROLE'}
  }
}
function Get-NAV3Context([string]$Root,[string]$AttemptId,[byte[]]$Key){
  $Root=Assert-NARoot $Root;$map=Get-NAV3Mapping $AttemptId
  $path=Join-Path $Root "authority/$AttemptId.authorization.json";$a=APOpen $path $Key
  Assert-NAV3AuthorizationShape $a $map
  if($a.attemptId -cne $AttemptId){throw 'V3_ATTEMPT_ID'}
  $prior=Join-Path $Root "authority/$($a.reconciliationId).reconciliation.json"
  if([CheckpointCrypto]::FileHash($prior) -cne $a.priorReceiptSha256){throw 'V3_RECONCILIATION_HASH'}
  $r=APOpen $prior $Key
  if($r.version -ne 3 -or $r.profile -cne 'native-current-closure-v3' -or $r.checkpointProfile -cne 'CorrectedCorePrivateV3' -or $r.checkpoint -cne $map.checkpoint -or $r.policySha256 -cne $a.policySha256 -or -not (Test-V3Bool $r.installAuthorized $false) -or $r.prior.historicalWriter -cne 'UNKNOWN' -or $null -ne $r.prior.neverCreated -or $null -ne $r.prior.historicalNotDeleted -or $r.prior.inventorySha256 -cne $a.priorInventorySha256){throw 'V3_PRIOR_BINDING'}
  $current=Get-NAV3PriorState
  if((APHash (APBytes $r.prior)) -cne (APHash (APBytes $current))){throw 'V3_PRIOR_CHANGED'}
  $a|Add-Member authorizationSha256 ([CheckpointCrypto]::FileHash($path));return $a
}
function New-NAV3AuthorizationDraft([string]$AttemptId,[string]$Id,[string]$Pin,[byte[]]$Key){
  $map=Get-NAV3Mapping $AttemptId;$root=Assert-NARoot $map.root
  if($Id -cnotmatch '^[a-f0-9]{32}$' -or $Pin -cnotmatch '^[a-f0-9]{64}$'){throw 'EXPLICIT_RECONCILIATION_REQUIRED'}
  $lock=$null;$lease=$null
  try{
    $path=CheckPath (Join-Path $root 'authority/checkpoint.lock');$lock=[IO.File]::Open($path,'OpenOrCreate','ReadWrite','None');Assert-APFile $path
    Assert-NARegistry $root;Assert-APOtherAttemptsClosed $root $AttemptId $Key
    if((Test-Path -LiteralPath $map.destination) -or (Test-Path -LiteralPath (Join-Path $root "authority/$AttemptId.authorization.json"))){throw 'ATTEMPT_OCCUPIED'}
    $prior=Join-Path $root "authority/$Id.reconciliation.json";Assert-APFile $prior
    if([CheckpointCrypto]::FileHash($prior) -cne $Pin){throw 'REVIEWED_RECONCILIATION_CHANGED'}
    $r=APOpen $prior $Key;$lease=Open-NAPriorLease;$current=Assert-NALeaseStable $lease
    if($r.profile -cne $current.profile -or $r.checkpoint -cne $current.checkpoint -or $r.policySha256 -cne $current.policySha256 -or (APHash (APBytes $r.prior)) -cne (APHash (APBytes $current.prior))){throw 'PRIOR_CLOSURE_CHANGED'}
    $meta=V3NativeMetadata $naV3Packet $naV3PolicyRaw;$null=Assert-NALeaseStable $lease
    # Unsigned review object only. Existing root issuance remains separate.
    return [ordered]@{version=3;profile='independent-attempt-v3-native';checkpointProfile='CorrectedCorePrivateV3';attemptId=$AttemptId;nonce=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant();checkpoint=$map.checkpoint;root=$root;destination=$map.destination;policySha256=$script:naReviewedProfileSha256;sourceIndexSha256='b2014ef2c2a3cfa45951f5187b02f4fadf6d08683968ee49ee0bb21d4d7da663';parentBindingSha256=$naV3Policy.bindingSha256;helperSha256='1f1454f9aea632609c002335e628c2f463f96f28cb131bc95c2ff6f2bda2a9f2';reconciliationId=$Id;priorReceiptSha256=$Pin;priorInventorySha256=$current.prior.inventorySha256;records=$meta.artifacts;captureAuthorized=$true;installAuthorized=$false;nativeAuthorized=$false}
  }finally{if($lease){Close-NALease $lease};if($lock){$lock.Dispose()}}
}
function Assert-NAV3ActiveAttempt([string]$Action,$Policy){
  # Called only inside Invoke-APAttempt while both real FileShare.None locks and
  # the prior lease are held. Re-open authenticated authorization and start event.
  if($script:naSelectedProfile -cne 'CorrectedCorePrivateV3' -or $null -eq $a -or $null -eq $AuthorityKey -or
    $lock -isnot [IO.FileStream] -or $checkpointLock -isnot [IO.FileStream] -or $null -eq $priorLease -or
    -not $lock.CanWrite -or -not $checkpointLock.CanWrite){throw 'V3_CONTROLLER_ATTEMPT_REQUIRED'}
  if($lock.Name -cne (Join-Path $a.root "authority/$($a.attemptId).lock") -or $checkpointLock.Name -cne (Join-Path $a.root 'authority/checkpoint.lock')){throw 'V3_CONTROLLER_LOCK_BINDING'}
  $current=APContext $a.root $a.attemptId $AuthorityKey
  if($current.authorizationSha256 -cne $a.authorizationSha256 -or $current.policySha256 -cne (APHash $naV3PolicyRaw) -or $current.checkpoint -cne $Policy.checkpoint){throw 'V3_CONTROLLER_CONTEXT_CHANGED'}
  $kind=if($Action -ceq 'Capture'){'capture-start'}elseif($Action -ceq 'Verify'){'verify-start'}else{throw 'V3_CONTROLLER_ACTION'}
  $event=APReadEvent $a $kind $AuthorityKey;$self=APProcess
  if($event.writer.pid -ne $self.pid -or $event.writer.startedUtc -cne $self.startedUtc){throw 'V3_CONTROLLER_WRITER'}
  return [ordered]@{attemptId=$a.attemptId;nonce=$a.nonce;authorizationSha256=$a.authorizationSha256;priorReceiptSha256=$a.priorReceiptSha256;policySha256=$a.policySha256;sourceIndexSha256=$a.sourceIndexSha256;checkpoint=$a.checkpoint;destination=$a.destination}
}
function Invoke-NAV3BoundAction([string]$Action,$a,[byte[]]$AuthorityKey,$priorLease){
  $CheckpointId=$a.checkpoint;$Destination=$a.destination;$OfflineFixture=$false;$FixtureDirectory=$null
  $kind=if($Action -ceq 'Capture'){'capture-start'}else{'verify-start'}
  APEvent $a $kind @{state=$(if($Action -ceq 'Capture'){'INTENT'}else{'VERIFY_INTENT'});installAuthorized=$false} $AuthorityKey
  $null=Invoke-V3
  $null=Assert-NALeaseStable $priorLease
  $manifest=Join-Path $a.destination 'attempt-manifest.json';Assert-APFile $manifest
  if($Action -ceq 'Capture'){
    APEvent $a 'bound' @{manifestSha256=[CheckpointCrypto]::FileHash($manifest);archiveInventorySha256=(APHash (APBytes (APInventory $a.destination)));installAuthorized=$false} $AuthorityKey
    return @{state='CAPTURED_NOT_VERIFIED';attemptId=$a.attemptId;installAuthorized=$false}
  }
  $bound=APReadEvent $a 'bound' $AuthorityKey
  if([CheckpointCrypto]::FileHash($manifest) -cne $bound.details.manifestSha256 -or (APHash (APBytes (APInventory $a.destination))) -cne $bound.details.archiveInventorySha256){throw 'V3_ARCHIVE_CHANGED_AFTER_VERIFY'}
  APEvent $a 'verified' @{manifestSha256=$bound.details.manifestSha256;backupVerified='NATIVE_BACKUP_ONLY';installAuthorized=$false} $AuthorityKey
  return @{state='VERIFIED_NATIVE_BACKUP_ONLY';attemptId=$a.attemptId;installAuthorized=$false}
}
