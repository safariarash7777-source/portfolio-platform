# Synthetic Windows/DPAPI tests only. No native source, SSH or production pin override.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'offline-failure-contract.ps1')
$results=[Collections.Generic.List[object]]::new();$master=$null;$phase='setup'
$wrapper=Join-Path $PSScriptRoot 'backup-checkpoint.ps1'
$helper=Join-Path $PSScriptRoot 'checkpoint-profile-v2.ps1'
. $helper
$pins=Get-V2Pins;$stamp='20261030T215307Z';$utf8=[Text.UTF8Encoding]::new($false,$true)
$run=Join-Path (Join-Path $PSScriptRoot 'test-output') ('v2-'+[guid]::NewGuid().ToString('N'))
$fixture=Join-Path $run 'source';$good=Join-Path $run 'good'
function Assert($Value,[string]$Name){if(-not $Value){throw $Name};$results.Add(@{name=$Name;status='PASS'})}
function Rejected([scriptblock]$Code,[string]$Name){$rejected=$false;try{& $Code}catch{$rejected=$true};Assert $rejected $Name}
function Clone($Value){return ($Value|ConvertTo-Json -Depth 30 -Compress|ConvertFrom-Json)}
function ExactGitBinding {
  # Binary Git stdout, never the CRLF working-tree file or a text pipeline.
  $psi=[Diagnostics.ProcessStartInfo]::new('git');$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
  $psi.WorkingDirectory=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
  $psi.ArgumentList.Add('show');$psi.ArgumentList.Add('HEAD:docs/ops/p15-webpack-cache-20261030/RELEASE-BINDING-20261031.json')
  $p=[Diagnostics.Process]::new();$p.StartInfo=$psi;$buffer=[IO.MemoryStream]::new()
  try{
    [void]$p.Start();$stderr=$p.StandardError.ReadToEndAsync();$copy=$p.StandardOutput.BaseStream.CopyToAsync($buffer)
    if(-not $p.WaitForExit(5000)){$p.Kill($true);throw 'git binding timeout'}
    $null=$copy.GetAwaiter().GetResult();$null=$stderr.GetAwaiter().GetResult()
    if($p.ExitCode -ne 0 -or $buffer.Length -gt 32768){throw 'exact Git binding unavailable'}
    return ,$buffer.ToArray()
  }finally{$buffer.Dispose();$p.Dispose()}
}
function Run([string]$Action,[string]$Destination,[bool]$Success=$true,[string]$Format='CorrectedAcl19V2',[string]$Pin=$pins.helper){
  $psi=[Diagnostics.ProcessStartInfo]::new((Get-Command pwsh).Source);$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
  foreach($a in @('-NoProfile','-File',$wrapper,'-Action',$Action,'-CheckpointId',$stamp,'-ReviewedHelperSha256',$Pin,'-Destination',$Destination,'-OfflineFixture','-FixtureDirectory',$fixture,'-Profile',$Format)){$psi.ArgumentList.Add($a)}
  $p=[Diagnostics.Process]::new();$p.StartInfo=$psi
  try{
    [void]$p.Start();$out=$p.StandardOutput.ReadToEndAsync();$err=$p.StandardError.ReadToEndAsync()
    if(-not $p.WaitForExit(30000)){$p.Kill($true);throw 'timeout'}
    $stdout=$out.GetAwaiter().GetResult();$stderr=$err.GetAwaiter().GetResult()
    if($Success){if($p.ExitCode -ne 0){throw "wrapper failed $Action $stderr"}}
    elseif($p.ExitCode -eq 0 -or $stdout.Length -or -not (Test-CheckpointFailureOutput $stderr)){throw 'unsafe error'}
  }finally{$p.Dispose()}
}
function CopyGood([string]$Name){$dest=Join-Path $run $Name;[IO.Directory]::CreateDirectory($dest)|Out-Null;Set-Acl -LiteralPath $dest -AclObject (Get-Acl -LiteralPath $good);foreach($f in Get-ChildItem -LiteralPath $good -File){if($f.Name -cne 'verified.json'){[IO.File]::Copy($f.FullName,(Join-Path $dest $f.Name),$false)}};return $dest}
function Resign([string]$Dest,$Object){
  $bytes=$utf8.GetBytes(($Object|ConvertTo-Json -Depth 30 -Compress))
  [IO.File]::WriteAllBytes((Join-Path $Dest 'manifest.json'),$bytes)
  [IO.File]::WriteAllBytes((Join-Path $Dest 'manifest.hmac'),[CheckpointCrypto]::Mac($bytes,[byte[]]$master[32..63]))
  $complete=Get-Content -LiteralPath (Join-Path $Dest 'capture-complete.json') -Raw|ConvertFrom-Json
  $complete.manifestSha256=[CheckpointCrypto]::Hash($bytes)
  [IO.File]::WriteAllText((Join-Path $Dest 'capture-complete.json'),($complete|ConvertTo-Json -Compress),$utf8)
}
try{
  [IO.Directory]::CreateDirectory($fixture)|Out-Null
  [IO.File]::WriteAllText((Join-Path $fixture 'fixture-only.txt'),'SYNTHETIC-OFFLINE-ONLY',$utf8)
  Add-Type -Path (Join-Path $PSScriptRoot 'CheckpointCrypto.cs')
  $names=Get-V2Names
  for($i=0;$i -lt 16;$i++){
    $bytes=$utf8.GetBytes("SYNTHETIC $i $($names[$i])`r`nRAW-CRLF-PRESERVED`r`n")
    if($i -eq 0){$bytes=[byte[]]::new(3*65536+37);for($j=0;$j -lt $bytes.Length;$j++){$bytes[$j]=[byte](($j*17+5)%251)}}
    if($i -eq 1){$bytes=[byte[]]::new(0)}
    if($i -eq 6){$bytes=$utf8.GetBytes('{"status":"failed","synthetic":true}')}
    if($i -eq 15){$bytes=$utf8.GetBytes('{"status":"PASS_SYNTHETIC_PROFILE_V2","synthetic":true,"nativeGateExecuted":false,"originalStatus":"failed","readiness":false,"releaseAuthorized":false}')}
    [IO.File]::WriteAllBytes((Join-Path $fixture ('v2-source-{0:d2}.bin' -f $i)),$bytes)
  }
  $phase='roundtrip';Run 'Capture' $good;Run 'Verify' $good
  $m=Get-Content -LiteralPath (Join-Path $good 'manifest.json') -Raw|ConvertFrom-Json
  $v=Get-Content -LiteralPath (Join-Path $good 'verified.json') -Raw|ConvertFrom-Json
  Assert ($v.status -ceq 'PASS' -and $v.files -eq 16 -and $v.version -eq 2 -and $v.sourceMode -ceq 'offline-synthetic-v2' -and -not $v.readiness -and -not $v.releaseAuthorized) 'V2 roundtrip 16 exact streams; readiness/release false'
  Assert (@(Get-ChildItem -LiteralPath $good -File).Count -eq 21 -and @($m.files|Where-Object {$_.cipherName -cnotmatch '^v2-\d{2}\.enc$'}).Count -eq 0) 'flat ciphertext allowlist; no plaintext archive/receipt files'
  for($i=0;$i -lt 16;$i++){$bytes=[IO.File]::ReadAllBytes((Join-Path $fixture ('v2-source-{0:d2}.bin' -f $i)));if($m.files[$i].length -ne $bytes.Length -or $m.files[$i].sha256 -cne [CheckpointCrypto]::Hash($bytes)){throw 'raw preservation'}}
  Assert $true 'all16 plaintext hashes/lengths retain exact original bytes including CRLF/empty/buffer crossings'
  $entropy=$utf8.GetBytes('cashflow-backup-checkpoint.v1')
  $master=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $good 'master.dpapi')),$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $phase='profiles'
  Rejected {Assert-V2Manifest $m $stamp 'native-ssh-v2'} 'synthetic archive cannot select native sourceMode'
  $x=Clone $m;$x.attestation.originalStatus='passed';Rejected {Assert-V2Manifest $x $stamp 'offline-synthetic-v2'} 'original failed cannot be projected passed'
  $x=Clone $m;$x.releaseAuthorized=$true;Rejected {Assert-V2Manifest $x $stamp 'offline-synthetic-v2'} 'archive never authorizes release'
  $x=Clone $m;$x.independentGates.capacity='PASS';Rejected {Assert-V2Manifest $x $stamp 'offline-synthetic-v2'} 'capacity remains a separate unverified gate'
  $x=Clone $m;$x.attestation.nativeGateExecuted=0;Rejected {Assert-V2Manifest $x $stamp 'offline-synthetic-v2'} 'booleans must be JSON booleans'
  $x=Clone $m;$x.files[7].name='../intent.json';Rejected {Assert-V2Manifest $x $stamp 'offline-synthetic-v2'} 'unknown/traversal logical names rejected'
  $x=Clone $m;$x.files[7].cipherName='../escaped.enc';Rejected {Assert-V2Manifest $x $stamp 'offline-synthetic-v2'} 'cipher name traversal rejected'
  $x=Clone $m;$x.files[8]=$x.files[7];Rejected {Assert-V2Manifest $x $stamp 'offline-synthetic-v2'} 'duplicate/missing correction entry rejected'
  $x=Clone $m;$x.files=@($x.files[0..14]);Rejected {Assert-V2Manifest $x $stamp 'offline-synthetic-v2'} 'missing attestation rejected'
  $x=Clone $m;$x.files[9].header=$x.files[9].header.Replace('offline-synthetic-v2','native-ssh-v2');Rejected {Assert-V2Manifest $x $stamp 'offline-synthetic-v2'} 'authenticated header binds sourceMode'
  $x=Clone $m;$x.files[4].length=1.5;Rejected {Assert-V2Entries $x.files 'offline-synthetic-v2'} 'fractional byte lengths rejected'
  # Pure native vectors use the immutable production pins; never a runtime fixture override.
  $native=@{status='PASS_PINNED_SQL_RESTORE_READ_GATE';checkpoint=$stamp;bindingSha256=$pins.binding;sourceId=$pins.source;targetId=$pins.target;dumpSha256=$pins.hashes[0];dumpBytes=[long]2406546295;originalStatus='failed';correctionStatus='PASS_OWNED_COPY_ACL19_RECONCILIATION';originalReceiptSha256=$pins.hashes[6];correctionReceiptSha256=$pins.hashes[9];proofStopped=$true;proofNetwork='none';proofPortsPublished=$false;sourceHealthy=$true;sqlExecuted=$false;backupRetried=$false;filesTransferred=$false;releaseAuthorized=$false;captureConsumerIntegrated=$false;installerConsumerIntegrated=$false;at=[datetime]::UtcNow.ToString('o')}
  Assert-V2Proof ([pscustomobject]$native) 'native-ssh-v2' -Fresh;Assert $true 'native pure vector accepts only fixed identity/pins/boundaries'
  $parsedNative=Clone $native;Assert-V2Proof $parsedNative 'native-ssh-v2' -Fresh;Assert $true 'JSON-parsed UTC DateTime retains its instant in Tehran timezone'
  $parsedNative.at=[DateTimeOffset]::UtcNow.ToOffset([TimeSpan]::FromMinutes(210));Assert-V2Proof $parsedNative 'native-ssh-v2' -Fresh;Assert $true 'DateTimeOffset +03:30 retains the same fresh instant'
  $parsedNative.at=[datetime]::SpecifyKind([datetime]::UtcNow,[DateTimeKind]::Unspecified);Rejected {Assert-V2Proof $parsedNative 'native-ssh-v2' -Fresh} 'unspecified timezone never guessed for fresh native gate'
  $native.bindingSha256='0'*64;Rejected {Assert-V2Proof ([pscustomobject]$native) 'native-ssh-v2'} 'native binding pin cannot be repinned'
  $native.bindingSha256=$pins.binding;$native.at='2020-01-01T00:00:00Z';Rejected {Assert-V2Proof ([pscustomobject]$native) 'native-ssh-v2' -Fresh} 'Capture requires fresh gate; archive Verify is historical'
  $phase='native-exact-binding'
  $bindingBytes=ExactGitBinding
  Assert ($bindingBytes.Length -eq 2351 -and [CheckpointCrypto]::Hash($bindingBytes) -ceq $pins.binding) 'exact Git binding raw length2351/hash7819; no normalization or synthetic replacement'
  $nativeEntries=Clone $m.files
  for($i=0;$i -lt 16;$i++){if($pins.hashes[$i]){$nativeEntries[$i].sha256=$pins.hashes[$i]}}
  $nativeEntries[0].length=[long]2406546295
  $nativeEntries[14].length=$bindingBytes.Length;$nativeEntries[14].sha256=[CheckpointCrypto]::Hash($bindingBytes)
  Assert-V2Entries $nativeEntries 'native-ssh-v2';Assert $true 'native entry guard accepts actual exact Git binding bytes, not only synthetic archive path'
  $x=Clone $nativeEntries;$x[14].length=2394;Rejected {Assert-V2Entries $x 'native-ssh-v2'} 'old incorrect2394 length is rejected with correct unchanged binding hash'
  $x=Clone $nativeEntries;$x[14].length=$bindingBytes.Length+1;Rejected {Assert-V2Entries $x 'native-ssh-v2'} 'native binding length drift rejected even when hash is unchanged'
  $x=Clone $nativeEntries;$x[14].sha256='0'*64;Rejected {Assert-V2Entries $x 'native-ssh-v2'} 'native binding hash drift rejected even when exact length is unchanged'
  $phase='crypto'
  $dest=CopyGood 'manifest-tampered';[IO.File]::AppendAllText((Join-Path $dest 'manifest.json'),' ');Run 'Verify' $dest $false;Assert $true 'manifest HMAC precedes parsing/verification'
  $dest=CopyGood 'cipher-tampered';$path=Join-Path $dest 'v2-15.enc';$bad=[IO.File]::ReadAllBytes($path);$bad[$bad.Length-1]=$bad[$bad.Length-1] -bxor 1;[IO.File]::WriteAllBytes($path,$bad);Run 'Verify' $dest $false;Assert $true 'attestation ciphertext tamper rejected'
  $dest=CopyGood 'resigned-cipher-tamper';[IO.File]::WriteAllBytes((Join-Path $dest 'v2-15.enc'),$bad);$x=Clone $m;$x.files[15].cipherSha256=[CheckpointCrypto]::Hash($bad);Resign $dest $x;Run 'Verify' $dest $false;Assert $true 'inner ciphertext HMAC rejects despite updated outer cipher hash and manifest MAC'
  $dest=CopyGood 'resigned-wrong-plaintext';$x=Clone $m;$x.files[2].sha256='0'*64;$h=$x.files[2].header|ConvertFrom-Json;$h.sha256=$x.files[2].sha256;$x.files[2].header=$h|ConvertTo-Json -Compress
  $path=Join-Path $dest 'v2-02.enc';Remove-Item -LiteralPath $path
  $payload=[IO.File]::ReadAllBytes((Join-Path $fixture 'v2-source-02.bin'));$payload[0]=$payload[0] -bxor 1
  $stream=[IO.MemoryStream]::new($payload,$false)
  try{[CheckpointCrypto]::Encrypt($stream,$path,$x.files[2].header,$payload.Length,[CheckpointCrypto]::Hash($payload),$master)}finally{$stream.Dispose()}
  $x.files[2].cipherLength=([IO.FileInfo]$path).Length;$x.files[2].cipherSha256=[CheckpointCrypto]::FileHash($path);Resign $dest $x;Run 'Verify' $dest $false;Assert $true 'all plaintext length/hash checked after valid file HMAC; signed metadata cannot bypass'
  $dest=CopyGood 'missing-supplement';Remove-Item -LiteralPath (Join-Path $dest 'v2-12.enc');Run 'Verify' $dest $false;Assert $true 'missing external supplement rejected'
  $phase='boundaries';Run 'Verify' $good $false 'LegacyV1';Assert $true 'version1 cannot silently interpret version2'
  Run 'Capture' $good $false;Assert $true 'existing checkpoint evidence preserved'
  $dest=Join-Path $run 'wrong-pin';Run 'Capture' $dest $false 'CorrectedAcl19V2' ('0'*64);Assert (-not (Test-Path -LiteralPath $dest)) 'wrong helper rejected before destination/key creation'
  $badOriginal=$utf8.GetBytes('{"status":"passed","synthetic":true}');[IO.File]::WriteAllBytes((Join-Path $fixture 'v2-source-06.bin'),$badOriginal)
  $dest=Join-Path $run 'projected-passed';Run 'Capture' $dest $false;Assert (-not (Test-Path -LiteralPath $dest)) 'Capture refuses projected original passed before creating key'
  $receipt=@{status='PASS';sourceMode='offline-synthetic-v2';sshExecuted=$false;nativeGateExecuted=$false;databaseAccess=$false;privateBackupDestinationWritten=$false;readiness=$false;releaseAuthorized=$false;checks=$results;testOutput=$run;wrapperSha256=[CheckpointCrypto]::FileHash($wrapper);profileSha256=[CheckpointCrypto]::FileHash($helper);cryptoSha256=[CheckpointCrypto]::FileHash((Join-Path $PSScriptRoot 'CheckpointCrypto.cs'))}
  [IO.File]::WriteAllText((Join-Path $run 'offline-v2-receipt.json'),($receipt|ConvertTo-Json -Depth 20),$utf8)
  [Console]::WriteLine("OFFLINE_V2_PASS checks=$($results.Count) receipt=$run/offline-v2-receipt.json")
}catch{[Console]::Error.WriteLine("OFFLINE_V2_FAILED phase=$phase error=$($_.Exception.Message)");exit 1}
finally{if($master){[Array]::Clear($master,0,$master.Length)}}
