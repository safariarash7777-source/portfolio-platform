# Code-only candidate. Dot sourcing does not initialize or touch native state.
function Get-NAMapping([string]$AttemptId) {
  if($AttemptId -cnotmatch '^[a-f0-9]{32}$'){throw 'EXPLICIT_ATTEMPT_REQUIRED'}
  $base='C:\Users\Asus\.codex\private\cashflow-release'
  return @{checkpoint='20261030T215307Z';root="$base\attempt-control-20261030T215307Z";legacy="$base\20261030T215307Z";destination="$base\20261030T215307Z.attempt-$AttemptId"}
}
function Assert-NARoot([string]$Root){
  $fixed=(Get-NAMapping ('0'*32)).root
  if([IO.Path]::GetFullPath($Root).TrimEnd('\') -cne $fixed){throw 'FIXED_CHECKPOINT_REGISTRY_REQUIRED'}
  $null=CheckPath $fixed;CheckPrivateDirectory $fixed
  CheckPrivateDirectory (CheckPath (Join-Path $fixed 'authority'))
  return $fixed
}
function Import-NAFrozenFunction($File,$Name){
  $t=$null;$e=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($File,[ref]$t,[ref]$e)
  if($e.Count){throw 'FROZEN_PARSE'}
  $fn=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq $Name},$true)
  if(-not $fn){throw 'FROZEN_FUNCTION'}
  # Relocate source root only; transport and validators remain byte-pinned upstream.
  $body=$fn.Body.Extent.Text.Substring(1,$fn.Body.Extent.Text.Length-2).Replace('$PSScriptRoot','$script:apLegacy')
  $params=$fn.Parameters
  $text=$fn.Extent.Text.Replace("function $Name", "function script:$Name").Replace('$PSScriptRoot','$script:apLegacy')
  . ([scriptblock]::Create($text))
}
function Initialize-NA {
  . (Join-Path $PSScriptRoot 'attempt-profile.ps1')
  # Publish the loaded child functions into this script scope before returning.
  $t=$null;$e=$null;$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'attempt-profile.ps1'),[ref]$t,[ref]$e)
  foreach($f in $ast.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst]},$false)){
    Set-Item "function:script:$($f.Name)" (Get-Item "function:$($f.Name)").ScriptBlock
  }
  $script:apUtf8=[Text.UTF8Encoding]::new($false,$true)
  $script:apProfile='independent-attempt-v3-native'
  Initialize-AP
  $script:utf8=$apUtf8
  Import-NAFrozenFunction (Join-Path $apLegacy 'backup-checkpoint.ps1') 'JsonBytes'
  Import-NAFrozenFunction (Join-Path $apLegacy 'backup-checkpoint.ps1') 'V2Packet'
  foreach($name in @('R2Packet','R2RemoteScript','R2Metadata')){Import-NAFrozenFunction (Join-Path $apLegacy 'checkpoint-profile-v2r2-runtime.ps1') $name}
  $script:naPacket=R2Packet $apPolicyRaw
  Set-Item function:script:NAOriginalInventory (Get-Item function:APInventory).ScriptBlock
  Set-Item function:script:APInventory {param([string]$dir)
    if($script:naLease -and $dir -ceq $script:naLease.directory){return @(Get-NALeaseInventory $script:naLease)}
    return @(NAOriginalInventory $dir)
  }
}
function Assert-NARetainedFailure {
  $pins=[ordered]@{'intent.json'='ac3c65719134140385b7ba2a6c3187982b5ce01fc6acccbde3d6bf43b290a850';'capture-started.json'='b754df638e1f65765beecbb5eb4168c62df4808a88f26f69cbd494933f74dbd2';'capture-result.json'='74bdd56549f19a51ed1a404fbcfa9c86b743b0b8f3a1846686b968f78af25b5c'}
  foreach($name in $pins.Keys){
    $raw=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot "retained-receipts/$name"))
    if((APHash $raw) -cne $pins[$name]){throw 'RETAINED_RUNNER_RECEIPT_CHANGED'}
  }
  # Historical local writer identity was not captured. Never substitute server sshd.
  return @{receipts=$pins;historicalWriter=@{pid=$null;startedUtc=$null;state='UNKNOWN'};runnerExitCode=1}
}
function Get-NAProcessObservation {
  $self=APProcess
  $processes=@(Get-CimInstance Win32_Process -ErrorAction Stop)
  return (ConvertTo-NAProcessObservation $processes $self)
}
function ConvertTo-NAProcessObservation($processes,$self){
  $matched=@();$uncertain=@();$observerSeen=$false
  if(-not $processes.Count){throw 'PROCESS_CENSUS_UNAVAILABLE'}
  foreach($p in $processes){
    if($p.ProcessId -eq $self.pid){
      if(-not $p.CreationDate){throw 'OBSERVER_PROCESS_IDENTITY'}
      $cimTicks=([datetime]$p.CreationDate).ToUniversalTime().Ticks
      $processTicks=([DateTimeOffset]::Parse($self.startedUtc)).UtcTicks
      # CIM truncates to microseconds (10 ticks); preserve exact PID and only
      # accept the same microsecond bucket, never a symmetric time tolerance.
      $deltaTicks=$processTicks-$cimTicks
      if(($cimTicks % 10) -ne 0 -or $deltaTicks -lt 0 -or $deltaTicks -gt 9){throw 'OBSERVER_PROCESS_IDENTITY'}
      $observerSeen=$true
      continue
    }
    $candidate=$p.Name -match '^(pwsh|powershell|python[0-9.]*|ssh|cmd|wscript|cscript)\.exe$'
    if($candidate -and -not $p.CommandLine){$uncertain+= [int]$p.ProcessId;continue}
    if($p.CommandLine -and $p.CommandLine -match '(?i)20261030T215307Z|cashflow-release|backup-checkpoint\.ps1|native-caller\.ps1|independent-attempt-v3'){
      if(-not $p.CreationDate){throw 'PROCESS_CREATION_UNKNOWN'}
      $matched+=@{pid=[int]$p.ProcessId;startedUtc=([datetime]$p.CreationDate).ToUniversalTime().ToString('o')}
    }
  }
  if(-not $observerSeen -or $uncertain.Count -or $matched.Count){throw 'CURRENT_WRITER_NOT_EXCLUDED'}
  return @{atUtc=[datetime]::UtcNow.ToString('o');observer=$self;method='WIN32_PROCESS_FULL_CENSUS_COMMAND_IDENTITY';matchingWriters=@();uninspectableCandidates=@();processCount=$processes.Count}
}
function Get-NALeaseInventory($Lease){
  $names=@(Get-ChildItem -LiteralPath $Lease.directory -Force | Sort-Object Name)
  if(($names.Name -join '|') -cne (($Lease.files.name|Sort-Object) -join '|')){throw 'PRIOR_INVENTORY_CHANGED'}
  $directoryAcl=(Get-Acl -LiteralPath $Lease.directory).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]'Access,Owner,Group')
  CheckPrivateDirectory (CheckPath $Lease.directory)
  return @(foreach($item in $Lease.files){
    $path=Join-Path $Lease.directory $item.name;Assert-APFile $path
    $item.stream.Position=0;$hash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($item.stream)).ToLowerInvariant();$item.stream.Position=0
    [ordered]@{name=$item.name;length=$item.stream.Length;sha256=$hash;acl=(Get-Acl -LiteralPath $path).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]'Access,Owner,Group');directoryAcl=$directoryAcl}
  })
}
function Open-NAPriorLease {
  # Caller MUST hold fixed checkpoint lock. Files open read-only FileShare.None.
  $historical=Assert-NARetainedFailure
  $map=Get-NAMapping ('0'*32);CheckPrivateDirectory (CheckPath $map.legacy)
  $before=Get-NAProcessObservation
  $lease=@{directory=$map.legacy;files=@();historical=$historical;before=$before}
  try{
    $items=@(Get-ChildItem -LiteralPath $map.legacy -Force|Sort-Object Name)
    if(-not $items.Count){throw 'OLD_PARTIAL_MISSING'}
    foreach($item in $items){
      if($item.PSIsContainer){throw 'PRIOR_SUBDIRECTORY'};Assert-APFile $item.FullName
      $lease.files+=@{name=$item.Name;stream=[IO.File]::Open($item.FullName,'Open','Read','None')}
    }
    $lease.inventory=@(Get-NALeaseInventory $lease);$script:naLease=$lease
    $null=Assert-NALeaseStable $lease
    return $lease
  }catch{Close-NALease $lease;throw}
}
function Assert-NALeaseStable($Lease){
  $after=Get-NAProcessObservation
  $inventory=@(Get-NALeaseInventory $Lease)
  if((APHash (APBytes $inventory)) -cne (APHash (APBytes $Lease.inventory))){throw 'PRIOR_CHANGED_DURING_RECONCILIATION'}
  return @{version=1;profile='native-current-closure-v1';checkpoint='20261030T215307Z';state='CURRENT_ARCHIVE_EXCLUSIVELY_QUIESCENT';historicalWriter=$Lease.historical.historicalWriter;runnerReceipts=$Lease.historical.receipts;runnerExitCode=1;before=$Lease.before;after=$after;exclusiveAccess='ALL_EXACT_ARCHIVE_FILES_READ_ONLY_FILESHARE_NONE';inventorySha256=(APHash (APBytes $inventory));installAuthorized=$false;historicalWriterClosed=$null}
}
function Close-NALease($Lease){foreach($f in $Lease.files){if($f.stream){$f.stream.Dispose()}};$script:naLease=$null}
function Invoke-NAReconciliation([byte[]]$AuthorityKey,[string]$ReconciliationId){
  if($ReconciliationId -cnotmatch '^[a-f0-9]{32}$'){throw 'RECONCILIATION_ID'}
  $root=Assert-NARoot (Get-NAMapping ('0'*32)).root;$lock=$null;$lease=$null
  try{
    $path=Join-Path $root 'authority/checkpoint.lock';$null=CheckPath $path
    $lock=[IO.File]::Open($path,'OpenOrCreate','ReadWrite','None');Assert-APFile $path
    Assert-NARegistry $root
    $lease=Open-NAPriorLease;$receipt=Assert-NALeaseStable $lease
    $out=Join-Path $root "authority/$ReconciliationId.reconciliation.json"
    WriteNew $out (APSign $receipt $AuthorityKey)
    return @{receiptSha256=[CheckpointCrypto]::FileHash($out);reconciliationId=$ReconciliationId;historicalWriter='UNKNOWN';state='CURRENT_ARCHIVE_EXCLUSIVELY_QUIESCENT';installAuthorized=$false}
  }finally{if($lease){Close-NALease $lease};if($lock){$lock.Dispose()}}
}
function Assert-NARegistry([string]$Root){
  $Root=Assert-NARoot $Root
  $dir=Join-Path $Root 'authority'
  foreach($f in Get-ChildItem -LiteralPath $dir -Force){
    if($f.PSIsContainer){throw 'REGISTRY_SUBDIRECTORY'};Assert-APFile $f.FullName
    if($f.Name -cmatch '^([a-f0-9]{32})\.(lock|capture-start\.json|bound\.json|verify-start\.json|verified\.json)$'){
      if(-not (Test-Path -LiteralPath (Join-Path $dir "$($Matches[1]).authorization.json"))){throw 'ORPHAN_PENDING_ATTEMPT'}
    }elseif($f.Name -cnotmatch '^([a-f0-9]{32}\.(authorization|reconciliation)\.json|checkpoint\.lock|controller-key\.dpapi)$'){throw 'UNKNOWN_REGISTRY_FILE'}
  }
  $map=Get-NAMapping ('0'*32);$base=Split-Path $map.legacy
  foreach($d in Get-ChildItem -LiteralPath $base -Filter '20261030T215307Z.attempt-*' -Force){
    $id=$d.Name.Replace('20261030T215307Z.attempt-','')
    if($id -cnotmatch '^[a-f0-9]{32}$' -or -not $d.PSIsContainer -or -not (Test-Path -LiteralPath (Join-Path $dir "$id.authorization.json"))){throw 'ORPHAN_ARCHIVE_ATTEMPT'}
    CheckPrivateDirectory (CheckPath $d.FullName)
  }
}
function APContext([string]$Root,[string]$AttemptId,[byte[]]$AuthorityKey){
  $Root=Assert-NARoot $Root;$map=Get-NAMapping $AttemptId
  $path=Join-Path $Root "authority/$AttemptId.authorization.json";$a=APOpen $path $AuthorityKey
  if($a.version -ne 3 -or $a.profile -cne 'independent-attempt-v3-native' -or $a.attemptId -cne $AttemptId -or $a.nonce -cnotmatch '^[a-f0-9]{64}$' -or $a.root -cne $Root -or $a.destination -cne $map.destination -or $a.checkpoint -cne $map.checkpoint -or $a.policySha256 -cne (Get-R2PolicyPin) -or $a.parentBindingSha256 -cne $apPolicy.parentBindingSha256 -or $a.helperSha256 -cne $apPolicy.helperSha256 -or -not (Test-V2Bool $a.installAuthorized $false) -or -not (Test-V2Bool $a.nativeAuthorized $false) -or -not (Test-V2Bool $a.captureAuthorized $true) -or $a.reconciliationId -cnotmatch '^[a-f0-9]{32}$'){throw 'NATIVE_AUTHORIZATION_BINDING'}
  $prior=Join-Path $Root "authority/$($a.reconciliationId).reconciliation.json"
  if([CheckpointCrypto]::FileHash($prior) -cne $a.priorReceiptSha256){throw 'PRIOR_RECEIPT_CHANGED'}
  $r=APOpen $prior $AuthorityKey;$history=Assert-NARetainedFailure
  if($r.profile -cne 'native-current-closure-v1' -or $r.checkpoint -cne $map.checkpoint -or $r.state -cne 'CURRENT_ARCHIVE_EXCLUSIVELY_QUIESCENT' -or $r.runnerExitCode -ne 1 -or $r.historicalWriter.state -cne 'UNKNOWN' -or $null -ne $r.historicalWriter.pid -or $null -ne $r.historicalWriter.startedUtc -or $null -ne $r.historicalWriterClosed -or $r.inventorySha256 -cne $a.priorInventorySha256){throw 'PRIOR_RECONCILIATION_BINDING'}
  foreach($name in $history.receipts.Keys){if($r.runnerReceipts.$name -cne $history.receipts[$name]){throw 'RUNNER_RECEIPT_BINDING'}}
  if((APHash (APBytes (APInventory $map.legacy))) -cne $a.priorInventorySha256){throw 'PRIOR_ARCHIVE_CHANGED'}
  Assert-R2Entries $a.records $apPolicyRaw 'native-ssh-v2r2'
  $proofRaw=[Convert]::FromBase64String($a.attestationBase64)
  if($proofRaw.Length -gt 32768 -or $proofRaw.Length -ne $a.records[16].length -or (APHash $proofRaw) -cne $a.records[16].sha256){throw 'AUTHORIZED_ATTESTATION_BYTES'}
  Assert-R2Proof ($apUtf8.GetString($proofRaw)|ConvertFrom-Json) 'native-ssh-v2r2'
  $a|Add-Member authorizationSha256 ([CheckpointCrypto]::FileHash($path))
  return $a
}
function NAFreshMetadata($a){
  $meta=R2Metadata $naPacket $apPolicyRaw
  for($i=0;$i -lt 16;$i++){
    if($i -ne 5 -and ($meta.artifacts[$i].sha256 -cne $a.records[$i].sha256 -or $meta.artifacts[$i].length -ne $a.records[$i].length)){throw 'NATIVE_SOURCE_CHANGED'}
  }
  return $meta
}
function New-NAAuthorizationDraft([string]$AttemptId,[string]$ReconciliationId,[string]$ReviewedReconciliationSha256,[byte[]]$AuthorityKey){
  $map=Get-NAMapping $AttemptId;$root=Assert-NARoot $map.root
  if($ReconciliationId -cnotmatch '^[a-f0-9]{32}$' -or $ReviewedReconciliationSha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'EXPLICIT_RECONCILIATION_REQUIRED'}
  $lock=$null;$lease=$null
  try{
    $lockPath=Join-Path $root 'authority/checkpoint.lock';$null=CheckPath $lockPath
    $lock=[IO.File]::Open($lockPath,'OpenOrCreate','ReadWrite','None');Assert-APFile $lockPath
    Assert-NARegistry $root;Assert-APOtherAttemptsClosed $root $AttemptId $AuthorityKey
    if((Test-Path -LiteralPath $map.destination) -or (Test-Path -LiteralPath (Join-Path $root "authority/$AttemptId.authorization.json"))){throw 'ATTEMPT_OCCUPIED'}
    $prior=Join-Path $root "authority/$ReconciliationId.reconciliation.json";Assert-APFile $prior
    if([CheckpointCrypto]::FileHash($prior) -cne $ReviewedReconciliationSha256){throw 'REVIEWED_RECONCILIATION_CHANGED'}
    $r=APOpen $prior $AuthorityKey;$lease=Open-NAPriorLease;$current=Assert-NALeaseStable $lease
    if($r.profile -cne $current.profile -or $r.state -cne $current.state -or $r.inventorySha256 -cne $current.inventorySha256 -or $r.historicalWriter.state -cne 'UNKNOWN'){throw 'PRIOR_CLOSURE_CHANGED'}
    $meta=R2Metadata $naPacket $apPolicyRaw
    $null=Assert-NALeaseStable $lease
    return [ordered]@{version=3;profile='independent-attempt-v3-native';attemptId=$AttemptId;nonce=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant();checkpoint=$map.checkpoint;root=$root;destination=$map.destination;policySha256=(Get-R2PolicyPin);parentBindingSha256=$apPolicy.parentBindingSha256;helperSha256=$apPolicy.helperSha256;reconciliationId=$ReconciliationId;priorReceiptSha256=$ReviewedReconciliationSha256;priorInventorySha256=$current.inventorySha256;records=$meta.artifacts;attestationBase64=[Convert]::ToBase64String($meta.attestationRaw);captureAuthorized=$true;installAuthorized=$false;nativeAuthorized=$false}
  }finally{if($lease){Close-NALease $lease};if($lock){$lock.Dispose()}}
}
function Get-NASourceKind([int]$Index){
  if($Index -lt 0 -or $Index -gt 16 -or $Index -eq 5){throw 'ABSENT_OR_INVALID_SOURCE'}
  if($Index -eq 15){return 'PINNED_BINDING_MEMORY'}
  if($Index -eq 16){return 'AUTHORIZED_ATTESTATION_MEMORY'}
  return 'PINNED_SSH_STREAM'
}
function Write-NACipher($a,[int]$Index,[string]$Destination,[string]$Header,[byte[]]$Master){
  $kind=Get-NASourceKind $Index;$entry=$a.records[$Index];$stream=$null;$ssh=$null
  try{
    if($kind -ceq 'PINNED_SSH_STREAM'){
      $ssh=[CheckpointSsh]::new('python3 -',(R2RemoteScript $naPacket 'file' $Index ([long]$entry.length) $entry.sha256),1800);$stream=$ssh.Output
    }else{
      $raw=if($Index -eq 15){$naPacket.binding}else{[Convert]::FromBase64String($a.attestationBase64)}
      if($raw.Length -ne $entry.length -or (APHash $raw) -cne $entry.sha256){throw 'MEMORY_SOURCE_CHANGED'}
      $stream=[IO.MemoryStream]::new([byte[]]$raw,$false)
    }
    [CheckpointCrypto]::Encrypt($stream,$Destination,$Header,[long]$entry.length,$entry.sha256,$Master)
    if($ssh){$ssh.Complete()}
  }finally{if($ssh){$ssh.Dispose()}elseif($stream){$stream.Dispose()}}
}
function Assert-NAPostProof($Manifest){
  $raw=[Convert]::FromBase64String($Manifest.postCaptureAttestationBase64)
  if($raw.Length -gt 32768 -or (APHash $raw) -cne $Manifest.postCaptureAttestationSha256){throw 'POST_CAPTURE_PROOF_BYTES'}
  Assert-R2Proof ($apUtf8.GetString($raw)|ConvertFrom-Json) 'native-ssh-v2r2'
}
