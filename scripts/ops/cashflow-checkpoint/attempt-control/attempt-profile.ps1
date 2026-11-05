# Native child engine; load-only. Use native-caller after independent review.
# Load performs no capture, key generation, SSH, process launch or filesystem write.
$apProfile='independent-attempt-v3-native'
$apUtf8=[Text.UTF8Encoding]::new($false,$true)
function Initialize-AP {
  $frozen=Join-Path $PSScriptRoot 'frozen'
  $indexRaw=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'frozen-files.json'))
  if([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($indexRaw)).ToLowerInvariant() -cne '57cf986786968e9f4e3d8b74fb88593f66460fdef4ccd7e4e17623b042f341ef'){throw 'FROZEN_INDEX_CHANGED'}
  $index=$apUtf8.GetString($indexRaw)|ConvertFrom-Json
  foreach($entry in $index.files){
    $b=[IO.File]::ReadAllBytes((Join-Path $frozen $entry.path))
    if([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($b)).ToLowerInvariant() -cne $entry.sha256){throw 'FROZEN_SOURCE_CHANGED'}
  }
  $script:apLegacy=Join-Path $frozen 'scripts/ops/cashflow-checkpoint'
  if('CheckpointCrypto' -as [type]){throw 'FRESH_PROCESS_REQUIRED'}
  Add-Type -Path (Join-Path $apLegacy 'CheckpointCrypto.cs')
  # Load a fixed allowlist of existing local-only helpers, never wrapper main/SSH.
  $tokens=$null;$errors=$null
  $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $apLegacy 'backup-checkpoint.ps1'),[ref]$tokens,[ref]$errors)
  if($errors.Count){throw 'FROZEN_PARSE'}
  foreach($name in @('WriteNew','CheckPath','PrivateDirectory','CheckPrivateDirectory','BoundedBytes')){
    $fn=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq $name},$true)
    . ([scriptblock]::Create($fn.Extent.Text.Replace("function $name(","function script:$name(")))
  }
  . (Join-Path $apLegacy 'checkpoint-profile-v2.ps1')
  . (Join-Path $apLegacy 'checkpoint-profile-v2r2.ps1')
  # Pure validators must survive the initializer's scope.
  foreach($name in @('Get-V2Pins','Test-V2Bool','Assert-V2Proof','Get-R2PolicyPin','Assert-R2Policy','Assert-R2Mode','Get-R2Keys','Assert-R2Observation','Assert-R2Proof','Get-R2Cipher','Assert-R2Entries','Assert-R2Manifest')) {
    Set-Item -Path "function:script:$name" -Value (Get-Item "function:$name").ScriptBlock
  }
  $script:apPolicyRaw=[IO.File]::ReadAllBytes((Join-Path $frozen 'docs/ops/p15-webpack-cache-20261030/CORRECTED-FAILED-V2R2-POLICY.json'))
  $script:apPolicy=Assert-R2Policy $apPolicyRaw
}
function APBytes($v){return ,$apUtf8.GetBytes(($v|ConvertTo-Json -Depth 30 -Compress))}
function APHash([byte[]]$b){return [CheckpointCrypto]::Hash($b)}
function Assert-APFile([string]$p){
  $null=CheckPath $p
  $acl=Get-Acl -LiteralPath $p;$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $sid){throw 'FILE_OWNER'}
  $rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
  if($rules.Count -ne 2 -or @($rules|Where-Object {$_.IdentityReference.Value -cnotin @($sid,'S-1-5-18') -or $_.AccessControlType -ne 'Allow' -or $_.FileSystemRights -ne 'FullControl'}).Count){throw 'FILE_ACL'}
}
function APSign($value,[byte[]]$key){
  if($key.Length -ne 32){throw 'AUTHORITY_KEY'}
  $raw=APBytes $value
  return ,(APBytes @{payload=[Convert]::ToBase64String($raw);mac=[Convert]::ToBase64String([CheckpointCrypto]::Mac($raw,$key))})
}
function APOpen([string]$path,[byte[]]$key){
  Assert-APFile $path;$envelope=$apUtf8.GetString((BoundedBytes $path 262144))|ConvertFrom-Json
  if(@($envelope.PSObject.Properties).Count -ne 2){throw 'ENVELOPE'}
  $raw=[Convert]::FromBase64String($envelope.payload);$mac=[Convert]::FromBase64String($envelope.mac)
  if(-not [CheckpointCrypto]::Equal([CheckpointCrypto]::Mac($raw,$key),$mac)){throw 'AUTHENTICATION'}
  return ($apUtf8.GetString($raw)|ConvertFrom-Json)
}
function APInventory([string]$dir){
  $null=CheckPath $dir;CheckPrivateDirectory $dir
  $items=@(Get-ChildItem -LiteralPath $dir -Force|Sort-Object Name)
  return @(foreach($file in $items){
    if($file.PSIsContainer){throw 'ARCHIVE_SUBDIRECTORY'};Assert-APFile $file.FullName
    [ordered]@{name=$file.Name;length=$file.Length;sha256=[CheckpointCrypto]::FileHash($file.FullName);acl=(Get-Acl -LiteralPath $file.FullName).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]'Access,Owner,Group');directoryAcl=(Get-Acl -LiteralPath $dir).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]'Access,Owner,Group')}
  })
}
function APProcess {
  $p=[Diagnostics.Process]::GetCurrentProcess()
  return @{pid=$p.Id;startedUtc=$p.StartTime.ToUniversalTime().ToString('o')}
}
function APEvent($a,[string]$kind,$details,[byte[]]$key){
  WriteNew (Join-Path $a.root "authority/$($a.attemptId).$kind.json") (APSign @{version=3;attemptId=$a.attemptId;authorizationSha256=$a.authorizationSha256;kind=$kind;writer=(APProcess);details=$details} $key)
}
function APReadEvent($a,[string]$kind,[byte[]]$key){
  $e=APOpen (Join-Path $a.root "authority/$($a.attemptId).$kind.json") $key
  if($e.version -ne 3 -or $e.attemptId -cne $a.attemptId -or $e.authorizationSha256 -cne $a.authorizationSha256 -or $e.kind -cne $kind){throw 'EVENT_BINDING'}
  return $e
}
function Read-APAttempt([string]$Root,[string]$AttemptId,[byte[]]$AuthorityKey){
  $a=APContext $Root $AttemptId $AuthorityKey
  $state='AUTHORIZED_NOT_STARTED';$manifestHash=$null
  $lockPath=Join-Path $Root "authority/$AttemptId.lock"
  if(Test-Path -LiteralPath $lockPath){
    Assert-APFile $lockPath
    try{$l=[IO.File]::Open($lockPath,'Open','Read','None');$l.Dispose()}catch [IO.IOException]{return @{state='RUNNING_OR_LOCKED';attemptId=$AttemptId;installAuthorized=$false}}
    $state='OUTCOME_UNKNOWN'
  }
  if(Test-Path -LiteralPath (Join-Path $Root "authority/$AttemptId.capture-start.json")){$null=APReadEvent $a 'capture-start' $AuthorityKey;$state='OUTCOME_UNKNOWN'}
  if(Test-Path -LiteralPath $a.destination){$null=CheckPath $a.destination;CheckPrivateDirectory $a.destination;$state='OUTCOME_UNKNOWN'}
  if(Test-Path -LiteralPath (Join-Path $Root "authority/$AttemptId.bound.json")){
    $bound=APReadEvent $a 'bound' $AuthorityKey
    $manifest=Join-Path $a.destination 'attempt-manifest.json';Assert-APFile $manifest
    if([CheckpointCrypto]::FileHash($manifest) -cne $bound.details.manifestSha256){throw 'MANIFEST_BINDING'}
    if((APHash (APBytes (APInventory $a.destination))) -cne $bound.details.archiveInventorySha256){throw 'ARCHIVE_CHANGED_SINCE_BINDING'}
    $manifestHash=$bound.details.manifestSha256;$state='CAPTURED_NOT_VERIFIED'
  }
  if(Test-Path -LiteralPath (Join-Path $Root "authority/$AttemptId.verify-start.json")){$null=APReadEvent $a 'verify-start' $AuthorityKey;$state='VERIFY_OUTCOME_UNKNOWN'}
  if(Test-Path -LiteralPath (Join-Path $Root "authority/$AttemptId.verified.json")){
    $v=APReadEvent $a 'verified' $AuthorityKey
    if($v.details.manifestSha256 -cne $manifestHash -or $v.details.installAuthorized -cne $false){throw 'VERIFY_BINDING'}
    $state='VERIFIED_NATIVE_BACKUP_ONLY'
  }
  return @{state=$state;attemptId=$AttemptId;manifestSha256=$manifestHash;installAuthorized=$false}
}
function APHeader($a,$entry){
  return $apUtf8.GetString((APBytes ([ordered]@{version=3;profile=$apProfile;attemptId=$a.attemptId;nonce=$a.nonce;checkpoint=$a.checkpoint;authorizationSha256=$a.authorizationSha256;priorReceiptSha256=$a.priorReceiptSha256;policySha256=$a.policySha256;helperSha256=$a.helperSha256;parentBindingSha256=$a.parentBindingSha256;role=$entry.role;name=$entry.name;origin=$entry.origin;length=[long]$entry.length;sha256=$entry.sha256})))
}
function Assert-APOtherAttemptsClosed([string]$Root,[string]$Selected,[byte[]]$Key){
  # Inventory is only a safety check. It never chooses an attempt or a fallback.
  foreach($file in Get-ChildItem -LiteralPath (Join-Path $Root 'authority') -Filter '*.authorization.json' -File){
    $id=$file.Name.Replace('.authorization.json','')
    if($id -ceq $Selected){continue}
    $state=(Read-APAttempt $Root $id $Key).state
    if($state -cnotin @('AUTHORIZED_NOT_STARTED','CAPTURED_NOT_VERIFIED','VERIFIED_NATIVE_BACKUP_ONLY')){throw 'OTHER_ATTEMPT_RECONCILIATION_REQUIRED'}
  }
}
function Invoke-APAttempt([string]$Action,[string]$Root,[string]$AttemptId,[byte[]]$AuthorityKey,[string]$Profile){
  if($Profile -cne $apProfile){throw 'NATIVE_PROFILE_NOT_AUTHORIZED'}
  if($Action -cnotin @('Capture','Verify','Readback')){throw 'ACTION'}
  if($Action -ceq 'Readback'){return (Read-APAttempt $Root $AttemptId $AuthorityKey)}
  $Root=Assert-NARoot $Root
  $a=APContext $Root $AttemptId $AuthorityKey;$status=Read-APAttempt $Root $AttemptId $AuthorityKey
  if(($Action -ceq 'Capture' -and $status.state -cne 'AUTHORIZED_NOT_STARTED') -or ($Action -ceq 'Verify' -and $status.state -cne 'CAPTURED_NOT_VERIFIED')){throw 'READBACK_REQUIRED_NO_RETRY'}
  $lockPath=Join-Path $Root "authority/$AttemptId.lock";$lock=$null;$master=$null;$checkpointLock=$null;$priorLease=$null
  try{
    $null=CheckPath (Join-Path $Root 'authority/checkpoint.lock')
    $checkpointLock=[IO.File]::Open((Join-Path $Root 'authority/checkpoint.lock'),'OpenOrCreate','ReadWrite','None')
    Assert-APFile (Join-Path $Root 'authority/checkpoint.lock')
    Assert-NARegistry $Root
    Assert-APOtherAttemptsClosed $Root $AttemptId $AuthorityKey
    $priorLease=Open-NAPriorLease
    $a=APContext $Root $AttemptId $AuthorityKey
    $status=Read-APAttempt $Root $AttemptId $AuthorityKey
    if(($Action -ceq 'Capture' -and $status.state -cne 'AUTHORIZED_NOT_STARTED') -or ($Action -ceq 'Verify' -and $status.state -cne 'CAPTURED_NOT_VERIFIED')){throw 'READBACK_CHANGED'}
    $fileMode=if($Action -ceq 'Capture'){'CreateNew'}else{'Open'}
    $lock=[IO.File]::Open($lockPath,$fileMode,'ReadWrite','None')
    Assert-APFile $lockPath
    if($script:naSelectedProfile -ceq 'CorrectedCorePrivateV3'){return (Invoke-NAV3BoundAction $Action $a $AuthorityKey $priorLease)}
    if($Action -ceq 'Capture'){
      APEvent $a 'capture-start' @{state='INTENT';installAuthorized=$false} $AuthorityKey
      $freshMeta=NAFreshMetadata $a;$fresh=$freshMeta.artifacts
      for($i=0;$i -lt 17;$i++){if($i -ne 5 -and $i -ne 16 -and ($fresh[$i].sha256 -cne $a.records[$i].sha256 -or $fresh[$i].length -ne $a.records[$i].length)){throw 'SOURCE_CHANGED'}}
      PrivateDirectory $a.destination;CheckPrivateDirectory $a.destination
      $master=[Security.Cryptography.RandomNumberGenerator]::GetBytes(64)
      $entropy=$apUtf8.GetBytes('independent-attempt-v3:'+ $a.authorizationSha256)
      WriteNew (Join-Path $a.destination 'attempt-master.dpapi') ([Security.Cryptography.ProtectedData]::Protect($master,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser))
      $records=@()
      for($i=0;$i -lt 17;$i++){
        $entry=$a.records[$i];$header=$null;$cipher=$null;$cipherHash=$null
        if($i -ne 5){
          $header=APHeader $a $entry;$cipher=('attempt-{0:d2}.enc' -f $i)
          Write-NACipher $a $i (Join-Path $a.destination $cipher) $header $master
          $cipherHash=[CheckpointCrypto]::FileHash((Join-Path $a.destination $cipher))
        }
        $records+=@{index=$i;header=$header;cipher=$cipher;cipherSha256=$cipherHash}
      }
      $afterMeta=NAFreshMetadata $a;$after=$afterMeta.artifacts
      for($i=0;$i -lt 17;$i++){if($i -ne 5 -and $i -ne 16 -and ($after[$i].sha256 -cne $a.records[$i].sha256 -or $after[$i].length -ne $a.records[$i].length)){throw 'SOURCE_CHANGED'}}
      $manifest=APBytes @{version=3;profile=$apProfile;attemptId=$AttemptId;authorizationSha256=$a.authorizationSha256;priorReceiptSha256=$a.priorReceiptSha256;records=$records;postCaptureAbsence=$after[5].observation;postCaptureAttestationSha256=$after[16].sha256;postCaptureAttestationBase64=[Convert]::ToBase64String($afterMeta.attestationRaw);installAuthorized=$false;nativeAuthorized=$false}
      WriteNew (Join-Path $a.destination 'attempt-manifest.json') $manifest
      WriteNew (Join-Path $a.destination 'attempt-manifest.hmac') ([CheckpointCrypto]::Mac($manifest,[byte[]]$master[32..63]))
      $null=Assert-NALeaseStable $priorLease
      # External authenticated binding references this manifest, not a mutable "latest".
      APEvent $a 'bound' @{manifestSha256=(APHash $manifest);archiveInventorySha256=(APHash (APBytes (APInventory $a.destination)));installAuthorized=$false} $AuthorityKey
      return @{state='CAPTURED_NOT_VERIFIED';attemptId=$AttemptId;installAuthorized=$false}
    }
    APEvent $a 'verify-start' @{state='VERIFY_INTENT';installAuthorized=$false} $AuthorityKey
    $bound=APReadEvent $a 'bound' $AuthorityKey
    foreach($name in @('attempt-master.dpapi','attempt-manifest.json','attempt-manifest.hmac')){Assert-APFile (Join-Path $a.destination $name)}
    $entropy=$apUtf8.GetBytes('independent-attempt-v3:'+ $a.authorizationSha256)
    $master=[Security.Cryptography.ProtectedData]::Unprotect((BoundedBytes (Join-Path $a.destination 'attempt-master.dpapi') 16384),$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    if($master.Length -ne 64){throw 'KEY_LENGTH'}
    $raw=BoundedBytes (Join-Path $a.destination 'attempt-manifest.json') 131072
    if((APHash $raw) -cne $bound.details.manifestSha256 -or -not [CheckpointCrypto]::Equal([CheckpointCrypto]::Mac($raw,[byte[]]$master[32..63]),(BoundedBytes (Join-Path $a.destination 'attempt-manifest.hmac') 32))){throw 'MANIFEST_AUTHENTICATION'}
    $m=$apUtf8.GetString($raw)|ConvertFrom-Json
    if($m.version -ne 3 -or $m.profile -cne $apProfile -or $m.attemptId -cne $AttemptId -or $m.authorizationSha256 -cne $a.authorizationSha256 -or $m.priorReceiptSha256 -cne $a.priorReceiptSha256 -or $m.installAuthorized -cne $false -or $m.nativeAuthorized -cne $false -or $m.records.Count -ne 17){throw 'MANIFEST_IDENTITY'}
    Assert-R2Observation $m.postCaptureAbsence 'native-ssh-v2r2'
    Assert-NAPostProof $m
    $expected=@('attempt-master.dpapi','attempt-manifest.json','attempt-manifest.hmac')
    for($i=0;$i -lt 17;$i++){
      $r=$m.records[$i];$e=$a.records[$i]
      if($r.index -ne $i){throw 'ROLE_ORDER'}
      if($i -eq 5){if($null -ne $r.header -or $null -ne $r.cipher -or $null -ne $r.cipherSha256){throw 'ABSENT_CIPHER'};continue}
      $name=('attempt-{0:d2}.enc' -f $i);$expected+=$name
      if($r.cipher -cne $name -or $r.header -cne (APHeader $a $e)){throw 'HEADER_IDENTITY'}
      $path=Join-Path $a.destination $name;Assert-APFile $path
      if([CheckpointCrypto]::FileHash($path) -cne $r.cipherSha256){throw 'CIPHERTEXT_CHANGED'}
      [CheckpointCrypto]::Verify($path,$r.header,[long]$e.length,$e.sha256,$master)
    }
    if((@(Get-ChildItem -LiteralPath $a.destination -Force|Select-Object -ExpandProperty Name|Sort-Object) -join '|') -cne (($expected|Sort-Object) -join '|')){throw 'ARCHIVE_INVENTORY'}
    $null=Assert-NALeaseStable $priorLease
    APEvent $a 'verified' @{manifestSha256=(APHash $raw);backupVerified='NATIVE_BACKUP_ONLY';installAuthorized=$false} $AuthorityKey
    return @{state='VERIFIED_NATIVE_BACKUP_ONLY';attemptId=$AttemptId;installAuthorized=$false}
  }finally{if($priorLease){Close-NALease $priorLease};if($master){[Array]::Clear($master,0,$master.Length)};if($lock){$lock.Dispose()};if($checkpointLock){$checkpointLock.Dispose()}}
}
