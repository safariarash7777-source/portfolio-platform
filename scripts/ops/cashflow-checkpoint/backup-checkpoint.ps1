param(
  [Parameter(Mandatory)][string]$Action,
  [Parameter(Mandatory)][string]$CheckpointId,
  [Parameter(Mandatory)][string]$ReviewedHelperSha256,
  [string]$Destination,
  [switch]$OfflineFixture,
  [string]$FixtureDirectory,
  [string]$Profile='LegacyV1'
)
$ErrorActionPreference='Stop'
$stage='parameters';$master=$null;$macKey=$null
$approvedHelper='1f1454f9aea632609c002335e628c2f463f96f28cb131bc95c2ff6f2bda2a9f2'
$files=@('postgres.dump','globals.private.sql','cron.private.json','source-inventory.private','target-inventory.private','comparison.private.json','receipt.json')
$utf8=[Text.UTF8Encoding]::new($false,$true)
$entropy=$utf8.GetBytes('cashflow-backup-checkpoint.v1')
function JsonBytes($Value){return ,$utf8.GetBytes(($Value|ConvertTo-Json -Depth 12 -Compress))}
function WriteNew([string]$Path,[byte[]]$Bytes){$f=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$f.Write($Bytes,0,$Bytes.Length);$f.Flush($true)}finally{$f.Dispose()}}
function CheckPath([string]$Path){$p=[IO.Path]::GetFullPath($Path);$walk=$p;while($walk){if([IO.File]::Exists($walk) -or [IO.Directory]::Exists($walk)){if(([IO.File]::GetAttributes($walk) -band [IO.FileAttributes]::ReparsePoint)-ne 0){throw 'path'}};$walk=[IO.Path]::GetDirectoryName($walk)};return $p}
function PrivateDirectory([string]$Path){
  if(Test-Path -LiteralPath $Path){throw 'exists'}
  [IO.Directory]::CreateDirectory($Path)|Out-Null
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false);$acl.SetOwner($sid)
  foreach($who in @($sid,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($who,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
  Set-Acl -LiteralPath $Path -AclObject $acl
}
function CheckPrivateDirectory([string]$Path){
  $acl=Get-Acl -LiteralPath $Path;$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  if(-not $acl.AreAccessRulesProtected -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $sid){throw 'acl'}
  $rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
  if($rules.Count -ne 2 -or @($rules|Where-Object {$_.IdentityReference.Value -cnotin @($sid,'S-1-5-18') -or $_.AccessControlType -ne 'Allow' -or $_.FileSystemRights -ne 'FullControl'}).Count){throw 'acl'}
}
function BoundedBytes([string]$Path,[int]$Maximum){if(([IO.FileInfo]$Path).Length -gt $Maximum){throw 'size'};return ,[IO.File]::ReadAllBytes($Path)}
function SafeProof($Proof){
  if($Proof.status -ne 'passed' -or $Proof.startedAt -cne $CheckpointId -or $Proof.source -cne 'portfolio-stage-db-1' -or $Proof.sourceImage -cne 'sha256:6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb' -or $Proof.comparisonEqual -ne $true -or $Proof.mismatchCounts.sourceOnly -ne 0 -or $Proof.mismatchCounts.targetOnly -ne 0 -or $Proof.sourceContainerUnchanged -ne $true -or $Proof.sourceHealthyAfter -ne $true -or $Proof.targetStopped -ne $true -or $Proof.network -cne 'none' -or $Proof.portsPublished -ne $false -or $Proof.cronEnabledOnTarget -ne $false){throw 'proof'}
  if($Proof.inventoryLines.source -lt 1 -or $Proof.inventoryLines.source -ne $Proof.inventoryLines.target){throw 'inventory'}
}
function RemoteScript([string]$Mode,[string]$Name=''){
  # Both interpolated values are validated/fixed before this code is constructed. No credentials or row data in argv/stdin.
  $prefix="STAMP='$CheckpointId'`nEXPECTED='$approvedHelper'`nMODE='$Mode'`nNAME='$Name'`n"
  return $prefix+@'
import os,sys,json,hashlib,pathlib,stat,subprocess,fcntl
names=['postgres.dump','globals.private.sql','cron.private.json','source-inventory.private','target-inventory.private','comparison.private.json','receipt.json']
root=pathlib.Path('/root/portfolio-recovery-backups')/STAMP
def opened(name):
 if name not in names: raise ValueError()
 fd=os.open(str(root/name),os.O_RDONLY|os.O_NOFOLLOW)
 st=os.fstat(fd)
 if not stat.S_ISREG(st.st_mode) or st.st_uid!=0 or st.st_mode&0o077: os.close(fd);raise ValueError()
 return os.fdopen(fd,'rb')
def digest(f):
 h=hashlib.sha256();n=0
 for b in iter(lambda:f.read(65536),b''):h.update(b);n+=len(b)
 return n,h.hexdigest()
try:
 st=root.lstat()
 if not stat.S_ISDIR(st.st_mode) or stat.S_ISLNK(st.st_mode) or st.st_uid!=0 or st.st_mode&0o077:raise ValueError()
 if MODE=='metadata':
  with open('/root/portfolio-recovery-backups/.cashflow-release.lock','rb') as lock:
   fcntl.flock(lock,fcntl.LOCK_SH|fcntl.LOCK_NB)
   with open('/root/portfolio-recovery-tools/cashflow-native-reviewed.py','rb') as helper:
    if digest(helper)[1]!=EXPECTED:raise ValueError()
   with opened('receipt.json') as f:proof=json.load(f)
   state=subprocess.check_output(['docker','inspect','--format','{{.Id}}|{{.Image}}|{{.State.Health.Status}}','portfolio-stage-db-1'],stderr=subprocess.DEVNULL).decode().strip().split('|')
   if state!=[proof['sourceContainerId'],proof['sourceImage'],'healthy']:raise ValueError()
   target='portfolio-recovery-proof-'+STAMP.lower()
   if proof['target']!=target or proof['privateDirectory']!=str(root):raise ValueError()
   state=subprocess.check_output(['docker','inspect','--format','{{.Image}}|{{.State.Running}}|{{.HostConfig.NetworkMode}}|{{json .HostConfig.PortBindings}}',target],stderr=subprocess.DEVNULL).decode().strip().split('|')
   if len(state)!=4 or state[:3]!=[proof['sourceImage'],'false','none'] or state[3] not in ('null','{}'):raise ValueError()
   entries=[]
   for name in names:
    with opened(name) as f:length,sha=digest(f)
    entries.append({'name':name,'length':length,'sha256':sha})
   if entries[0]['length']!=proof['dumpBytes'] or entries[0]['sha256']!=proof['dumpSha256']:raise ValueError()
   print(json.dumps({'files':entries,'proof':proof},separators=(',',':')))
 elif MODE=='file':
  with opened(NAME) as f:
   for b in iter(lambda:f.read(65536),b''):sys.stdout.buffer.write(b)
 else:raise ValueError()
except BaseException:
 sys.exit(1)
'@
}
function V2Packet {
  $repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'));$pins=Get-V2Pins
  $gateRoot=Join-Path $repo 'docs/ops/p15-webpack-cache-20261030'
  # Only reviewed executable source is LF-normalized. Never normalize artifacts.
  $consumer=$utf8.GetBytes(([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'corrected-checkpoint-consumer.py'),$utf8)).Replace("`r`n","`n"))
  $gate=$utf8.GetBytes(([IO.File]::ReadAllText((Join-Path $gateRoot 'checkpoint-read-gate.py'),$utf8)).Replace("`r`n","`n"))
  $binding=[IO.File]::ReadAllBytes((Join-Path $gateRoot 'RELEASE-BINDING-20261031.json'))
  if([CheckpointCrypto]::Hash($consumer) -cne $pins.consumer -or [CheckpointCrypto]::Hash($gate) -cne $pins.gate -or [CheckpointCrypto]::Hash($binding) -cne $pins.binding){throw 'v2 source pins'}
  return @{consumer=$consumer;binding=$binding;packet=(JsonBytes @{gate=[Convert]::ToBase64String($gate);binding=[Convert]::ToBase64String($binding)})}
}
function V2RemoteScript($Packet,[string]$Mode,[int]$Index=-1,[long]$Length=0,[string]$Hash='') {
  if($Mode -cnotin @('metadata','file') -or ($Mode -ceq 'file' -and ($Index -lt 0 -or $Index -gt 13 -or $Length -lt 0 -or $Hash -cnotmatch '^[a-f0-9]{64}$'))){throw 'v2 remote arguments'}
  $prefix="CODE=bytes.fromhex('"+[Convert]::ToHexString($Packet.consumer)+"')`nPACKET=bytes.fromhex('"+[Convert]::ToHexString($Packet.packet)+"')`nMODE='$Mode'`nINDEX=$Index`nLENGTH=$Length`nHASH='$Hash'`n"
  return $prefix+@'
import base64,datetime,fcntl,hashlib,json,os,signal,sys,types
signal.signal(signal.SIGALRM,lambda *_: (_ for _ in ()).throw(TimeoutError()))
signal.alarm(170 if MODE=='metadata' else 1790)
if hashlib.sha256(CODE).hexdigest()!='18dcdff88cb8d41f8c5ee9e8236e0fdba9e7a212ef8c1044769165cc8010ac2c':raise ValueError()
consumer=types.ModuleType('pinned_consumer')
exec(compile(CODE,'/in-memory/corrected-checkpoint-consumer.py','exec'),consumer.__dict__)
bundle=json.loads(PACKET)
gate,binding=consumer.load_gate(bundle)
names=['postgres.dump','globals.private.sql','cron.private.json','source-inventory.private','target-inventory.private','comparison.private.json','receipt.json',
 'acl19-reconciliation-20261031/intent.json','acl19-reconciliation-20261031/plan.json','acl19-reconciliation-20261031/result.json',
 'acl19-reconciliation-20261031/strict-core-comparison.json','acl19-reconciliation-20261031/strict-private-comparison.json',
 'external/v04-fresh-checkpoint-20261030/private-before.json','external/v04-fresh-checkpoint-20261030/result.json']
def pair(index):
 name=names[index]
 return (gate.BASE,name[len('external/'):]) if name.startswith('external/') else (gate.ROOT,name)
def signature(s):return (s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
def states():gate.validate_states(gate.inspect(gate.SOURCE),gate.inspect(gate.TARGET))
def small_hash(index):
 base,name=pair(index)
 with gate.opened(base,name) as f:
  before=os.fstat(f.fileno())
  if before.st_size>524288:raise ValueError()
  raw=f.read(524289)
  if signature(before)!=signature(os.fstat(f.fileno())) or len(raw)!=before.st_size:raise ValueError()
  return {'name':names[index],'length':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
with gate.opened(gate.BASE,'.cashflow-release.lock',private=False) as lock:
 fcntl.flock(lock,fcntl.LOCK_SH|fcntl.LOCK_NB)
 states()
 if MODE=='metadata':
  # Fresh pinned gate, full dump hash and metadata all under this same outer lock.
  attestation=gate.run(binding,consumer.BINDING_SHA)
  consumer.validate_attestation(attestation)
  entries=[{'name':names[0],'length':attestation['dumpBytes'],'sha256':attestation['dumpSha256']}]
  entries.extend(small_hash(i) for i in range(1,14))
  attestation_raw=json.dumps(attestation,separators=(',',':')).encode('utf-8')
  entries.extend({'name':name,'length':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
   for name,raw in [('release-binding.json',binding),('read-attestation.json',attestation_raw)])
  states()
  print(json.dumps({'files':entries,'attestationBase64':base64.b64encode(attestation_raw).decode('ascii')},separators=(',',':')))
 elif MODE=='file':
  if not 0<=INDEX<14:raise ValueError()
  base,name=pair(INDEX)
  with gate.opened(base,name) as f:
   before=os.fstat(f.fileno())
   if before.st_size!=LENGTH:raise ValueError()
   h=hashlib.sha256();count=0
   for b in iter(lambda:f.read(65536),b''):
    count+=len(b)
    if count>LENGTH:raise ValueError()
    h.update(b);sys.stdout.buffer.write(b)
   if count!=LENGTH or h.hexdigest()!=HASH or signature(before)!=signature(os.fstat(f.fileno())):raise ValueError()
  states()
 else:raise ValueError()
'@
}
function V2Metadata($Packet) {
  $ssh=[CheckpointSsh]::new('python3 -',(V2RemoteScript $Packet 'metadata'),180)
  try{$meta=$utf8.GetString($ssh.ReadMetadata())|ConvertFrom-Json}finally{$ssh.Dispose()}
  Assert-V2Entries $meta.files 'native-ssh-v2'
  $raw=[Convert]::FromBase64String($meta.attestationBase64)
  if($raw.Length -gt 32768 -or $raw.Length -ne $meta.files[15].length -or [CheckpointCrypto]::Hash($raw) -cne $meta.files[15].sha256){throw 'v2 attestation bytes'}
  $proof=$utf8.GetString($raw)|ConvertFrom-Json;Assert-V2Proof $proof 'native-ssh-v2' -Fresh
  return @{files=@($meta.files);attestation=$proof;attestationRaw=$raw}
}
function V2FixtureMetadata([string]$Directory) {
  $names=Get-V2Names
  $records=@(for($i=0;$i -lt 16;$i++){$path=CheckPath (Join-Path $Directory ('v2-source-{0:d2}.bin' -f $i));@{name=$names[$i];length=([IO.FileInfo]$path).Length;sha256=[CheckpointCrypto]::FileHash($path)}})
  Assert-V2Entries $records 'offline-synthetic-v2'
  $proof=$utf8.GetString((BoundedBytes (Join-Path $Directory 'v2-source-15.bin') 32768))|ConvertFrom-Json
  Assert-V2Proof $proof 'offline-synthetic-v2'
  $original=$utf8.GetString((BoundedBytes (Join-Path $Directory 'v2-source-06.bin') 32768))|ConvertFrom-Json
  if($original.status -cne 'failed' -or $original.synthetic -cne $true){throw 'v2 original failure'}
  return @{files=$records;attestation=$proof}
}
function Invoke-V2([string]$Mode) {
  $names=Get-V2Names;$profileName='corrected-acl19-v2';$packet=$null
  if($Mode -ceq 'native-ssh-v2' -and $CheckpointId -cne '20261030T215307Z'){throw 'v2 checkpoint'}
  if($Action -ceq 'Capture'){
    $script:stage='v2-metadata'
    if($OfflineFixture){
      $FixtureDirectory=CheckPath $FixtureDirectory
      if(-not $FixtureDirectory.StartsWith($testRoot,[StringComparison]::OrdinalIgnoreCase) -or [IO.File]::ReadAllText((Join-Path $FixtureDirectory 'fixture-only.txt')) -cne 'SYNTHETIC-OFFLINE-ONLY'){throw 'v2 fixture'}
      $meta=V2FixtureMetadata $FixtureDirectory
    }else{$packet=V2Packet;$meta=V2Metadata $packet}
    $entries=@($meta.files);$needed=1GB
    foreach($entry in $entries){$needed=[long]$needed+[long]$entry.length+32768}
    if([IO.DriveInfo]::new([IO.Path]::GetPathRoot($Destination)).AvailableFreeSpace -lt $needed){throw 'v2 space'}
    $script:stage='v2-destination';PrivateDirectory $Destination;CheckPrivateDirectory $Destination
    $script:master=[Security.Cryptography.RandomNumberGenerator]::GetBytes(64);$script:macKey=$master[32..63]
    WriteNew (Join-Path $Destination 'master.dpapi') ([Security.Cryptography.ProtectedData]::Protect($master,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser))
    $records=@();$script:stage='v2-capture'
    for($i=0;$i -lt 16;$i++){
      $entry=$entries[$i]
      $header=([ordered]@{version=2;profile=$profileName;checkpoint=$CheckpointId;helperSha256=$approvedHelper;sourceMode=$Mode;name=$entry.name;length=[long]$entry.length;sha256=$entry.sha256}|ConvertTo-Json -Compress)
      $cipherName='v2-{0:d2}.enc' -f $i;$cipher=Join-Path $Destination $cipherName
      if($OfflineFixture){$inputStream=[IO.File]::OpenRead((CheckPath (Join-Path $FixtureDirectory ('v2-source-{0:d2}.bin' -f $i))));try{[CheckpointCrypto]::Encrypt($inputStream,$cipher,$header,[long]$entry.length,$entry.sha256,$master)}finally{$inputStream.Dispose()}}
      elseif($i -ge 14){$bytes=if($i -eq 14){$packet.binding}else{$meta.attestationRaw};$inputStream=[IO.MemoryStream]::new($bytes,$false);try{[CheckpointCrypto]::Encrypt($inputStream,$cipher,$header,[long]$entry.length,$entry.sha256,$master)}finally{$inputStream.Dispose()}}
      else{$ssh=[CheckpointSsh]::new('python3 -',(V2RemoteScript $packet 'file' $i ([long]$entry.length) $entry.sha256),1800);try{[CheckpointCrypto]::Encrypt($ssh.Output,$cipher,$header,[long]$entry.length,$entry.sha256,$master);$ssh.Complete()}finally{$ssh.Dispose()}}
      $records+=,[ordered]@{name=$entry.name;length=[long]$entry.length;sha256=$entry.sha256;header=$header;cipherName=$cipherName;cipherLength=([IO.FileInfo]$cipher).Length;cipherSha256=[CheckpointCrypto]::FileHash($cipher)}
    }
    $script:stage='v2-post-capture'
    $after=if($OfflineFixture){V2FixtureMetadata $FixtureDirectory}else{V2Metadata $packet}
    # The fresh second gate has a new timestamp. All original 14 sources and exact
    # binding must remain unchanged; both gate verdicts stay in the signed manifest.
    $last=if($OfflineFixture){15}else{14}
    for($i=0;$i -le $last;$i++){if($after.files[$i].name -cne $entries[$i].name -or $after.files[$i].length -ne $entries[$i].length -or $after.files[$i].sha256 -cne $entries[$i].sha256){throw 'v2 source changed'}}
    $independent=@{storageBinary='NOT_VERIFIED';currentSql='NOT_VERIFIED';capacity='NOT_VERIFIED';snapshotCoverage=$(if($OfflineFixture){'SYNTHETIC_ONLY'}else{'CORE_EXPORT_ONLY_GLOBALS_PRIVATE_SEPARATE'})}
    $manifestObject=[ordered]@{version=2;profile=$profileName;checkpoint=$CheckpointId;helperSha256=$approvedHelper;sourceMode=$Mode;originalStatus='failed';attestation=$meta.attestation;postCaptureAttestation=$after.attestation;readiness=$false;releaseAuthorized=$false;independentGates=$independent;files=$records}
    Assert-V2Manifest ([pscustomobject]$manifestObject) $CheckpointId $Mode
    $manifest=JsonBytes $manifestObject
    $script:stage='v2-manifest';WriteNew (Join-Path $Destination 'manifest.json') $manifest
    WriteNew (Join-Path $Destination 'manifest.hmac') ([CheckpointCrypto]::Mac($manifest,$macKey))
    WriteNew (Join-Path $Destination 'capture-complete.json') (JsonBytes @{status='CAPTURED_NOT_VERIFIED';version=2;profile=$profileName;checkpoint=$CheckpointId;sourceMode=$Mode;files=16;manifestSha256=[CheckpointCrypto]::Hash($manifest);readiness=$false;releaseAuthorized=$false})
    [Console]::WriteLine("CHECKPOINT_CAPTURED files=16 mode=$Mode profile=corrected-acl19-v2")
  }else{
    $script:stage='v2-manifest-authentication';CheckPrivateDirectory $Destination
    $script:master=[Security.Cryptography.ProtectedData]::Unprotect((BoundedBytes (Join-Path $Destination 'master.dpapi') 16384),$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    if($master.Length -ne 64){throw 'v2 key'};$script:macKey=$master[32..63]
    $manifest=BoundedBytes (Join-Path $Destination 'manifest.json') 65536
    if(-not [CheckpointCrypto]::Equal([CheckpointCrypto]::Mac($manifest,$macKey),(BoundedBytes (Join-Path $Destination 'manifest.hmac') 32))){throw 'v2 manifest MAC'}
    $m=$utf8.GetString($manifest)|ConvertFrom-Json;Assert-V2Manifest $m $CheckpointId $Mode
    $completed=$utf8.GetString((BoundedBytes (Join-Path $Destination 'capture-complete.json') 4096))|ConvertFrom-Json
    if($completed.status -cne 'CAPTURED_NOT_VERIFIED' -or $completed.version -ne 2 -or $completed.profile -cne $profileName -or $completed.checkpoint -cne $CheckpointId -or $completed.sourceMode -cne $Mode -or $completed.files -ne 16 -or $completed.manifestSha256 -cne [CheckpointCrypto]::Hash($manifest) -or $completed.readiness -cne $false -or $completed.releaseAuthorized -cne $false){throw 'v2 incomplete'}
    $script:stage='v2-verify'
    foreach($entry in $m.files){
      $path=CheckPath (Join-Path $Destination $entry.cipherName)
      if(([IO.FileInfo]$path).Length -ne $entry.cipherLength -or [CheckpointCrypto]::FileHash($path) -cne $entry.cipherSha256){throw 'v2 ciphertext'}
      [CheckpointCrypto]::Verify($path,$entry.header,[long]$entry.length,$entry.sha256,$master)
    }
    WriteNew (Join-Path $Destination 'verified.json') (JsonBytes @{status='PASS';version=2;profile=$profileName;checkpoint=$CheckpointId;sourceMode=$Mode;files=16;manifestSha256=[CheckpointCrypto]::Hash($manifest);verifiedAt=[datetime]::UtcNow.ToString('o');readiness=$false;releaseAuthorized=$false;independentGates=$m.independentGates;verification='HMAC before decrypt; all 16 complete plaintext SHA256/length to memory-only hashing sink'})
    [Console]::WriteLine("CHECKPOINT_VERIFIED files=16 mode=$Mode profile=corrected-acl19-v2")
  }
}
try{
  if(-not $IsWindows -or $Action -cnotin @('Capture','Verify','ReviewCorrectedCheckpoint') -or $CheckpointId -cnotmatch '^\d{8}T\d{6}Z$' -or $ReviewedHelperSha256 -cne $approvedHelper -or $Profile -cnotin @('LegacyV1','CorrectedAcl19V2')){throw 'parameters'}
  $parsed=[datetime]::MinValue
  if(-not [datetime]::TryParseExact($CheckpointId,'yyyyMMddTHHmmssZ',[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::None,[ref]$parsed)){throw 'date'}
  if($Action -ceq 'ReviewCorrectedCheckpoint'){
    # Review-only adoption, never a projection of failed receipt to legacy passed.
    if($CheckpointId -cne '20261030T215307Z' -or $OfflineFixture -or $FixtureDirectory -or $Destination -or $Profile -cne 'LegacyV1'){throw 'review parameters'}
    $stage='reviewed-consumer-source'
    if(('CheckpointCrypto' -as [type]) -or ('CheckpointSsh' -as [type])){throw 'preloaded type'}
    Add-Type -Path (Join-Path $PSScriptRoot 'CheckpointCrypto.cs')
    $repoRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
    $gateRoot=Join-Path $repoRoot 'docs/ops/p15-webpack-cache-20261030'
    $consumerBytes=$utf8.GetBytes(([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'corrected-checkpoint-consumer.py'),$utf8)).Replace("`r`n","`n"))
    $gateBytes=$utf8.GetBytes(([IO.File]::ReadAllText((Join-Path $gateRoot 'checkpoint-read-gate.py'),$utf8)).Replace("`r`n","`n"))
    $bindingBytes=[IO.File]::ReadAllBytes((Join-Path $gateRoot 'RELEASE-BINDING-20261031.json'))
    if([CheckpointCrypto]::Hash($consumerBytes) -cne '18dcdff88cb8d41f8c5ee9e8236e0fdba9e7a212ef8c1044769165cc8010ac2c' -or [CheckpointCrypto]::Hash($gateBytes) -cne '9289f162919bd1b2e462d2c823758b7b693f27988562d3554be197c9b65666a3' -or [CheckpointCrypto]::Hash($bindingBytes) -cne '7819e0fb16bbb2c9171099cab07953c3137634d665616af509d4061306af9325'){throw 'review source changed'}
    $packet=JsonBytes ([ordered]@{gate=[Convert]::ToBase64String($gateBytes);binding=[Convert]::ToBase64String($bindingBytes)})
    # Hex contains reviewed source/receipts only, never a credential or database row.
    $script="CODE=bytes.fromhex('"+[Convert]::ToHexString($consumerBytes)+"')`nPACKET=bytes.fromhex('"+[Convert]::ToHexString($packet)+"')`n"+@'
import hashlib,json,signal,types
signal.signal(signal.SIGALRM,lambda *_: (_ for _ in ()).throw(TimeoutError()))
signal.alarm(160)
if hashlib.sha256(CODE).hexdigest()!='18dcdff88cb8d41f8c5ee9e8236e0fdba9e7a212ef8c1044769165cc8010ac2c':raise ValueError()
module=types.ModuleType('reviewed_checkpoint_consumer')
exec(compile(CODE,'/in-memory/corrected-checkpoint-consumer.py','exec'),module.__dict__)
print(json.dumps(module.review('backup-checkpoint.review-corrected.v1',json.loads(PACKET))))
'@
    $stage='read-only-consumer'
    $ssh=[CheckpointSsh]::new('python3 -',$script,180)
    try{$verdict=$utf8.GetString($ssh.ReadMetadata())|ConvertFrom-Json}finally{$ssh.Dispose()}
    if($verdict.status -cne 'PASS_CORRECTED_CHECKPOINT_CONSUMER_REVIEW' -or $verdict.consumer -cne 'backup-checkpoint.review-corrected.v1' -or $verdict.readOnlyConsumerIntegrated -ne $true -or $verdict.releaseAuthorized -ne $false -or $verdict.captureVerifyProfileIntegrated -ne $false -or $verdict.legacyApplyPathIntegrated -ne $false){throw 'review result'}
    [Console]::WriteLine(($verdict|ConvertTo-Json -Depth 12 -Compress))
    return
  }
  if(-not $Destination){throw 'destination required'}
  $Destination=CheckPath $Destination
  if($OfflineFixture){$testRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'test-output'))+[IO.Path]::DirectorySeparatorChar;if(-not $Destination.StartsWith($testRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'fixture destination'}}
  elseif($Destination -cne [IO.Path]::GetFullPath("C:/Users/Asus/.codex/private/cashflow-release/$CheckpointId") -or $FixtureDirectory){throw 'destination'}
  $stage='fresh-process'
  if(('CheckpointCrypto' -as [type]) -or ('CheckpointSsh' -as [type])){throw 'preloaded type'}
  Add-Type -AssemblyName System.Security
  Add-Type -Path (Join-Path $PSScriptRoot 'CheckpointCrypto.cs')
  if($Profile -ceq 'CorrectedAcl19V2'){
    . (Join-Path $PSScriptRoot 'checkpoint-profile-v2.ps1')
    $v2Mode=if($OfflineFixture){'offline-synthetic-v2'}else{'native-ssh-v2'}
    Invoke-V2 $v2Mode
    return
  }
  $sourceMode=if($OfflineFixture){'offline-synthetic'}else{'native-ssh'}
  $stage='metadata'
  if($Action -ceq 'Capture'){
    if($OfflineFixture){
      $FixtureDirectory=CheckPath $FixtureDirectory
      if(-not $FixtureDirectory.StartsWith($testRoot,[StringComparison]::OrdinalIgnoreCase) -or [IO.File]::ReadAllText((Join-Path $FixtureDirectory 'fixture-only.txt')) -cne 'SYNTHETIC-OFFLINE-ONLY'){throw 'fixture'}
      $proof=Get-Content -LiteralPath (Join-Path $FixtureDirectory 'receipt.json') -Raw|ConvertFrom-Json
      $entries=@(foreach($name in $files){$p=CheckPath (Join-Path $FixtureDirectory $name);[ordered]@{name=$name;length=([IO.FileInfo]$p).Length;sha256=[CheckpointCrypto]::FileHash($p)}})
    }else{
      $ssh=[CheckpointSsh]::new('python3 -',(RemoteScript 'metadata'),180)
      try{$metadata=$utf8.GetString($ssh.ReadMetadata())|ConvertFrom-Json;$proof=$metadata.proof;$entries=@($metadata.files)}finally{$ssh.Dispose()}
    }
    SafeProof $proof
    if($entries.Count -ne $files.Count -or $proof.dumpSha256 -cne $entries[0].sha256 -or $proof.dumpBytes -ne $entries[0].length){throw 'metadata'}
    for($i=0;$i -lt $files.Count;$i++){if($entries[$i].name -cne $files[$i] -or $entries[$i].length -lt 0 -or $entries[$i].sha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'metadata'}}
    $stage='destination'
    $needed=1GB;foreach($entry in $entries){$needed+=[long]$entry.length+32768}
    if([IO.DriveInfo]::new([IO.Path]::GetPathRoot($Destination)).AvailableFreeSpace -lt $needed){throw 'space'}
    PrivateDirectory $Destination;CheckPrivateDirectory $Destination
    $master=[Security.Cryptography.RandomNumberGenerator]::GetBytes(64);[byte[]]$macKey=$master[32..63]
    WriteNew (Join-Path $Destination 'master.dpapi') ([Security.Cryptography.ProtectedData]::Protect($master,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser))
    $records=@();$stage='capture'
    foreach($entry in $entries){
      $header=([ordered]@{version=1;checkpoint=$CheckpointId;helperSha256=$approvedHelper;sourceMode=$sourceMode;name=$entry.name;length=[long]$entry.length;sha256=$entry.sha256}|ConvertTo-Json -Compress)
      $cipherPath=Join-Path $Destination ($entry.name+'.enc')
      if($OfflineFixture){$sourceStream=[IO.File]::OpenRead((Join-Path $FixtureDirectory $entry.name));try{[CheckpointCrypto]::Encrypt($sourceStream,$cipherPath,$header,[long]$entry.length,$entry.sha256,$master)}finally{$sourceStream.Dispose()}}
      else{$ssh=[CheckpointSsh]::new('python3 -',(RemoteScript 'file' $entry.name),1800);try{[CheckpointCrypto]::Encrypt($ssh.Output,$cipherPath,$header,[long]$entry.length,$entry.sha256,$master);$ssh.Complete()}finally{$ssh.Dispose()}}
      $records+=,[ordered]@{name=$entry.name;length=[long]$entry.length;sha256=$entry.sha256;header=$header;cipherLength=([IO.FileInfo]$cipherPath).Length;cipherSha256=[CheckpointCrypto]::FileHash($cipherPath)}
    }
    $stage='manifest';$manifest=JsonBytes ([ordered]@{version=1;checkpoint=$CheckpointId;helperSha256=$approvedHelper;sourceMode=$sourceMode;files=$records})
    WriteNew (Join-Path $Destination 'manifest.json') $manifest
    WriteNew (Join-Path $Destination 'manifest.hmac') ([CheckpointCrypto]::Mac($manifest,$macKey))
    WriteNew (Join-Path $Destination 'capture-complete.json') (JsonBytes ([ordered]@{status='CAPTURED_NOT_VERIFIED';checkpoint=$CheckpointId;sourceMode=$sourceMode;files=7;manifestSha256=[CheckpointCrypto]::Hash($manifest)}))
    [Console]::WriteLine("CHECKPOINT_CAPTURED files=7 mode=$sourceMode")
  }else{
    $stage='manifest-authentication'
    CheckPrivateDirectory $Destination
    $master=[Security.Cryptography.ProtectedData]::Unprotect((BoundedBytes (Join-Path $Destination 'master.dpapi') 16384),$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    if($master.Length -ne 64){throw 'key'};[byte[]]$macKey=$master[32..63]
    $manifest=BoundedBytes (Join-Path $Destination 'manifest.json') 65536
    if(-not [CheckpointCrypto]::Equal([CheckpointCrypto]::Mac($manifest,$macKey),(BoundedBytes (Join-Path $Destination 'manifest.hmac') 32))){throw 'manifest'}
    $m=$utf8.GetString($manifest)|ConvertFrom-Json
    if($m.version -ne 1 -or $m.checkpoint -cne $CheckpointId -or $m.helperSha256 -cne $approvedHelper -or $m.sourceMode -cne $sourceMode -or $m.files.Count -ne 7){throw 'manifest'}
    $completed=$utf8.GetString((BoundedBytes (Join-Path $Destination 'capture-complete.json') 4096))|ConvertFrom-Json
    if($completed.status -cne 'CAPTURED_NOT_VERIFIED' -or $completed.checkpoint -cne $CheckpointId -or $completed.sourceMode -cne $sourceMode -or $completed.files -ne 7 -or $completed.manifestSha256 -cne [CheckpointCrypto]::Hash($manifest)){throw 'incomplete'}
    $stage='verify'
    for($i=0;$i -lt $files.Count;$i++){
      $entry=$m.files[$i];$h=$entry.header|ConvertFrom-Json
      if($entry.name -cne $files[$i] -or $entry.length -lt 0 -or $entry.sha256 -cnotmatch '^[a-f0-9]{64}$' -or $h.version -ne 1 -or $h.checkpoint -cne $CheckpointId -or $h.helperSha256 -cne $approvedHelper -or $h.sourceMode -cne $sourceMode -or $h.name -cne $entry.name -or $h.length -ne $entry.length -or $h.sha256 -cne $entry.sha256){throw 'header'}
      $p=CheckPath (Join-Path $Destination ($entry.name+'.enc'))
      if(([IO.FileInfo]$p).Length -ne $entry.cipherLength -or [CheckpointCrypto]::FileHash($p) -cne $entry.cipherSha256){throw 'cipher'}
      [CheckpointCrypto]::Verify($p,$entry.header,[long]$entry.length,$entry.sha256,$master)
    }
    $stage='receipt';WriteNew (Join-Path $Destination 'verified.json') (JsonBytes ([ordered]@{status='PASS';checkpoint=$CheckpointId;sourceMode=$sourceMode;files=7;manifestSha256=[CheckpointCrypto]::Hash($manifest);verifiedAt=[datetime]::UtcNow.ToString('o');verification='HMAC before decrypt; complete plaintext SHA256/length to memory-only hashing sink'}))
    [Console]::WriteLine("CHECKPOINT_VERIFIED files=7 mode=$sourceMode")
  }
}catch{
  [Console]::Error.WriteLine("CHECKPOINT_FAILED stage=$stage code=OPERATION_FAILED")
  exit 1
}finally{
  if($master){[Array]::Clear($master,0,$master.Length)}
  if($macKey){[Array]::Clear($macKey,0,$macKey.Length)}
}
