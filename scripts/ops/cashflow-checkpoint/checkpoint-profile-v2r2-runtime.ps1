# Explicit caller-only runtime. Loading this file performs no operation.
function Get-R2PolicyRaw {
  $repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
  $raw=BoundedBytes (Join-Path $repo 'docs/ops/p15-webpack-cache-20261030/CORRECTED-FAILED-V2R2-POLICY.json') 8192
  $null=Assert-R2Policy $raw
  return ,$raw
}
function R2Packet([byte[]]$PolicyRaw) {
  $null=Assert-R2Policy $PolicyRaw
  $old=V2Packet
  $parts=$utf8.GetString($old.packet)|ConvertFrom-Json
  $code=$utf8.GetBytes(([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'checkpoint-profile-v2r2-remote.py'),$utf8)).Replace("`r`n","`n"))
  if([CheckpointCrypto]::Hash($code) -cne 'e5c8e4c9d95b46c9b34ddd95fc780bec7b431c1d87aebcea4077bd44b80900a1'){throw 'r2 remote source pin'}
  return @{code=$code;binding=$old.binding;packet=(JsonBytes @{consumer=[Convert]::ToBase64String($old.consumer);gate=$parts.gate;binding=$parts.binding;policy=[Convert]::ToBase64String($PolicyRaw)})}
}
function R2RemoteScript($Packet,[string]$Mode,[int]$Index=-1,[long]$Length=0,[string]$Hash='') {
  if($Mode -cnotin @('metadata','file') -or ($Mode -ceq 'file' -and ($Index -lt 0 -or $Index -ge 15 -or $Index -eq 5 -or $Length -lt 0 -or $Hash -cnotmatch '^[a-f0-9]{64}$'))){throw 'r2 remote arguments'}
  $prefix="CODE=bytes.fromhex('"+[Convert]::ToHexString($Packet.code)+"')`nPACKET=bytes.fromhex('"+[Convert]::ToHexString($Packet.packet)+"')`nMODE='$Mode'`nINDEX=$Index`nLENGTH=$Length`nHASH='$Hash'`n"
  return $prefix+@'
import hashlib,json,signal,types
signal.signal(signal.SIGALRM,lambda *_: (_ for _ in ()).throw(TimeoutError()))
signal.alarm(170 if MODE=='metadata' else 1790)
if hashlib.sha256(CODE).hexdigest()!='e5c8e4c9d95b46c9b34ddd95fc780bec7b431c1d87aebcea4077bd44b80900a1':raise ValueError()
module=types.ModuleType('pinned_failed_v2r2')
exec(compile(CODE,'/in-memory/checkpoint-profile-v2r2-remote.py','exec'),module.__dict__)
module.run(json.loads(PACKET),MODE,INDEX,LENGTH,HASH)
'@
}
function R2Metadata($Packet,[byte[]]$PolicyRaw) {
  $ssh=[CheckpointSsh]::new('python3 -',(R2RemoteScript $Packet 'metadata'),180)
  try{$meta=$utf8.GetString($ssh.ReadMetadata())|ConvertFrom-Json}finally{$ssh.Dispose()}
  if($meta.policySha256 -cne (Get-R2PolicyPin) -or -not (Test-V2Bool $meta.readiness $false) -or -not (Test-V2Bool $meta.releaseAuthorized $false)){throw 'r2 metadata'}
  Assert-R2Entries $meta.artifacts $PolicyRaw 'native-ssh-v2r2'
  Assert-R2Observation $meta.artifacts[5].observation 'native-ssh-v2r2' -Fresh
  $raw=[Convert]::FromBase64String($meta.attestationBase64)
  if($raw.Length -gt 32768 -or $raw.Length -ne $meta.artifacts[16].length -or [CheckpointCrypto]::Hash($raw) -cne $meta.artifacts[16].sha256){throw 'r2 attestation bytes'}
  $proof=$utf8.GetString($raw)|ConvertFrom-Json;Assert-R2Proof $proof 'native-ssh-v2r2' -Fresh
  return @{artifacts=@($meta.artifacts);attestation=$proof;attestationRaw=$raw}
}
function R2FixtureMetadata([string]$Directory,[byte[]]$PolicyRaw) {
  $policy=Assert-R2Policy $PolicyRaw
  $records=@(for($i=0;$i -lt 17;$i++){
    $r=$policy.roles[$i];$path=CheckPath (Join-Path $Directory ('r2-source-{0:d2}.bin' -f $i))
    if($i -eq 5){
      if(Test-Path -LiteralPath $path){throw 'r2 final appeared'}
      @{role=$r.role;name=$r.name;origin=$r.origin;state='absent';length=$null;sha256=$null;owner=$null;observation=@{atUtc=[datetime]::UtcNow.ToString('o');method='SYNTHETIC_CHILD_ENOENT_ONLY';neverCreated=$null;historicalNotDeleted=$null}}
    }else{@{role=$r.role;name=$r.name;origin=$r.origin;state='present';length=([IO.FileInfo]$path).Length;sha256=[CheckpointCrypto]::FileHash($path);owner=$null}}
  })
  Assert-R2Entries $records $PolicyRaw 'offline-synthetic-v2r2'
  $proof=$utf8.GetString((BoundedBytes (Join-Path $Directory 'r2-source-16.bin') 32768))|ConvertFrom-Json
  Assert-R2Proof $proof 'offline-synthetic-v2r2'
  $original=$utf8.GetString((BoundedBytes (Join-Path $Directory 'r2-source-06.bin') 32768))|ConvertFrom-Json
  if($original.status -cne 'failed' -or -not (Test-V2Bool $original.synthetic $true)){throw 'r2 original failure'}
  return @{artifacts=$records;attestation=$proof}
}
function Invoke-V2R2([string]$Mode) {
  Assert-R2Mode $Mode
  $policyRaw=Get-R2PolicyRaw;$policy=Assert-R2Policy $policyRaw;$profileName=$policy.profile;$packet=$null
  if($Mode -ceq 'native-ssh-v2r2' -and $CheckpointId -cne $policy.checkpoint){throw 'r2 checkpoint'}
  if($Action -ceq 'Capture'){
    $script:stage='r2-metadata'
    if($OfflineFixture){
      $FixtureDirectory=CheckPath $FixtureDirectory
      if(-not $FixtureDirectory.StartsWith($testRoot,[StringComparison]::OrdinalIgnoreCase) -or [IO.File]::ReadAllText((Join-Path $FixtureDirectory 'fixture-only.txt')) -cne 'SYNTHETIC-OFFLINE-ONLY'){throw 'r2 fixture'}
      $meta=R2FixtureMetadata $FixtureDirectory $policyRaw
    }else{$packet=R2Packet $policyRaw;$meta=R2Metadata $packet $policyRaw}
    $entries=@($meta.artifacts);$needed=1GB
    foreach($entry in $entries){if($entry.state -ceq 'present'){$needed=[long]$needed+[long]$entry.length+32768}}
    if([IO.DriveInfo]::new([IO.Path]::GetPathRoot($Destination)).AvailableFreeSpace -lt $needed){throw 'r2 space'}
    $script:stage='r2-destination';PrivateDirectory $Destination;CheckPrivateDirectory $Destination
    $script:master=[Security.Cryptography.RandomNumberGenerator]::GetBytes(64);$script:macKey=$master[32..63]
    WriteNew (Join-Path $Destination 'master.dpapi') ([Security.Cryptography.ProtectedData]::Protect($master,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser))
    $records=@();$script:stage='r2-capture'
    for($i=0;$i -lt 17;$i++){
      $entry=$entries[$i]
      $record=[ordered]@{role=$entry.role;name=$entry.name;origin=$entry.origin;state=$entry.state;length=$entry.length;sha256=$entry.sha256;owner=$entry.owner}
      if($i -eq 5){
        $record.observation=$entry.observation;$record.cipherName=$null;$record.cipherLength=$null;$record.cipherSha256=$null;$record.header=$null
        $records+=,$record;continue
      }
      $header=([ordered]@{version=2;profileRevision=2;profile=$profileName;policySha256=(Get-R2PolicyPin);checkpoint=$CheckpointId;helperSha256=$approvedHelper;sourceMode=$Mode;role=$entry.role;name=$entry.name;origin=$entry.origin;length=[long]$entry.length;sha256=$entry.sha256}|ConvertTo-Json -Compress)
      $cipherName=Get-R2Cipher $i;$cipher=Join-Path $Destination $cipherName
      if($OfflineFixture){$inputStream=[IO.File]::OpenRead((CheckPath (Join-Path $FixtureDirectory ('r2-source-{0:d2}.bin' -f $i))));try{[CheckpointCrypto]::Encrypt($inputStream,$cipher,$header,[long]$entry.length,$entry.sha256,$master)}finally{$inputStream.Dispose()}}
      elseif($i -ge 15){$bytes=if($i -eq 15){$packet.binding}else{$meta.attestationRaw};$inputStream=[IO.MemoryStream]::new($bytes,$false);try{[CheckpointCrypto]::Encrypt($inputStream,$cipher,$header,[long]$entry.length,$entry.sha256,$master)}finally{$inputStream.Dispose()}}
      else{$ssh=[CheckpointSsh]::new('python3 -',(R2RemoteScript $packet 'file' $i ([long]$entry.length) $entry.sha256),1800);try{[CheckpointCrypto]::Encrypt($ssh.Output,$cipher,$header,[long]$entry.length,$entry.sha256,$master);$ssh.Complete()}finally{$ssh.Dispose()}}
      $record.header=$header;$record.cipherName=$cipherName;$record.cipherLength=([IO.FileInfo]$cipher).Length;$record.cipherSha256=[CheckpointCrypto]::FileHash($cipher)
      $records+=,$record
    }
    $script:stage='r2-post-capture'
    $after=if($OfflineFixture){R2FixtureMetadata $FixtureDirectory $policyRaw}else{R2Metadata $packet $policyRaw}
    $last=if($OfflineFixture){16}else{15}
    for($i=0;$i -le $last;$i++){
      if($i -eq 5){continue}
      if($after.artifacts[$i].role -cne $entries[$i].role -or $after.artifacts[$i].length -ne $entries[$i].length -or $after.artifacts[$i].sha256 -cne $entries[$i].sha256){throw 'r2 source changed'}
    }
    $independent=@{storageBinary='NOT_VERIFIED';currentSql='NOT_VERIFIED';capacity='NOT_VERIFIED';snapshotCoverage=$(if($OfflineFixture){'SYNTHETIC_ONLY'}else{'CORE_EXPORT_ONLY_GLOBALS_PRIVATE_SEPARATE'})}
    $manifestObject=[ordered]@{version=2;profileRevision=2;profile=$profileName;checkpoint=$CheckpointId;helperSha256=$approvedHelper;sourceMode=$Mode;originalStatus='failed';policySha256=(Get-R2PolicyPin);policyBase64=[Convert]::ToBase64String($policyRaw);parentBindingSha256=$policy.parentBindingSha256;attestation=$meta.attestation;postCaptureAttestation=$after.attestation;postCaptureAbsence=$after.artifacts[5].observation;readiness=$false;releaseAuthorized=$false;independentGates=$independent;artifacts=$records}
    Assert-R2Manifest ([pscustomobject]$manifestObject) $policyRaw $CheckpointId $Mode
    $manifest=JsonBytes $manifestObject
    if($manifest.Length -gt 65536){throw 'r2 manifest bound'}
    $script:stage='r2-manifest';WriteNew (Join-Path $Destination 'manifest.json') $manifest
    WriteNew (Join-Path $Destination 'manifest.hmac') ([CheckpointCrypto]::Mac($manifest,$macKey))
    WriteNew (Join-Path $Destination 'capture-complete.json') (JsonBytes @{status='CAPTURED_NOT_VERIFIED';version=2;profileRevision=2;profile=$profileName;checkpoint=$CheckpointId;sourceMode=$Mode;records=17;streams=16;policySha256=(Get-R2PolicyPin);manifestSha256=[CheckpointCrypto]::Hash($manifest);readiness=$false;releaseAuthorized=$false})
    [Console]::WriteLine("CHECKPOINT_CAPTURED records=17 streams=16 mode=$Mode profile=$profileName")
  }else{
    $script:stage='r2-manifest-authentication';CheckPrivateDirectory $Destination
    $script:master=[Security.Cryptography.ProtectedData]::Unprotect((BoundedBytes (Join-Path $Destination 'master.dpapi') 16384),$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    if($master.Length -ne 64){throw 'r2 key'};$script:macKey=$master[32..63]
    $manifest=BoundedBytes (Join-Path $Destination 'manifest.json') 65536
    if(-not [CheckpointCrypto]::Equal([CheckpointCrypto]::Mac($manifest,$macKey),(BoundedBytes (Join-Path $Destination 'manifest.hmac') 32))){throw 'r2 manifest MAC'}
    $m=$utf8.GetString($manifest)|ConvertFrom-Json;Assert-R2Manifest $m $policyRaw $CheckpointId $Mode
    $completed=$utf8.GetString((BoundedBytes (Join-Path $Destination 'capture-complete.json') 4096))|ConvertFrom-Json
    if($completed.status -cne 'CAPTURED_NOT_VERIFIED' -or $completed.version -ne 2 -or $completed.profileRevision -ne 2 -or $completed.profile -cne $profileName -or $completed.checkpoint -cne $CheckpointId -or $completed.sourceMode -cne $Mode -or $completed.records -ne 17 -or $completed.streams -ne 16 -or $completed.policySha256 -cne (Get-R2PolicyPin) -or $completed.manifestSha256 -cne [CheckpointCrypto]::Hash($manifest) -or -not (Test-V2Bool $completed.readiness $false) -or -not (Test-V2Bool $completed.releaseAuthorized $false)){throw 'r2 incomplete'}
    $script:stage='r2-verify'
    foreach($entry in $m.artifacts){
      if($entry.state -ceq 'absent'){continue}
      $path=CheckPath (Join-Path $Destination $entry.cipherName)
      if(([IO.FileInfo]$path).Length -ne $entry.cipherLength -or [CheckpointCrypto]::FileHash($path) -cne $entry.cipherSha256){throw 'r2 ciphertext'}
      [CheckpointCrypto]::Verify($path,$entry.header,[long]$entry.length,$entry.sha256,$master)
    }
    WriteNew (Join-Path $Destination 'verified.json') (JsonBytes @{status='PASS';version=2;profileRevision=2;profile=$profileName;checkpoint=$CheckpointId;sourceMode=$Mode;records=17;streams=16;policySha256=(Get-R2PolicyPin);manifestSha256=[CheckpointCrypto]::Hash($manifest);verifiedAt=[datetime]::UtcNow.ToString('o');readiness=$false;releaseAuthorized=$false;independentGates=$m.independentGates;verification='HMAC before decrypt; all 16 complete plaintext SHA256/length to memory-only hashing sink; one explicit absent descriptor'})
    [Console]::WriteLine("CHECKPOINT_VERIFIED records=17 streams=16 mode=$Mode profile=$profileName")
  }
}
