# Provider for the existing explicit Profile/Action dispatch; no operation on load.
function V3Packet([byte[]]$PolicyRaw) {
  $dir=Join-Path $PSScriptRoot 'v3-reviewed'
  $gate=BoundedBytes (Join-Path $dir 'checkpoint-read-gate.py') 65536
  $binding=BoundedBytes (Join-Path $dir 'binding.json') 65536
  $envelope=BoundedBytes (Join-Path $dir 'read-gate-envelope.json') 65536
  $code=BoundedBytes (Join-Path $PSScriptRoot 'checkpoint-profile-v3-remote.py') 65536
  if([CheckpointCrypto]::Hash($gate) -cne 'a90996ce371a97701c50d5937fa11f866911f9387cbf9f4a1b130e4563c1fc3a' -or
    [CheckpointCrypto]::Hash($binding) -cne '390fc73da29c3b53e267c4566eb538ebb0142c6426a032b41e27e969eaa5ac27' -or
    [CheckpointCrypto]::Hash($envelope) -cne 'f6f47835716e95b381f8f638e5c0afc9844b8e0e165a0b3cfcb9fe5a5c11793e' -or
    [CheckpointCrypto]::Hash($code) -cne 'f0333d3e0959c4ecbb68b834390f7d4ffc0866e674a2f87cbb0cf1302cc9cb69'){throw 'v3 provider pins'}
  return @{code=$code;binding=$binding;envelope=$envelope;packet=(JsonBytes @{policy=[Convert]::ToBase64String($PolicyRaw);gate=[Convert]::ToBase64String($gate);binding=[Convert]::ToBase64String($binding);envelope=[Convert]::ToBase64String($envelope)})}
}
function V3RemoteScript($Packet,[string]$Mode,[int]$Index=-1,[long]$Length=0,[string]$Hash='') {
  if($Mode -cnotin @('metadata','file') -or ($Mode -ceq 'file' -and ($Index -lt 0 -or $Index -ge 24 -or $Index -eq 23 -or $Length -lt 0 -or $Hash -cnotmatch '^[a-f0-9]{64}$'))){throw 'v3 remote arguments'}
  $prefix="CODE=bytes.fromhex('"+[Convert]::ToHexString($Packet.code)+"')`nPACKET=bytes.fromhex('"+[Convert]::ToHexString($Packet.packet)+"')`nMODE='$Mode'`nINDEX=$Index`nLENGTH=$Length`nHASH='$Hash'`n"
  return $prefix+@'
import hashlib,json,signal,types
signal.signal(signal.SIGALRM,lambda *_: (_ for _ in ()).throw(TimeoutError()))
signal.alarm(170 if MODE=='metadata' else 1790)
if hashlib.sha256(CODE).hexdigest()!='f0333d3e0959c4ecbb68b834390f7d4ffc0866e674a2f87cbb0cf1302cc9cb69':raise ValueError()
module=types.ModuleType('reviewed_v3_provider')
exec(compile(CODE,'/in-memory/checkpoint-profile-v3-remote.py','exec'),module.__dict__)
module.run(json.loads(PACKET),MODE,INDEX,LENGTH,HASH)
'@
}
function Assert-V3NativeProof($g,$policy,[switch]$Fresh) {
  if($g.status -cne 'PASS_PINNED_SQL_RESTORE_READ_GATE' -or $g.checkpoint -cne $policy.checkpoint -or
    $g.bindingSha256 -cne $policy.bindingSha256 -or $g.originalStatus -cne 'failed' -or
    $g.correctionStatus -cne 'PASS_OWNED_COPY_PRIVATE2_RECONCILIATION' -or
    $g.originalReceiptSha256 -cne '695848a3f26da875b859c6589952eb9154ed0fae36f365b254b20e881cc793d6' -or
    $g.correctionReceiptSha256 -cne 'fda8610f0b849a799cf1c3d593d41ab918d687f5f5bf89a9d53a2e392897e106' -or
    $g.sourceId -cne '9193dfe09afa17a6270bc6be4db0b08473cd82023b5d14fd11e3adaf863d855c' -or
    $g.targetId -cne '458c668152b9bab455512c440889229452e0f3b23297bda236936fb2d1f8a065' -or
    $g.dumpSha256 -cne $policy.roles[0].sha256 -or $g.dumpBytes -ne $policy.roles[0].length -or
    -not (Test-V3Bool $g.sourceHealthy $true) -or -not (Test-V3Bool $g.proofStopped $true) -or
    $g.proofNetwork -cne 'none' -or -not (Test-V3Bool $g.proofPortsPublished $false) -or
    -not (Test-V3Bool $g.sqlExecuted $false) -or -not (Test-V3Bool $g.backupRetried $false) -or
    -not (Test-V3Bool $g.releaseAuthorized $false)){throw 'v3 native proof'}
  $at=[DateTimeOffset]::Parse($g.at)
  if($Fresh){$age=([DateTimeOffset]::UtcNow-$at).TotalSeconds;if($age -lt -30 -or $age -gt 180){throw 'v3 stale gate'}}
}
function Assert-V3Absence($o,[switch]$Fresh) {
  foreach($k in @('ownedParent','nofollow','reopenedSameParent','secondChildENOENT')){if(-not (Test-V3Bool $o.$k $true)){throw 'v3 absent parent'}}
  if($null -ne $o.neverCreated -or $null -ne $o.historicalNotDeleted){throw 'v3 absence scope'}
  $at=[DateTimeOffset]::Parse($o.atUtc)
  if($Fresh){$age=([DateTimeOffset]::UtcNow-$at).TotalSeconds;if($age -lt -30 -or $age -gt 180){throw 'v3 stale absence'}}
}
function V3NativeMetadata($packet,[byte[]]$PolicyRaw) {
  $policy=$utf8.GetString($PolicyRaw)|ConvertFrom-Json
  $ssh=[CheckpointSsh]::new('python3 -',(V3RemoteScript $packet 'metadata'),180)
  try{$meta=$utf8.GetString($ssh.ReadMetadata())|ConvertFrom-Json}finally{$ssh.Dispose()}
  if($meta.policySha256 -cne [CheckpointCrypto]::Hash($PolicyRaw) -or -not (Test-V3Bool $meta.readiness $false) -or -not (Test-V3Bool $meta.releaseAuthorized $false) -or $meta.artifacts.Count -ne $policy.roles.Count){throw 'v3 native metadata'}
  Assert-V3NativeProof $meta.freshReadGate $policy -Fresh
  for($i=0;$i -lt $policy.roles.Count;$i++){
    $e=$meta.artifacts[$i];$r=$policy.roles[$i]
    if($e.role -cne $r.role -or $e.name -cne $r.name -or $e.origin -cne $r.origin){throw 'v3 native role'}
    if($r.observedState -ceq 'observed_absent'){
      if($e.state -cne 'absent' -or $null -ne $e.length -or $null -ne $e.sha256){throw 'v3 native absence'}
      Assert-V3Absence $e.observation -Fresh
    }else{
      if($e.state -cne 'present' -or $e.length -ne $r.length -or $e.sha256 -cne $r.sha256){throw 'v3 native hash/length'}
      if($r.origin -cne 'memory'){
        foreach($k in @('ownedParent','nofollow','fdStable','reopenIdentityEqual')){if(-not (Test-V3Bool $e.$k $true)){throw 'v3 native stat guard'}}
        foreach($k in @('device','inode','length','mtimeNs','ctimeNs','owner','mode','links')){if($e.stat.$k -cne $r.observedStat.$k){throw 'v3 native stat'}}
      }elseif(-not (Test-V3Bool $e.recordedEvidenceOnly $true)){throw 'v3 memory evidence'}
    }
  }
  return $meta
}
