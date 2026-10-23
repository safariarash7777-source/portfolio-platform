param(
  [Parameter(Mandatory)][string]$Action,
  [Parameter(Mandatory)][string]$CheckpointId,
  [Parameter(Mandatory)][string]$ReviewedHelperSha256,
  [Parameter(Mandatory)][string]$Destination,
  [switch]$OfflineFixture,
  [string]$FixtureDirectory
)
$ErrorActionPreference='Stop'
$stage='parameters';$master=$null;$macKey=$null
$approvedHelper='160870bef69b42014ca26c9dd26c1a3dfe93915bebd99c2e08840312c4e00f6d'
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
try{
  if(-not $IsWindows -or $Action -cnotin @('Capture','Verify') -or $CheckpointId -cnotmatch '^\d{8}T\d{6}Z$' -or $ReviewedHelperSha256 -cne $approvedHelper){throw 'parameters'}
  $parsed=[datetime]::MinValue
  if(-not [datetime]::TryParseExact($CheckpointId,'yyyyMMddTHHmmssZ',[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::None,[ref]$parsed)){throw 'date'}
  $Destination=CheckPath $Destination
  if($OfflineFixture){$testRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'test-output'))+[IO.Path]::DirectorySeparatorChar;if(-not $Destination.StartsWith($testRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'fixture destination'}}
  elseif($Destination -cne [IO.Path]::GetFullPath("C:/Users/Asus/.codex/private/cashflow-release/$CheckpointId") -or $FixtureDirectory){throw 'destination'}
  $stage='fresh-process'
  if(('CheckpointCrypto' -as [type]) -or ('CheckpointSsh' -as [type])){throw 'preloaded type'}
  Add-Type -AssemblyName System.Security
  Add-Type -Path (Join-Path $PSScriptRoot 'CheckpointCrypto.cs')
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
