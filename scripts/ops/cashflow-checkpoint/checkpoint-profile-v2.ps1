# Pure profile checks only. No filesystem, SSH, crypto, role or runtime operations.
function Get-V2Names {
  return @('postgres.dump','globals.private.sql','cron.private.json','source-inventory.private','target-inventory.private','comparison.private.json','receipt.json',
    'acl19-reconciliation-20261031/intent.json','acl19-reconciliation-20261031/plan.json','acl19-reconciliation-20261031/result.json',
    'acl19-reconciliation-20261031/strict-core-comparison.json','acl19-reconciliation-20261031/strict-private-comparison.json',
    'external/v04-fresh-checkpoint-20261030/private-before.json','external/v04-fresh-checkpoint-20261030/result.json',
    'release-binding.json','read-attestation.json')
}
function Get-V2Pins {
  return @{
    helper='1f1454f9aea632609c002335e628c2f463f96f28cb131bc95c2ff6f2bda2a9f2'
    gate='9289f162919bd1b2e462d2c823758b7b693f27988562d3554be197c9b65666a3'
    consumer='18dcdff88cb8d41f8c5ee9e8236e0fdba9e7a212ef8c1044769165cc8010ac2c'
    binding='7819e0fb16bbb2c9171099cab07953c3137634d665616af509d4061306af9325'
    source='9193dfe09afa17a6270bc6be4db0b08473cd82023b5d14fd11e3adaf863d855c'
    target='833a8447c01570811d6a0ad50cafee00745614b811ef9668acb0d944e04b21f1'
    hashes=@('87434f8c53cca9910cdbd953415ffed5e01d3aacb0db8c0702a4e164253c8c17',$null,$null,
      'e88607ad044151ec11678aa1f8427567d10cee2b23c2fa57ff982c65b41a76a7',$null,$null,
      'b3cc167b604740207f884db3b037fea59e976fe296a72ed51527d79133d40aef',
      '5b1f294617e3242765e6676af3ffcc359e2a907184bcc279a78eded7a0cd8574',
      'ac02b84f75517031420296097d3a756bd190a6ca6e505ab0e437b6d555da76e9',
      'e4a794edff3bd2b626d41feb8f8ec5a520683b4b76b66bd6bad63cee18cccde9',
      '74baf16c5cc1841e9de4471b0faf5405caab88848c4ad725e8b1f6c93c95516c',
      '8ee8848b26b9024a3467006ace126ff84c2a5cc78ca5f136f020a76014d5bbce',
      'a9fe3c6837ae92ce03ff007a650e2c92e23b134697e54658e4d6be140634c641',
      '70e67bbdd0813f27ed866c3c1152ff22606856ef09875f069393801cad643cae',
      '7819e0fb16bbb2c9171099cab07953c3137634d665616af509d4061306af9325',$null)
  }
}
function Test-V2Bool($Value,[bool]$Expected) { return ($Value -is [bool] -and $Value -eq $Expected) }
function Assert-V2Proof($Proof,[string]$Mode,[switch]$Fresh) {
  $p=Get-V2Pins
  if($Mode -ceq 'native-ssh-v2'){
    if($Proof.status -cne 'PASS_PINNED_SQL_RESTORE_READ_GATE' -or $Proof.checkpoint -cne '20261030T215307Z' -or
      $Proof.bindingSha256 -cne $p.binding -or $Proof.sourceId -cne $p.source -or $Proof.targetId -cne $p.target -or
      $Proof.dumpSha256 -cne $p.hashes[0] -or $Proof.dumpBytes -isnot [long] -and $Proof.dumpBytes -isnot [int] -or $Proof.dumpBytes -ne 2406546295 -or
      $Proof.originalStatus -cne 'failed' -or $Proof.correctionStatus -cne 'PASS_OWNED_COPY_ACL19_RECONCILIATION' -or
      $Proof.originalReceiptSha256 -cne $p.hashes[6] -or $Proof.correctionReceiptSha256 -cne $p.hashes[9] -or
      -not (Test-V2Bool $Proof.proofStopped $true) -or $Proof.proofNetwork -cne 'none' -or -not (Test-V2Bool $Proof.proofPortsPublished $false) -or -not (Test-V2Bool $Proof.sourceHealthy $true)){throw 'v2 proof'}
    foreach($key in @('sqlExecuted','backupRetried','filesTransferred','releaseAuthorized','captureConsumerIntegrated','installerConsumerIntegrated')){if(-not (Test-V2Bool $Proof.$key $false)){throw 'v2 proof boundary'}}
    if($Fresh){
      # ConvertFrom-Json may already have parsed UTC into DateTime. Converting
      # that object implicitly to a local string discards its UTC kind/offset.
      $at=[DateTimeOffset]::MinValue
      if($Proof.at -is [DateTimeOffset]){$at=$Proof.at}
      elseif($Proof.at -is [datetime] -and $Proof.at.Kind -ne [DateTimeKind]::Unspecified){$at=[DateTimeOffset]::new($Proof.at)}
      elseif($Proof.at -is [string] -and $Proof.at -cmatch '(Z|[+-]\d{2}:\d{2})$'){
        if(-not [DateTimeOffset]::TryParse($Proof.at,[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::None,[ref]$at)){throw 'v2 gate time'}
      }else{throw 'v2 gate time'}
      if([math]::Abs(([DateTimeOffset]::UtcNow-$at).TotalSeconds) -gt 900){throw 'v2 stale gate'}
    }
  }elseif($Mode -ceq 'offline-synthetic-v2'){
    if($Proof.status -cne 'PASS_SYNTHETIC_PROFILE_V2' -or -not (Test-V2Bool $Proof.synthetic $true) -or -not (Test-V2Bool $Proof.nativeGateExecuted $false) -or
      $Proof.originalStatus -cne 'failed' -or -not (Test-V2Bool $Proof.releaseAuthorized $false) -or -not (Test-V2Bool $Proof.readiness $false)){throw 'v2 synthetic proof'}
  }else{throw 'v2 mode'}
}
function Assert-V2Entries($Entries,[string]$Mode) {
  $names=Get-V2Names;$p=Get-V2Pins
  if($Entries.Count -ne 16){throw 'v2 entries'}
  for($i=0;$i -lt 16;$i++){
    $e=$Entries[$i]
    if($e.name -cne $names[$i] -or ($e.length -isnot [long] -and $e.length -isnot [int]) -or $e.length -lt 0 -or $e.sha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'v2 entry'}
    if($Mode -ceq 'native-ssh-v2' -and (($p.hashes[$i] -and $e.sha256 -cne $p.hashes[$i]) -or ($i -eq 0 -and $e.length -ne 2406546295) -or ($i -eq 14 -and $e.length -ne 2351))){throw 'v2 native pin'}
    if($i -ne 0 -and $e.length -gt 524288){throw 'v2 small size'}
  }
  if($Mode -cnotin @('native-ssh-v2','offline-synthetic-v2')){throw 'v2 mode'}
}
function Assert-V2Manifest($Manifest,[string]$Checkpoint,[string]$Mode) {
  $p=Get-V2Pins
  if($Manifest.version -ne 2 -or $Manifest.profile -cne 'corrected-acl19-v2' -or $Manifest.checkpoint -cne $Checkpoint -or
    $Manifest.helperSha256 -cne $p.helper -or $Manifest.sourceMode -cne $Mode -or $Manifest.originalStatus -cne 'failed' -or
    -not (Test-V2Bool $Manifest.readiness $false) -or -not (Test-V2Bool $Manifest.releaseAuthorized $false)){throw 'v2 manifest'}
  Assert-V2Proof $Manifest.attestation $Mode
  Assert-V2Proof $Manifest.postCaptureAttestation $Mode
  Assert-V2Entries $Manifest.files $Mode
  foreach($key in @('storageBinary','currentSql','capacity')){if($Manifest.independentGates.$key -cne 'NOT_VERIFIED'){throw 'v2 independent gate'}}
  $snapshot=if($Mode -ceq 'native-ssh-v2'){'CORE_EXPORT_ONLY_GLOBALS_PRIVATE_SEPARATE'}else{'SYNTHETIC_ONLY'}
  if($Manifest.independentGates.snapshotCoverage -cne $snapshot){throw 'v2 snapshot'}
  if($Mode -ceq 'native-ssh-v2' -and $Checkpoint -cne '20261030T215307Z'){throw 'v2 checkpoint'}
  for($i=0;$i -lt 16;$i++){
    $e=$Manifest.files[$i];$h=$e.header|ConvertFrom-Json
    if($e.cipherName -cne ('v2-{0:d2}.enc' -f $i) -or ($e.cipherLength -isnot [long] -and $e.cipherLength -isnot [int]) -or $e.cipherLength -lt 1 -or $e.cipherSha256 -cnotmatch '^[a-f0-9]{64}$' -or
      $h.version -ne 2 -or $h.profile -cne $Manifest.profile -or $h.checkpoint -cne $Checkpoint -or $h.helperSha256 -cne $p.helper -or $h.sourceMode -cne $Mode -or
      $h.name -cne $e.name -or $h.length -ne $e.length -or $h.sha256 -cne $e.sha256){throw 'v2 header'}
  }
}
