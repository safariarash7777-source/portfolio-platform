# Pure validators. No I/O, key generation, SSH or operational authorization.
function Get-R2PolicyPin { return '6a1c0113a53a7ac4d8f1cc07e2514fec07f13ec7bd5c4d2987e87120102837cc' }
function Assert-R2Policy([byte[]]$Raw) {
  if($Raw.Length -ne 4431 -or [CheckpointCrypto]::Hash($Raw) -cne (Get-R2PolicyPin)){throw 'r2 policy pin'}
  $p=([Text.UTF8Encoding]::new($false,$true)).GetString($Raw)|ConvertFrom-Json
  if($p.profile -cne 'corrected-acl19-failed-v2r2' -or $p.profileRevision -ne 2 -or $p.records -ne 17 -or $p.streams -ne 16 -or $p.absentIndex -ne 5){throw 'r2 policy shape'}
  return $p
}
function Assert-R2Mode([string]$Mode) {if($Mode -cnotin @('native-ssh-v2r2','offline-synthetic-v2r2')){throw 'r2 mode'}}
function Get-R2Keys($Value) {if($Value -is [Collections.IDictionary]){return @($Value.Keys)};return @($Value.PSObject.Properties.Name)}
function Assert-R2Observation($Observation,[string]$Mode,[switch]$Fresh) {
  foreach($k in @('atUtc','method','neverCreated','historicalNotDeleted')){if($k -cnotin (Get-R2Keys $Observation)){throw 'r2 observation missing'}}
  if($null -cne $Observation.neverCreated -or $null -cne $Observation.historicalNotDeleted){throw 'r2 history unknown'}
  $method=if($Mode -ceq 'native-ssh-v2r2'){'OWNED_PARENT_CHILD_ENOENT_SHARED_LOCK'}else{'SYNTHETIC_CHILD_ENOENT_ONLY'}
  if($Observation.method -cne $method){throw 'r2 absence method'}
  $at=[DateTimeOffset]::MinValue
  if($Observation.atUtc -is [DateTimeOffset]){$at=$Observation.atUtc}
  elseif($Observation.atUtc -is [datetime] -and $Observation.atUtc.Kind -ne [DateTimeKind]::Unspecified){$at=[DateTimeOffset]::new($Observation.atUtc)}
  elseif($Observation.atUtc -is [string] -and $Observation.atUtc -cmatch '(Z|[+-]\d{2}:\d{2})$'){
    if(-not [DateTimeOffset]::TryParse($Observation.atUtc,[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::None,[ref]$at)){throw 'r2 absence time'}
  }else{throw 'r2 absence time'}
  if($Mode -ceq 'native-ssh-v2r2' -and $at -lt [DateTimeOffset]::Parse('2026-10-31T02:33:07.223526+00:00')){throw 'r2 observation backdated'}
  if($Fresh -and [math]::Abs(([DateTimeOffset]::UtcNow-$at).TotalSeconds) -gt 900){throw 'r2 stale observation'}
}
function Assert-R2Proof($Proof,[string]$Mode,[switch]$Fresh) {
  Assert-R2Mode $Mode
  if($Mode -ceq 'native-ssh-v2r2'){Assert-V2Proof $Proof 'native-ssh-v2' -Fresh:$Fresh;return}
  if($Proof.status -cne 'PASS_SYNTHETIC_PROFILE_V2R2' -or -not (Test-V2Bool $Proof.synthetic $true) -or
    -not (Test-V2Bool $Proof.nativeGateExecuted $false) -or $Proof.originalStatus -cne 'failed' -or
    -not (Test-V2Bool $Proof.readiness $false) -or -not (Test-V2Bool $Proof.releaseAuthorized $false)){throw 'r2 synthetic proof'}
}
function Get-R2Cipher([int]$Index) {
  if($Index -lt 0 -or $Index -gt 16 -or $Index -eq 5){throw 'r2 absent has no cipher'}
  return ('v2r2-{0:d2}.enc' -f $(if($Index -lt 5){$Index}else{$Index-1}))
}
function Assert-R2Entries($Entries,[byte[]]$PolicyRaw,[string]$Mode) {
  Assert-R2Mode $Mode;$policy=Assert-R2Policy $PolicyRaw
  if($Entries.Count -ne 17){throw 'r2 role count'}
  for($i=0;$i -lt 17;$i++){
    $e=$Entries[$i];$r=$policy.roles[$i]
    if($e.role -cne $r.role -or $e.name -cne $r.name -or $e.origin -cne $r.origin -or $e.state -cne $r.requiredState){throw 'r2 role identity'}
    if($i -eq 5){
      foreach($k in @('length','sha256','owner','observation')){if($k -cnotin (Get-R2Keys $e)){throw 'r2 absence missing'}}
      if($null -cne $e.length -or $null -cne $e.sha256 -or $null -cne $e.owner -or
        $null -cne $e.observation.neverCreated -or $null -cne $e.observation.historicalNotDeleted){throw 'r2 absent nulls'}
      Assert-R2Observation $e.observation $Mode
      continue
    }
    if(($e.length -isnot [long] -and $e.length -isnot [int]) -or $e.length -lt 0 -or $e.sha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'r2 present bytes'}
    if($i -ne 0 -and $e.length -gt 524288){throw 'r2 small bound'}
    if($Mode -ceq 'native-ssh-v2r2'){
      if(($null -cne $r.expectedLength -and $e.length -ne $r.expectedLength) -or ($r.expectedSha256 -and $e.sha256 -cne $r.expectedSha256)){throw 'r2 native bytes pin'}
      if('owner' -cnotin (Get-R2Keys $e) -or ($r.origin -cne 'memory' -and (($e.owner -isnot [int] -and $e.owner -isnot [long]) -or $e.owner -ne 0)) -or ($r.origin -ceq 'memory' -and $null -cne $e.owner)){throw 'r2 owner'}
    }
  }
}
function Assert-R2Manifest($Manifest,[byte[]]$PolicyRaw,[string]$Checkpoint,[string]$Mode) {
  $p=Assert-R2Policy $PolicyRaw;Assert-R2Mode $Mode
  if($Manifest.version -ne 2 -or $Manifest.profileRevision -ne 2 -or $Manifest.profile -cne $p.profile -or
    $Manifest.checkpoint -cne $Checkpoint -or $Manifest.sourceMode -cne $Mode -or $Manifest.originalStatus -cne 'failed' -or
    $Manifest.policySha256 -cne (Get-R2PolicyPin) -or $Manifest.parentBindingSha256 -cne $p.parentBindingSha256 -or
    $Manifest.helperSha256 -cne $p.helperSha256 -or -not (Test-V2Bool $Manifest.readiness $false) -or -not (Test-V2Bool $Manifest.releaseAuthorized $false)){throw 'r2 manifest'}
  $embedded=[Convert]::FromBase64String($Manifest.policyBase64)
  $null=Assert-R2Policy $embedded
  if($Mode -ceq 'native-ssh-v2r2' -and $Checkpoint -cne $p.checkpoint){throw 'r2 checkpoint'}
  Assert-R2Proof $Manifest.attestation $Mode
  Assert-R2Proof $Manifest.postCaptureAttestation $Mode
  Assert-R2Observation $Manifest.postCaptureAbsence $Mode
  Assert-R2Entries $Manifest.artifacts $PolicyRaw $Mode
  foreach($key in @('storageBinary','currentSql','capacity')){if($Manifest.independentGates.$key -cne 'NOT_VERIFIED'){throw 'r2 independent gate'}}
  $snapshot=if($Mode -ceq 'native-ssh-v2r2'){'CORE_EXPORT_ONLY_GLOBALS_PRIVATE_SEPARATE'}else{'SYNTHETIC_ONLY'}
  if($Manifest.independentGates.snapshotCoverage -cne $snapshot){throw 'r2 snapshot'}
  for($i=0;$i -lt 17;$i++){
    $e=$Manifest.artifacts[$i]
    if($i -eq 5){
      foreach($k in @('cipherName','cipherLength','cipherSha256','header')){if($k -cnotin (Get-R2Keys $e) -or $null -cne $e.$k){throw 'r2 absent cipher'}}
      continue
    }
    $h=$e.header|ConvertFrom-Json
    if($e.cipherName -cne (Get-R2Cipher $i) -or ($e.cipherLength -isnot [long] -and $e.cipherLength -isnot [int]) -or $e.cipherLength -lt 1 -or $e.cipherSha256 -cnotmatch '^[a-f0-9]{64}$' -or
      $h.version -ne 2 -or $h.profileRevision -ne 2 -or $h.profile -cne $p.profile -or $h.policySha256 -cne (Get-R2PolicyPin) -or
      $h.checkpoint -cne $Checkpoint -or $h.sourceMode -cne $Mode -or $h.helperSha256 -cne $p.helperSha256 -or
      $h.role -cne $e.role -or $h.name -cne $e.name -or $h.origin -cne $e.origin -or $h.length -ne $e.length -or $h.sha256 -cne $e.sha256){throw 'r2 header'}
  }
}
