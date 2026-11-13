function Assert-V3AttemptBinding($Binding) {
  if($OfflineFixture){if($null -ne $Binding){throw 'v3 synthetic attempt binding'};return}
  $count=if($Binding -is [Collections.IDictionary]){$Binding.Count}else{@($Binding.PSObject.Properties).Count}
  if($null -eq $v3AttemptBinding -or $null -eq $Binding -or $count -ne 8){throw 'v3 missing attempt binding'}
  foreach($k in @('attemptId','nonce','authorizationSha256','priorReceiptSha256','policySha256','sourceIndexSha256','checkpoint','destination')){
    if($Binding.$k -cne $v3AttemptBinding.$k){throw 'v3 attempt binding mismatch'}
  }
}
function Get-V3ActiveControllerBinding($Action,$Policy) {
  if(-not (Get-Command Assert-NAV3ActiveAttempt -CommandType Function -ErrorAction SilentlyContinue)){throw 'V3_CONTROLLER_ATTEMPT_REQUIRED'}
  return (Assert-NAV3ActiveAttempt $Action $Policy)
}
# Versioned profile in the existing provider. Loading definitions performs no I/O.
# Native invocation remains the existing reviewed controller's responsibility.
function Test-V3Bool($Value,[bool]$Expected) { return ($Value -is [bool] -and $Value -eq $Expected) }
function Get-V3PolicyRaw {
  $raw=BoundedBytes (Join-Path $PSScriptRoot 'checkpoint-profile-v3-policy.json') 65536
  if([CheckpointCrypto]::Hash($raw) -cne 'c905b8a11fa740b4ff34bda468d567ef1382aaaf3cffa46325ede8f194c55494'){throw 'v3 policy pin'}
  return ,$raw
}
function Assert-V3Manifest($m,[byte[]]$policyRaw) {
  $p=$utf8.GetString($policyRaw)|ConvertFrom-Json
  $mode=if($OfflineFixture){'offline-synthetic-v3'}else{'native-ssh-v3'}
  $present=if($OfflineFixture){'synthetic_present'}else{'present'};$absent=if($OfflineFixture){'synthetic_absent'}else{'absent'}
  if($m.version -ne 3 -or $m.profile -cne $p.profile -or $m.checkpoint -cne $p.checkpoint -or
    $m.sourceMode -cne $mode -or -not (Test-V3Bool $m.synthetic ([bool]$OfflineFixture)) -or
    $m.originalStatus -cne 'failed' -or $m.core17Status -cne 'not_accepted' -or
    -not (Test-V3Bool $m.readiness $false) -or -not (Test-V3Bool $m.releaseAuthorized $false) -or -not (Test-V3Bool $m.applyAllowed $false) -or
    $m.policySha256 -cne [CheckpointCrypto]::Hash($policyRaw) -or
    $m.policyBase64 -cne [Convert]::ToBase64String($policyRaw) -or $m.artifacts.Count -ne $p.roles.Count){throw 'v3 manifest'}
  foreach($k in @('storageBinary','rollback','freshCapacity','compatibility')){if($m.independentGates.$k -cne 'NOT_VERIFIED'){throw 'v3 independent gate'}}
  $coverage=if($OfflineFixture){'SYNTHETIC_ONLY'}else{'CORE_EXPORT_ONLY_GLOBALS_PRIVATE_SEPARATE'}
  if($m.independentGates.snapshotCoverage -cne $coverage){throw 'v3 coverage'}
  if(-not $OfflineFixture){Assert-V3NativeProof $m.freshReadGate $p;Assert-V3NativeProof $m.postCaptureReadGate $p;Assert-V3Absence $m.postCaptureAbsence}
  if($OfflineFixture -and ($null -ne $m.actualNativeArchiveRecords -or $null -ne $m.actualNativeArchiveStreams)){throw 'v3 synthetic native count'}
  Assert-V3AttemptBinding $m.attemptBinding
  $streams=0
  for($i=0;$i -lt $p.roles.Count;$i++){
    $r=$p.roles[$i];$e=$m.artifacts[$i]
    if($e.role -cne $r.role -or $e.name -cne $r.name -or $e.origin -cne $r.origin){throw 'v3 role identity'}
    if($r.observedState -ceq 'observed_absent'){
      if($e.state -cne $absent -or $null -ne $e.length -or $null -ne $e.sha256 -or $null -ne $e.header -or $null -ne $e.cipherName -or $null -ne $e.cipherLength -or $null -ne $e.cipherSha256){throw 'v3 synthetic absence'}
      if(-not $OfflineFixture){Assert-V3Absence $e.observation}
      continue
    }
    $streams++
    if($e.state -cne $present -or ($e.length -isnot [int] -and $e.length -isnot [long]) -or $e.length -lt 0 -or $e.sha256 -cnotmatch '^[a-f0-9]{64}$' -or $e.cipherName -cne ('v3-{0:d2}.enc' -f $i) -or $e.cipherLength -lt 1 -or $e.cipherSha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'v3 stream'}
    if(-not $OfflineFixture -and ($e.length -ne $r.length -or $e.sha256 -cne $r.sha256)){throw 'v3 native expected bytes'}
    $h=$e.header|ConvertFrom-Json
    Assert-V3AttemptBinding $h.attemptBinding
    if($h.version -ne 3 -or $h.profile -cne $p.profile -or $h.checkpoint -cne $p.checkpoint -or $h.sourceMode -cne $mode -or -not (Test-V3Bool $h.synthetic ([bool]$OfflineFixture)) -or $h.policySha256 -cne $m.policySha256 -or $h.role -cne $e.role -or $h.name -cne $e.name -or $h.origin -cne $e.origin -or $h.length -ne $e.length -or $h.sha256 -cne $e.sha256){throw 'v3 header'}
  }
  if($m.streams -ne $streams -or ($OfflineFixture -and $m.syntheticStreams -ne $streams)){throw 'v3 stream count'}
  if(-not $OfflineFixture -and ($m.actualNativeArchiveRecords -ne $p.expectedRoleSchema.records -or $m.actualNativeArchiveStreams -ne $p.expectedStreamSchema.streams -or $m.actualNativeArchiveStreams -ne $streams)){throw 'v3 native archive count'}
}
function Get-V3FixtureEntries($policy) {
  $dir=CheckPath $FixtureDirectory
  if(-not $dir.StartsWith($testRoot,[StringComparison]::OrdinalIgnoreCase) -or [IO.File]::ReadAllText((Join-Path $dir 'fixture-only.txt')) -cne 'SYNTHETIC-OFFLINE-ONLY'){throw 'v3 fixture scope'}
  $rows=@()
  for($i=0;$i -lt $policy.roles.Count;$i++){
    $r=$policy.roles[$i];$path=CheckPath (Join-Path $dir ('v3-source-{0:d2}.bin' -f $i))
    if($r.observedState -ceq 'observed_absent'){
      if(Test-Path -LiteralPath $path){throw 'v3 unexpected final comparison'}
      $rows+=,[ordered]@{role=$r.role;name=$r.name;origin=$r.origin;state='synthetic_absent';length=$null;sha256=$null}
    }else{
      $rows+=,[ordered]@{role=$r.role;name=$r.name;origin=$r.origin;state='synthetic_present';length=([IO.FileInfo]$path).Length;sha256=[CheckpointCrypto]::FileHash($path)}
    }
  }
  return ,$rows
}
function Invoke-V3 {
  $master=$null;$macKey=$null
  try {
  $policyRaw=Get-V3PolicyRaw;$policy=$utf8.GetString($policyRaw)|ConvertFrom-Json
  if($CheckpointId -cne $policy.checkpoint){throw 'v3 checkpoint'}
  . (Join-Path $PSScriptRoot 'checkpoint-profile-v3-native.ps1')
  $mode=if($OfflineFixture){'offline-synthetic-v3'}else{'native-ssh-v3'}
  $synthetic=[bool]$OfflineFixture
  $v3AttemptBinding=$null
  if(-not $synthetic){$v3AttemptBinding=Get-V3ActiveControllerBinding $Action $policy}
  $entropy=if($synthetic){$utf8.GetBytes('cashflow-backup-checkpoint.v1')}else{$utf8.GetBytes('independent-attempt-v3:'+$v3AttemptBinding.authorizationSha256)}
  $manifestName=if($synthetic){'manifest.json'}else{'attempt-manifest.json'}
  $manifestMacName=if($synthetic){'manifest.hmac'}else{'attempt-manifest.hmac'}
  $masterName=if($synthetic){'master.dpapi'}else{'attempt-master.dpapi'}
  $present=if($synthetic){'synthetic_present'}else{'present'};$absent=if($synthetic){'synthetic_absent'}else{'absent'}
  $capturedStatus=if($synthetic){'CAPTURED_SYNTHETIC_NOT_VERIFIED'}else{'CAPTURED_NOT_VERIFIED'}
  $verifiedStatus=if($synthetic){'PASS_SYNTHETIC_PROFILE_V3'}else{'PASS_NATIVE_PROFILE_V3'}
  $packet=$null;$meta=$null;$afterMeta=$null
  $policyHash=[CheckpointCrypto]::Hash($policyRaw)
  if($Action -ceq 'Capture'){
    # Existing partial destinations are never overwritten, removed, or retried.
    if(Test-Path -LiteralPath $Destination){throw 'v3 existing attempt requires readback'}
    if($synthetic){$entries=Get-V3FixtureEntries $policy}else{$packet=V3Packet $policyRaw;$meta=V3NativeMetadata $packet $policyRaw;$entries=@($meta.artifacts)}
    $needed=1GB;foreach($e in $entries){if($e.state -ceq $present){$needed=[long]$needed+[long]$e.length+32768}}
    if([IO.DriveInfo]::new([IO.Path]::GetPathRoot($Destination)).AvailableFreeSpace -lt $needed){throw 'v3 space'}
    PrivateDirectory $Destination;CheckPrivateDirectory $Destination
    $master=[Security.Cryptography.RandomNumberGenerator]::GetBytes(64);$macKey=$master[32..63]
    WriteNew (Join-Path $Destination $masterName) ([Security.Cryptography.ProtectedData]::Protect($master,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser))
    $records=@();$streams=0
    for($i=0;$i -lt $entries.Count;$i++){
      $e=$entries[$i];$record=[ordered]@{role=$e.role;name=$e.name;origin=$e.origin;state=$e.state;length=$e.length;sha256=$e.sha256;header=$null;cipherName=$null;cipherLength=$null;cipherSha256=$null;observation=$(if($e.state -ceq 'absent'){$e.observation}else{$null})}
      if($e.state -ceq $present){
        $streams++;$header=([ordered]@{version=3;profile=$policy.profile;checkpoint=$CheckpointId;sourceMode=$mode;synthetic=$synthetic;attemptBinding=$v3AttemptBinding;policySha256=$policyHash;role=$e.role;name=$e.name;origin=$e.origin;length=[long]$e.length;sha256=$e.sha256}|ConvertTo-Json -Compress)
        $cipherName='v3-{0:d2}.enc' -f $i;$cipher=Join-Path $Destination $cipherName
        if($synthetic){
          $stream=[IO.File]::OpenRead((CheckPath (Join-Path $FixtureDirectory ('v3-source-{0:d2}.bin' -f $i))))
          try{[CheckpointCrypto]::Encrypt($stream,$cipher,$header,[long]$e.length,$e.sha256,$master)}finally{$stream.Dispose()}
        }elseif($e.origin -ceq 'memory'){
          $bytes=if($e.role -ceq 'binding'){$packet.binding}else{$packet.envelope}
          $stream=[IO.MemoryStream]::new($bytes,$false)
          try{[CheckpointCrypto]::Encrypt($stream,$cipher,$header,[long]$e.length,$e.sha256,$master)}finally{$stream.Dispose()}
        }else{
          $ssh=[CheckpointSsh]::new('python3 -',(V3RemoteScript $packet 'file' $i ([long]$e.length) $e.sha256),1800)
          try{[CheckpointCrypto]::Encrypt($ssh.Output,$cipher,$header,[long]$e.length,$e.sha256,$master);$ssh.Complete()}finally{$ssh.Dispose()}
        }
        $record.header=$header;$record.cipherName=$cipherName;$record.cipherLength=([IO.FileInfo]$cipher).Length;$record.cipherSha256=[CheckpointCrypto]::FileHash($cipher)
      }
      $records+=,$record
    }
    if($synthetic){$after=Get-V3FixtureEntries $policy}else{$afterMeta=V3NativeMetadata $packet $policyRaw;$after=@($afterMeta.artifacts)}
    for($i=0;$i -lt $entries.Count;$i++){if($after[$i].state -cne $entries[$i].state -or $after[$i].length -ne $entries[$i].length -or $after[$i].sha256 -cne $entries[$i].sha256){throw 'v3 source changed'}}
    $m=[ordered]@{version=3;profile=$policy.profile;checkpoint=$CheckpointId;sourceMode=$mode;synthetic=$synthetic;attemptBinding=$v3AttemptBinding;policySha256=$policyHash;policyBase64=[Convert]::ToBase64String($policyRaw);originalStatus='failed';core17Status='not_accepted';syntheticStreams=$(if($synthetic){$streams}else{$null});streams=$streams;actualNativeArchiveRecords=$(if($synthetic){$null}else{$records.Count});actualNativeArchiveStreams=$(if($synthetic){$null}else{$streams});freshReadGate=$(if($meta){$meta.freshReadGate}else{$null});postCaptureReadGate=$(if($afterMeta){$afterMeta.freshReadGate}else{$null});postCaptureAbsence=$(if($afterMeta){$afterMeta.artifacts[23].observation}else{$null});readiness=$false;releaseAuthorized=$false;applyAllowed=$false;independentGates=@{storageBinary='NOT_VERIFIED';rollback='NOT_VERIFIED';freshCapacity='NOT_VERIFIED';compatibility='NOT_VERIFIED';snapshotCoverage=$(if($synthetic){'SYNTHETIC_ONLY'}else{'CORE_EXPORT_ONLY_GLOBALS_PRIVATE_SEPARATE'})};artifacts=$records}
    Assert-V3Manifest ([pscustomobject]$m) $policyRaw
    $raw=JsonBytes $m;if($raw.Length -gt 131072){throw 'v3 manifest bound'}
    WriteNew (Join-Path $Destination $manifestName) $raw
    WriteNew (Join-Path $Destination $manifestMacName) ([CheckpointCrypto]::Mac($raw,$macKey))
    WriteNew (Join-Path $Destination 'capture-complete.json') (JsonBytes @{status=$capturedStatus;version=3;profile=$policy.profile;checkpoint=$CheckpointId;sourceMode=$mode;synthetic=$synthetic;attemptBinding=$v3AttemptBinding;manifestSha256=[CheckpointCrypto]::Hash($raw);releaseAuthorized=$false})
    if($synthetic){[Console]::WriteLine("CHECKPOINT_CAPTURED profile=corrected-core-private-v3 mode=$mode")}
  }else{
    CheckPrivateDirectory $Destination
    $master=[Security.Cryptography.ProtectedData]::Unprotect((BoundedBytes (Join-Path $Destination $masterName) 16384),$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    if($master.Length -ne 64){throw 'v3 key'};$macKey=$master[32..63]
    $raw=BoundedBytes (Join-Path $Destination $manifestName) 131072
    if(-not [CheckpointCrypto]::Equal([CheckpointCrypto]::Mac($raw,$macKey),(BoundedBytes (Join-Path $Destination $manifestMacName) 32))){throw 'v3 manifest MAC'}
    $m=$utf8.GetString($raw)|ConvertFrom-Json;Assert-V3Manifest $m $policyRaw
    $done=$utf8.GetString((BoundedBytes (Join-Path $Destination 'capture-complete.json') 4096))|ConvertFrom-Json
    Assert-V3AttemptBinding $done.attemptBinding
    if($done.status -cne $capturedStatus -or $done.sourceMode -cne $mode -or $done.version -ne 3 -or $done.profile -cne $m.profile -or $done.checkpoint -cne $m.checkpoint -or -not (Test-V3Bool $done.synthetic $synthetic) -or -not (Test-V3Bool $done.releaseAuthorized $false) -or $done.manifestSha256 -cne [CheckpointCrypto]::Hash($raw)){throw 'v3 incomplete'}
    foreach($e in $m.artifacts){if($e.state -ceq $absent){continue};$path=CheckPath (Join-Path $Destination $e.cipherName);if(([IO.FileInfo]$path).Length -ne $e.cipherLength -or [CheckpointCrypto]::FileHash($path) -cne $e.cipherSha256){throw 'v3 ciphertext'};[CheckpointCrypto]::Verify($path,$e.header,[long]$e.length,$e.sha256,$master)}
    if($synthetic){WriteNew (Join-Path $Destination 'verified.json') (JsonBytes @{status=$verifiedStatus;profile=$m.profile;checkpoint=$m.checkpoint;sourceMode=$mode;synthetic=$synthetic;attemptBinding=$v3AttemptBinding;nativeGateExecuted=(-not $synthetic);manifestSha256=[CheckpointCrypto]::Hash($raw);syntheticStreams=$m.syntheticStreams;actualNativeArchiveRecords=$m.actualNativeArchiveRecords;actualNativeArchiveStreams=$m.actualNativeArchiveStreams;readiness=$false;releaseAuthorized=$false;applyAllowed=$false;independentGates=$m.independentGates})}
    if($synthetic){[Console]::WriteLine("CHECKPOINT_VERIFIED profile=corrected-core-private-v3 mode=$mode")}
  }
  }finally{if($master){[Array]::Clear($master,0,$master.Length)};if($macKey){[Array]::Clear($macKey,0,$macKey.Length)}}
}
