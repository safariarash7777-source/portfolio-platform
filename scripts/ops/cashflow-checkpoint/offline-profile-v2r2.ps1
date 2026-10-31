# Synthetic Windows/DPAPI tests only. No native source, SSH or production pin override.
$ErrorActionPreference='Stop'
$results=[Collections.Generic.List[object]]::new();$master=$null;$phase='setup'
$wrapper=Join-Path $PSScriptRoot 'backup-checkpoint.ps1'
$helper=Join-Path $PSScriptRoot 'checkpoint-profile-v2r2.ps1'
. (Join-Path $PSScriptRoot 'checkpoint-profile-v2.ps1')
. $helper
$pins=Get-V2Pins;$stamp='20261030T215307Z';$utf8=[Text.UTF8Encoding]::new($false,$true)
$run=Join-Path (Join-Path $PSScriptRoot 'test-output') ('v2r2-'+[guid]::NewGuid().ToString('N'))
$fixture=Join-Path $run 'source';$good=Join-Path $run 'good'
function Assert($Value,[string]$Name){if(-not $Value){throw $Name};$results.Add(@{name=$Name;status='PASS'})}
function Rejected([scriptblock]$Code,[string]$Name){$rejected=$false;try{& $Code}catch{$rejected=$true};Assert $rejected $Name}
function Clone($Value){return ($Value|ConvertTo-Json -Depth 30 -Compress|ConvertFrom-Json)}
function ExactGitBinding([string]$Spec='HEAD:docs/ops/p15-webpack-cache-20261030/RELEASE-BINDING-20261031.json') {
  # Binary Git stdout, never the CRLF working-tree file or a text pipeline.
  $psi=[Diagnostics.ProcessStartInfo]::new('git');$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
  $psi.WorkingDirectory=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
  $psi.ArgumentList.Add('show');$psi.ArgumentList.Add($Spec)
  $p=[Diagnostics.Process]::new();$p.StartInfo=$psi;$buffer=[IO.MemoryStream]::new()
  try{
    [void]$p.Start();$stderr=$p.StandardError.ReadToEndAsync();$copy=$p.StandardOutput.BaseStream.CopyToAsync($buffer)
    if(-not $p.WaitForExit(5000)){$p.Kill($true);throw 'git binding timeout'}
    $null=$copy.GetAwaiter().GetResult();$null=$stderr.GetAwaiter().GetResult()
    if($p.ExitCode -ne 0 -or $buffer.Length -gt 32768){throw 'exact Git binding unavailable'}
    return ,$buffer.ToArray()
  }finally{$buffer.Dispose();$p.Dispose()}
}
function Run([string]$Action,[string]$Destination,[bool]$Success=$true,[string]$Format='CorrectedAcl19FailedV2R2',[string]$Pin=$pins.helper){
  $psi=[Diagnostics.ProcessStartInfo]::new((Get-Command pwsh).Source);$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
  foreach($a in @('-NoProfile','-File',$wrapper,'-Action',$Action,'-CheckpointId',$stamp,'-ReviewedHelperSha256',$Pin,'-Destination',$Destination,'-OfflineFixture','-FixtureDirectory',$fixture,'-Profile',$Format)){$psi.ArgumentList.Add($a)}
  $p=[Diagnostics.Process]::new();$p.StartInfo=$psi
  try{
    [void]$p.Start();$out=$p.StandardOutput.ReadToEndAsync();$err=$p.StandardError.ReadToEndAsync()
    if(-not $p.WaitForExit(30000)){$p.Kill($true);throw 'timeout'}
    $stdout=$out.GetAwaiter().GetResult();$stderr=$err.GetAwaiter().GetResult()
    if($Success){if($p.ExitCode -ne 0){throw "wrapper failed $Action $stderr"}}
    elseif($p.ExitCode -eq 0 -or $stdout.Length -or $stderr -cnotmatch '^CHECKPOINT_FAILED stage=[a-z0-9-]+ code=OPERATION_FAILED\r?\n$'){throw 'unsafe error'}
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
function ExactGitPolicy {
  # Binary Git stdout, never the CRLF working-tree file or a text pipeline.
  $psi=[Diagnostics.ProcessStartInfo]::new('git');$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
  $psi.WorkingDirectory=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
  $psi.ArgumentList.Add('show');$psi.ArgumentList.Add(':docs/ops/p15-webpack-cache-20261030/CORRECTED-FAILED-V2R2-POLICY.json')
  $p=[Diagnostics.Process]::new();$p.StartInfo=$psi;$buffer=[IO.MemoryStream]::new()
  try{
    [void]$p.Start();$stderr=$p.StandardError.ReadToEndAsync();$copy=$p.StandardOutput.BaseStream.CopyToAsync($buffer)
    if(-not $p.WaitForExit(5000)){$p.Kill($true);throw 'git binding timeout'}
    $null=$copy.GetAwaiter().GetResult();$null=$stderr.GetAwaiter().GetResult()
    if($p.ExitCode -ne 0 -or $buffer.Length -gt 32768){throw 'exact Git binding unavailable'}
    return ,$buffer.ToArray()
  }finally{$buffer.Dispose();$p.Dispose()}
}
try{
  [IO.Directory]::CreateDirectory($fixture)|Out-Null
  [IO.File]::WriteAllText((Join-Path $fixture 'fixture-only.txt'),'SYNTHETIC-OFFLINE-ONLY',$utf8)
  Add-Type -Path (Join-Path $PSScriptRoot 'CheckpointCrypto.cs')
  $policyRaw=ExactGitPolicy;$policy=Assert-R2Policy $policyRaw
  Assert ($policyRaw.Length -eq 4431 -and [CheckpointCrypto]::Hash($policyRaw) -ceq (Get-R2PolicyPin)) 'exact staged Git policy4431/hash6a1c; no normalization/fixture policy'
  for($i=0;$i -lt 17;$i++){
    if($i -eq 5){continue}
    $bytes=$utf8.GetBytes("SYNTHETIC $i $($policy.roles[$i].role)`r`nRAW-CRLF-PRESERVED`r`n")
    if($i -eq 0){$bytes=[byte[]]::new(3*65536+37);for($j=0;$j -lt $bytes.Length;$j++){$bytes[$j]=[byte](($j*17+5)%251)}}
    if($i -eq 1){$bytes=[byte[]]::new(0)}
    if($i -eq 6){$bytes=$utf8.GetBytes('{"status":"failed","synthetic":true}')}
    if($i -eq 16){$bytes=$utf8.GetBytes('{"status":"PASS_SYNTHETIC_PROFILE_V2R2","synthetic":true,"nativeGateExecuted":false,"originalStatus":"failed","readiness":false,"releaseAuthorized":false}')}
    [IO.File]::WriteAllBytes((Join-Path $fixture ('r2-source-{0:d2}.bin' -f $i)),$bytes)
  }
  $phase='roundtrip';Run 'Capture' $good;Run 'Verify' $good
  $m=Get-Content -LiteralPath (Join-Path $good 'manifest.json') -Raw|ConvertFrom-Json
  $v=Get-Content -LiteralPath (Join-Path $good 'verified.json') -Raw|ConvertFrom-Json
  Assert ($v.status -ceq 'PASS' -and $v.records -eq 17 -and $v.streams -eq 16 -and $v.profileRevision -eq 2 -and $v.sourceMode -ceq 'offline-synthetic-v2r2' -and -not $v.readiness -and -not $v.releaseAuthorized) 'R2 actual wrapper roundtrip17roles/16streams; readiness/release false'
  Assert (@(Get-ChildItem -LiteralPath $good -File).Count -eq 21 -and @($m.artifacts|Where-Object {$_.state -ceq 'present' -and $_.cipherName -cnotmatch '^v2r2-\d{2}\.enc$'}).Count -eq 0) 'flat16ciphertexts; no absent file, plaintext archive or receipt'
  for($i=0;$i -lt 17;$i++){
    if($i -eq 5){continue}
    $bytes=[IO.File]::ReadAllBytes((Join-Path $fixture ('r2-source-{0:d2}.bin' -f $i)))
    if($m.artifacts[$i].length -ne $bytes.Length -or $m.artifacts[$i].sha256 -cne [CheckpointCrypto]::Hash($bytes)){throw 'raw preservation'}
  }
  Assert $true 'all16 plaintext SHA/length retain CRLF/empty/three buffer crossings; absent is not zero bytes'
  Assert ($m.artifacts[5].state -ceq 'absent' -and $null -ceq $m.artifacts[5].length -and $null -ceq $m.artifacts[5].sha256 -and $null -ceq $m.artifacts[5].cipherName -and $null -ceq $m.artifacts[5].observation.neverCreated -and $null -ceq $m.postCaptureAbsence.historicalNotDeleted) 'explicit signed absence before/after with historical unknown null'
  Assert ($m.artifacts[7].role -ceq 'original.pre_comparison' -and $m.artifacts[12].role -ceq 'correction.strict_private' -and $m.artifacts[7].sha256 -cne $m.artifacts[12].sha256) 'raw pre-comparison and strict correction are separate encrypted roles'
  Assert ([CheckpointCrypto]::Hash([Convert]::FromBase64String($m.policyBase64)) -ceq (Get-R2PolicyPin)) 'manifest MAC covers exact independently pinned policy bytes'
  $entropy=$utf8.GetBytes('cashflow-backup-checkpoint.v1')
  $master=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $good 'master.dpapi')),$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $phase='pure-rejections'
  Rejected {Assert-R2Manifest $m $policyRaw $stamp 'native-ssh-v2r2'} 'synthetic cannot claim native mode'
  $x=Clone $m;$x.profileRevision=1;Rejected {Assert-R2Manifest $x $policyRaw $stamp 'offline-synthetic-v2r2'} 'revision dispatch is explicit'
  $x=Clone $m;$x.policySha256='0'*64;Rejected {Assert-R2Manifest $x $policyRaw $stamp 'offline-synthetic-v2r2'} 'policy SHA cannot be repinned'
  $badPolicy=[byte[]]$policyRaw.Clone();$badPolicy[0]=32;Rejected {Assert-R2Policy $badPolicy} 'altered raw policy rejected independently'
  $x=Clone $m;$x.policyBase64=[Convert]::ToBase64String($badPolicy);Rejected {Assert-R2Manifest $x $policyRaw $stamp 'offline-synthetic-v2r2'} 'embedded policy must independently match pin'
  $x=Clone $m;$x.artifacts[5].state='unknown';Rejected {Assert-R2Manifest $x $policyRaw $stamp 'offline-synthetic-v2r2'} 'unknown cannot count as absence'
  $x=Clone $m;$x.artifacts[5].length=0;Rejected {Assert-R2Manifest $x $policyRaw $stamp 'offline-synthetic-v2r2'} 'absent length remains null, never zero'
  $x=Clone $m;$x.artifacts[5].PSObject.Properties.Remove('sha256');Rejected {Assert-R2Manifest $x $policyRaw $stamp 'offline-synthetic-v2r2'} 'missing property is not explicit null'
  $x=Clone $m;$x.artifacts[5].cipherName='v2r2-05.enc';Rejected {Assert-R2Manifest $x $policyRaw $stamp 'offline-synthetic-v2r2'} 'absent has no ciphertext or placeholder alias'
  $x=Clone $m;$x.artifacts[5].observation.neverCreated=$true;Rejected {Assert-R2Manifest $x $policyRaw $stamp 'offline-synthetic-v2r2'} 'current absence cannot claim historical never-created'
  $x=Clone $m;$x.postCaptureAbsence.historicalNotDeleted=$true;Rejected {Assert-R2Manifest $x $policyRaw $stamp 'offline-synthetic-v2r2'} 'post-capture absence cannot assert no historical deletion'
  $x=Clone $m;$x.artifacts[5].observation.method='PERMISSION_DENIED';Rejected {Assert-R2Manifest $x $policyRaw $stamp 'offline-synthetic-v2r2'} 'permission failure cannot count as ENOENT'
  $x=Clone $m;$x.artifacts[5].observation.atUtc=[datetime]::SpecifyKind([datetime]::UtcNow,[DateTimeKind]::Unspecified);Rejected {Assert-R2Manifest $x $policyRaw $stamp 'offline-synthetic-v2r2'} 'observation timestamp never guesses unspecified timezone'
  $x=Clone $m;$x.artifacts[7]=$x.artifacts[12];Rejected {Assert-R2Manifest $x $policyRaw $stamp 'offline-synthetic-v2r2'} 'strict correction cannot replace original pre-comparison'
  $x=Clone $m;$x.artifacts=@($x.artifacts[0..15]);Rejected {Assert-R2Manifest $x $policyRaw $stamp 'offline-synthetic-v2r2'} 'missing present role rejected'
  $x=Clone $m;$x.artifacts[7].state='absent';Rejected {Assert-R2Manifest $x $policyRaw $stamp 'offline-synthetic-v2r2'} 'only original final comparison may be absent'
  $x=Clone $m;$x.artifacts[7].cipherName='../escape.enc';Rejected {Assert-R2Manifest $x $policyRaw $stamp 'offline-synthetic-v2r2'} 'ciphertext path traversal rejected'
  $x=Clone $m;$x.artifacts[7].header=$x.artifacts[7].header.Replace('original.pre_comparison','correction.strict_private');Rejected {Assert-R2Manifest $x $policyRaw $stamp 'offline-synthetic-v2r2'} 'authenticated header binds role identity'
  $x=Clone $m;$x.originalStatus='passed';Rejected {Assert-R2Manifest $x $policyRaw $stamp 'offline-synthetic-v2r2'} 'failed original cannot become passed'
  $x=Clone $m;$x.releaseAuthorized=$true;Rejected {Assert-R2Manifest $x $policyRaw $stamp 'offline-synthetic-v2r2'} 'archive cannot authorize release'
  $x=Clone $m;$x.independentGates.capacity='PASS';Rejected {Assert-R2Manifest $x $policyRaw $stamp 'offline-synthetic-v2r2'} 'capacity remains separately unverified'
  $phase='exact-native-vector'
  $binding=ExactGitBinding
  Assert ($binding.Length -eq 2351 -and [CheckpointCrypto]::Hash($binding) -ceq $policy.parentBindingSha256) 'exact Git binding2351/hash7819 for native pure entry vector'
  $native=Clone $m.artifacts
  for($i=0;$i -lt 17;$i++){
    if($i -eq 5){continue}
    $role=$policy.roles[$i]
    if($null -cne $role.expectedLength){$native[$i].length=$role.expectedLength}
    if($role.expectedSha256){$native[$i].sha256=$role.expectedSha256}
    $native[$i].owner=if($role.origin -ceq 'memory'){$null}else{0}
  }
  $native[15].length=$binding.Length;$native[15].sha256=[CheckpointCrypto]::Hash($binding)
  $native[5].observation.method='OWNED_PARENT_CHILD_ENOENT_SHARED_LOCK'
  Assert-R2Entries $native $policyRaw 'native-ssh-v2r2';Assert $true 'native validator accepts literal Git binding/policy and fixed native role pins; no native execution'
  $x=Clone $native;$x[15].length=2394;Rejected {Assert-R2Entries $x $policyRaw 'native-ssh-v2r2'} 'native rejects old2394 with correct hash7819'
  $x=Clone $native;$x[15].sha256='0'*64;Rejected {Assert-R2Entries $x $policyRaw 'native-ssh-v2r2'} 'native rejects binding hash drift at correct raw length'
  $x=Clone $native;$x[7].sha256=$x[12].sha256;Rejected {Assert-R2Entries $x $policyRaw 'native-ssh-v2r2'} 'native independently pins actual pre-comparison hash2ca'
  $x=Clone $native;$x[5].observation.atUtc='2026-10-30T21:53:07Z';Rejected {Assert-R2Entries $x $policyRaw 'native-ssh-v2r2'} 'new observation cannot be backdated to original producer'
  $x=Clone $native;$x[7].owner=$null;Rejected {Assert-R2Entries $x $policyRaw 'native-ssh-v2r2'} 'unknown owner cannot count as root'
  $phase='offline-native-packet-loader'
  # A private synthetic staging subtree, exact frozen Git artifacts, no native operation.
  $stageRepo=Join-Path $run 'packet-repo';$stageScripts=Join-Path $stageRepo 'scripts/ops/cashflow-checkpoint';$stageOps=Join-Path $stageRepo 'docs/ops/p15-webpack-cache-20261030'
  [IO.Directory]::CreateDirectory($stageScripts)|Out-Null;[IO.Directory]::CreateDirectory($stageOps)|Out-Null
  [IO.File]::WriteAllBytes((Join-Path $stageOps 'RELEASE-BINDING-20261031.json'),$binding)
  [IO.File]::WriteAllBytes((Join-Path $stageOps 'checkpoint-read-gate.py'),(ExactGitBinding 'HEAD:docs/ops/p15-webpack-cache-20261030/checkpoint-read-gate.py'))
  [IO.File]::WriteAllBytes((Join-Path $stageScripts 'corrected-checkpoint-consumer.py'),(ExactGitBinding 'HEAD:scripts/ops/cashflow-checkpoint/corrected-checkpoint-consumer.py'))
  [IO.File]::WriteAllBytes((Join-Path $stageOps 'CORRECTED-FAILED-V2R2-POLICY.json'),$policyRaw)
  foreach($name in @('checkpoint-profile-v2r2-runtime.ps1','checkpoint-profile-v2r2-remote.py')){[IO.File]::Copy((Join-Path $PSScriptRoot $name),(Join-Path $stageScripts $name),$false)}
  $tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($wrapper,[ref]$tokens,[ref]$errors)
  if($errors.Count){throw 'wrapper parse'}
  $loaderFunctions=@($ast.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -cin @('JsonBytes','BoundedBytes','V2Packet')},$false))
  if($loaderFunctions.Count -ne 3){throw 'packet loader functions'}
  $loaderPath=Join-Path $stageScripts 'offline-loader.ps1'
  [IO.File]::WriteAllText($loaderPath,(($loaderFunctions|ForEach-Object {$_.Extent.Text}) -join "`n"),$utf8)
  . $loaderPath
  . (Join-Path $stageScripts 'checkpoint-profile-v2r2-runtime.ps1')
  $packetOutput=@(R2Packet $policyRaw)
  Assert ($packetOutput.Count -eq 1 -and $packetOutput[0] -is [hashtable]) 'actual R2Packet emits only packet, no task/unwanted success-stream output'
  $packet=$packetOutput[0];$packetJson=$utf8.GetString($packet.packet)|ConvertFrom-Json
  Assert ([CheckpointCrypto]::Hash([Convert]::FromBase64String($packetJson.binding)) -ceq $pins.binding -and [CheckpointCrypto]::Hash([Convert]::FromBase64String($packetJson.policy)) -ceq (Get-R2PolicyPin) -and [CheckpointCrypto]::Hash($packet.binding) -ceq $pins.binding) 'actual native packet binds exact Git policy/binding and frozen consumer/gate'
  $generated=R2RemoteScript $packet 'metadata'
  $compilePath=Join-Path $run 'generated-remote-metadata.py';[IO.File]::WriteAllText($compilePath,$generated,$utf8)
  & (Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe') -c 'import ast,sys; ast.parse(open(sys.argv[1],encoding="utf-8").read())' $compilePath
  Assert ($LASTEXITCODE -eq 0 -and $generated -cmatch 'module.run\(json.loads\(PACKET\),MODE,INDEX,LENGTH,HASH\)') 'actual generated metadata Python parses without execution, SSH or full gate'
  Rejected {R2RemoteScript $packet 'file' 5 0 ('0'*64)} 'actual remote builder refuses absent stream index'
  Rejected {R2Packet $badPolicy} 'actual native packet rejects altered policy before SSH/key'
  [IO.File]::WriteAllBytes((Join-Path $stageOps 'RELEASE-BINDING-20261031.json'),$utf8.GetBytes('changed binding'))
  Rejected {R2Packet $policyRaw} 'actual native packet rejects binding drift before SSH/key'
  $phase='authenticated-rejections'
  $dest=CopyGood 'manifest-tampered';[IO.File]::AppendAllText((Join-Path $dest 'manifest.json'),' ');Run 'Verify' $dest $false;Assert $true 'manifest MAC checked before parse'
  $dest=CopyGood 'resigned-absence';$x=Clone $m;$x.artifacts[5].sha256='0'*64;Resign $dest $x;Run 'Verify' $dest $false;Assert $true 'even signed descriptor cannot weaken explicit absent contract'
  $dest=CopyGood 'cipher-tampered';$path=Join-Path $dest 'v2r2-15.enc';$bad=[IO.File]::ReadAllBytes($path);$bad[$bad.Length-1]=$bad[$bad.Length-1] -bxor 1;[IO.File]::WriteAllBytes($path,$bad);Run 'Verify' $dest $false;Assert $true 'last attestation ciphertext tamper rejected'
  $dest=CopyGood 'resigned-cipher-tamper';[IO.File]::WriteAllBytes((Join-Path $dest 'v2r2-15.enc'),$bad);$x=Clone $m;$x.artifacts[16].cipherSha256=[CheckpointCrypto]::Hash($bad);Resign $dest $x;Run 'Verify' $dest $false;Assert $true 'inner ciphertext MAC remains enforced after valid outer manifest MAC/hash'
  $dest=CopyGood 'resigned-wrong-plaintext';$x=Clone $m;$x.artifacts[2].sha256='0'*64;$h=$x.artifacts[2].header|ConvertFrom-Json;$h.sha256=$x.artifacts[2].sha256;$x.artifacts[2].header=$h|ConvertTo-Json -Compress
  $path=Join-Path $dest 'v2r2-02.enc';Remove-Item -LiteralPath $path
  $payload=[IO.File]::ReadAllBytes((Join-Path $fixture 'r2-source-02.bin'));$payload[0]=$payload[0] -bxor 1
  $stream=[IO.MemoryStream]::new($payload,$false)
  try{[CheckpointCrypto]::Encrypt($stream,$path,$x.artifacts[2].header,$payload.Length,[CheckpointCrypto]::Hash($payload),$master)}finally{$stream.Dispose()}
  $x.artifacts[2].cipherLength=([IO.FileInfo]$path).Length;$x.artifacts[2].cipherSha256=[CheckpointCrypto]::FileHash($path);Resign $dest $x;Run 'Verify' $dest $false;Assert $true 'complete plaintext SHA checked even with valid file/manifest MAC'
  $dest=CopyGood 'missing-before';Remove-Item -LiteralPath (Join-Path $dest 'v2r2-06.enc');Run 'Verify' $dest $false;Assert $true 'missing encrypted original pre-comparison rejected'
  $phase='dispatch'
  Run 'Verify' $good $false 'LegacyV1';Assert $true 'LegacyV1 cannot interpret R2 archive'
  Run 'Verify' $good $false 'CorrectedAcl19V2';Assert $true 'strict V2 cannot interpret R2 archive'
  Run 'Capture' $good $false;Assert $true 'existing evidence never overwritten'
  $dest=Join-Path $run 'wrong-helper';Run 'Capture' $dest $false 'CorrectedAcl19FailedV2R2' ('0'*64);Assert (-not (Test-Path -LiteralPath $dest)) 'wrong helper rejected before key/destination creation'
  $path=Join-Path $fixture 'r2-source-05.bin';[IO.File]::WriteAllBytes($path,[byte[]]::new(0))
  $dest=Join-Path $run 'final-appeared';Run 'Capture' $dest $false;Assert (-not (Test-Path -LiteralPath $dest)) 'even zero-byte final appearance requires reconciliation before key'
  Remove-Item -LiteralPath $path
  [IO.File]::WriteAllBytes((Join-Path $fixture 'r2-source-06.bin'),$utf8.GetBytes('{"status":"passed","synthetic":true}'))
  $dest=Join-Path $run 'projected-passed';Run 'Capture' $dest $false;Assert (-not (Test-Path -LiteralPath $dest)) 'original passed refused before key/destination creation'
  $receipt=@{status='PASS';sourceMode='offline-synthetic-v2r2';sshExecuted=$false;nativeGateExecuted=$false;databaseAccess=$false;privateBackupDestinationWritten=$false;readiness=$false;releaseAuthorized=$false;checks=$results;testOutput=$run;policySha256=(Get-R2PolicyPin);wrapperSha256=[CheckpointCrypto]::FileHash($wrapper);profileSha256=[CheckpointCrypto]::FileHash($helper);runtimeSha256=[CheckpointCrypto]::FileHash((Join-Path $PSScriptRoot 'checkpoint-profile-v2r2-runtime.ps1'));cryptoSha256=[CheckpointCrypto]::FileHash((Join-Path $PSScriptRoot 'CheckpointCrypto.cs'))}
  [IO.File]::WriteAllText((Join-Path $run 'offline-v2r2-receipt.json'),($receipt|ConvertTo-Json -Depth 20),$utf8)
  [Console]::WriteLine("OFFLINE_V2R2_PASS checks=$($results.Count) receipt=$run/offline-v2r2-receipt.json")
}catch{[Console]::Error.WriteLine("OFFLINE_V2R2_FAILED phase=$phase error=$($_.Exception.Message)");exit 1}
finally{if($master){[Array]::Clear($master,0,$master.Length)}}
