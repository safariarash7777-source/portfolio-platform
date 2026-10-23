$ErrorActionPreference='Stop'
$stage='setup';$results=[Collections.Generic.List[object]]::new();$master=$null
$script=Join-Path $PSScriptRoot 'backup-checkpoint.ps1'
$pin='2c07a483ef318a3b381e4b832b0de9a5c3fc874a69d131af2f515e475b84c30b'
$stamp='20261020T235959Z'
$run=Join-Path (Join-Path $PSScriptRoot 'test-output') ([guid]::NewGuid().ToString('N'))
$source=Join-Path $run 'source';$good=Join-Path $run 'good'
$names=@('postgres.dump','globals.private.sql','cron.private.json','source-inventory.private','target-inventory.private','comparison.private.json','receipt.json')
function Assert([bool]$Condition,[string]$Name){if(-not $Condition){throw $Name};$results.Add([ordered]@{name=$Name;status='PASS'})}
function RunWrapper([string]$Action,[string]$Destination,[bool]$ExpectedSuccess=$true,[string]$Hash=$pin){
  $psi=[Diagnostics.ProcessStartInfo]::new((Get-Command pwsh).Source);$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
  foreach($arg in @('-NoProfile','-File',$script,'-Action',$Action,'-CheckpointId',$stamp,'-ReviewedHelperSha256',$Hash,'-Destination',$Destination,'-OfflineFixture','-FixtureDirectory',$source)){$psi.ArgumentList.Add($arg)}
  $p=[Diagnostics.Process]::new();$p.StartInfo=$psi
  try{
    [void]$p.Start();$outTask=$p.StandardOutput.ReadToEndAsync();$errTask=$p.StandardError.ReadToEndAsync()
    if(-not $p.WaitForExit(30000)){$p.Kill($true);throw 'wrapper timeout'}
    $stdout=$outTask.GetAwaiter().GetResult();$stderr=$errTask.GetAwaiter().GetResult()
    if($ExpectedSuccess){if($p.ExitCode -ne 0){throw 'unexpected wrapper failure'}}
    else{if($p.ExitCode -eq 0 -or $stderr -cnotmatch '^CHECKPOINT_FAILED stage=[a-z-]+ code=OPERATION_FAILED\r?\n$' -or $stdout.Length){throw 'unsafe rejection'}}
  }finally{$p.Dispose()}
}
function CopyCheckpoint([string]$Name){$dest=Join-Path $run $Name;[IO.Directory]::CreateDirectory($dest)|Out-Null;Set-Acl -LiteralPath $dest -AclObject (Get-Acl -LiteralPath $good);foreach($p in Get-ChildItem -LiteralPath $good -File){[IO.File]::Copy($p.FullName,(Join-Path $dest $p.Name),$false)};return $dest}
try{
  [IO.Directory]::CreateDirectory($source)|Out-Null
  [IO.File]::WriteAllText((Join-Path $source 'fixture-only.txt'),'SYNTHETIC-OFFLINE-ONLY')
  Add-Type -Path (Join-Path $PSScriptRoot 'CheckpointCrypto.cs')
  # Deterministic synthetic bytes cross three 64KiB buffers and AES block boundary.
  $bytes=[byte[]]::new(3*[CheckpointCrypto]::BufferSize+37);for($i=0;$i -lt $bytes.Length;$i++){$bytes[$i]=[byte](($i*31+17)%251)}
  [IO.File]::WriteAllBytes((Join-Path $source 'postgres.dump'),$bytes)
  foreach($name in $names[1..5]){[IO.File]::WriteAllText((Join-Path $source $name),"SYNTHETIC $name")}
  # Also cover a zero-byte source: still emits a full PKCS7 padding block.
  [IO.File]::WriteAllBytes((Join-Path $source 'globals.private.sql'),[byte[]]::new(0))
  $proof=[ordered]@{status='passed';startedAt=$stamp;source='portfolio-stage-db-1';sourceImage='sha256:6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb';comparisonEqual=$true;inventoryLines=@{source=123;target=123};mismatchCounts=@{sourceOnly=0;targetOnly=0};sourceContainerUnchanged=$true;sourceHealthyAfter=$true;targetStopped=$true;network='none';portsPublished=$false;cronEnabledOnTarget=$false;dumpBytes=$bytes.Length;dumpSha256=[CheckpointCrypto]::Hash($bytes)}
  [IO.File]::WriteAllText((Join-Path $source 'receipt.json'),($proof|ConvertTo-Json -Depth 4 -Compress))
  $stage='roundtrip';RunWrapper 'Capture' $good;RunWrapper 'Verify' $good
  $verified=Get-Content -LiteralPath (Join-Path $good 'verified.json') -Raw|ConvertFrom-Json
  Assert ($verified.status -ceq 'PASS' -and $verified.sourceMode -ceq 'offline-synthetic' -and $verified.files -eq 7) 'seven allowlisted files; buffer-crossing and empty plaintext roundtrip'
  Assert (@(Get-ChildItem -LiteralPath $good -File|Where-Object {$_.Name -cin $names}).Count -eq 0) 'checkpoint has no local plaintext source files'
  $manifest=Get-Content -LiteralPath (Join-Path $good 'manifest.json') -Raw|ConvertFrom-Json;$entry=$manifest.files[0]
  $entropy=[Text.Encoding]::UTF8.GetBytes('cashflow-backup-checkpoint.v1')
  $master=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $good 'master.dpapi')),$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $original=[IO.File]::ReadAllBytes((Join-Path $good 'postgres.dump.enc'))
  $headerLength=[BitConverter]::ToInt32($original,8)
  $stage='tampering'
  foreach($case in @(@{name='header';offset=12},@{name='ciphertext';offset=12+$headerLength+16+17},@{name='tag';offset=$original.Length-1})){
    $bad=Join-Path $run ('core-'+$case.name+'.enc');$changed=[byte[]]$original.Clone();$changed[$case.offset]=$changed[$case.offset] -bxor 1;[IO.File]::WriteAllBytes($bad,$changed)
    $rejected=$false;try{[CheckpointCrypto]::Verify($bad,$entry.header,[long]$entry.length,$entry.sha256,$master)}catch{$rejected=$true}
    Assert $rejected ('core authenticates before decrypt: altered '+$case.name)
    $dest=CopyCheckpoint ('wrapper-'+$case.name);[IO.File]::WriteAllBytes((Join-Path $dest 'postgres.dump.enc'),$changed);RunWrapper 'Verify' $dest $false
    Assert $true ('wrapper rejects altered '+$case.name+' with stage-only output')
  }
  $wrong=[Security.Cryptography.RandomNumberGenerator]::GetBytes(64);$rejected=$false
  try{[CheckpointCrypto]::Verify((Join-Path $good 'postgres.dump.enc'),$entry.header,[long]$entry.length,$entry.sha256,$wrong)}catch{$rejected=$true}
  Assert $rejected 'core rejects wrong AES/HMAC master'
  $dest=CopyCheckpoint 'wrong-master';[IO.File]::WriteAllBytes((Join-Path $dest 'master.dpapi'),[Security.Cryptography.ProtectedData]::Protect($wrong,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser));[Array]::Clear($wrong,0,$wrong.Length)
  RunWrapper 'Verify' $dest $false;Assert $true 'wrapper rejects different DPAPI-wrapped master'
  $dest=CopyCheckpoint 'missing-file';Remove-Item -LiteralPath (Join-Path $dest 'cron.private.json.enc');RunWrapper 'Verify' $dest $false;Assert $true 'wrapper rejects missing allowlisted ciphertext'
  $dest=CopyCheckpoint 'manifest-tamper';[IO.File]::AppendAllText((Join-Path $dest 'manifest.json'),' ');RunWrapper 'Verify' $dest $false;Assert $true 'manifest is authenticated'
  $stage='guards';$before=[CheckpointCrypto]::FileHash((Join-Path $good 'master.dpapi'));RunWrapper 'Capture' $good $false
  Assert ([CheckpointCrypto]::FileHash((Join-Path $good 'master.dpapi')) -ceq $before) 'Capture refuses existing destination; preserved evidence'
  RunWrapper 'Capture' (Join-Path $run 'wrong-pin') $false ('0'*64);Assert $true 'unreviewed helper hash rejected before capture'
  $stage='preloaded-type'
  # Invoke the real entry point in a separate process where a same-named class
  # already exists. It must reject before compiling, loading DPAPI or creating output.
  $preloadedDestination=Join-Path $run 'preloaded-type'
  $probe=Join-Path $run 'preloaded-probe.ps1'
  $probeText=@'
param($Wrapper,$Destination,$Source,$Stamp,$Pin)
Add-Type -TypeDefinition 'public static class CheckpointCrypto {}'
& $Wrapper -Action Capture -CheckpointId $Stamp -ReviewedHelperSha256 $Pin -Destination $Destination -OfflineFixture -FixtureDirectory $Source
exit $LASTEXITCODE
'@
  [IO.File]::WriteAllText($probe,$probeText)
  $psi=[Diagnostics.ProcessStartInfo]::new((Get-Command pwsh).Source);$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
  foreach($arg in @('-NoProfile','-File',$probe,$script,$preloadedDestination,$source,$stamp,$pin)){$psi.ArgumentList.Add($arg)}
  $process=[Diagnostics.Process]::new();$process.StartInfo=$psi
  try{
    [void]$process.Start();$stdoutTask=$process.StandardOutput.ReadToEndAsync();$stderrTask=$process.StandardError.ReadToEndAsync()
    if(-not $process.WaitForExit(30000)){$process.Kill($true);throw 'probe timeout'}
    Assert ($process.ExitCode -ne 0 -and $stdoutTask.GetAwaiter().GetResult().Length -eq 0 -and $stderrTask.GetAwaiter().GetResult() -cmatch '^CHECKPOINT_FAILED stage=fresh-process code=OPERATION_FAILED\r?\n$' -and -not (Test-Path -LiteralPath $preloadedDestination)) 'preloaded crypto type rejected before destination/key creation'
  }finally{$process.Dispose()}
  # Invalid restore proof must not create a checkpoint directory.
  $proof.sourceHealthyAfter=$false;[IO.File]::WriteAllText((Join-Path $source 'receipt.json'),($proof|ConvertTo-Json -Depth 4 -Compress))
  $dest=Join-Path $run 'bad-proof';RunWrapper 'Capture' $dest $false;Assert (-not (Test-Path -LiteralPath $dest)) 'source health failure rejected before destination/key creation'
  $receipt=[ordered]@{status='PASS';generatedAt=[datetime]::UtcNow.ToString('o');execution='offline synthetic only';sshExecuted=$false;databaseAccess=$false;providerAccess=$false;privateBackupDestinationWritten=$false;bufferBytes=[CheckpointCrypto]::BufferSize;fixtureBytes=$bytes.Length;checks=$results;testOutput=$run;scriptSha256=[CheckpointCrypto]::FileHash($script);cryptoSha256=[CheckpointCrypto]::FileHash((Join-Path $PSScriptRoot 'CheckpointCrypto.cs'))}
  $path=Join-Path $PSScriptRoot ('offline-receipt-'+[datetime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')+'.json');[IO.File]::WriteAllText($path,($receipt|ConvertTo-Json -Depth 8))
  [Console]::WriteLine("OFFLINE_TESTS_PASS checks=$($results.Count)")
}catch{[Console]::Error.WriteLine("OFFLINE_TESTS_FAILED stage=$stage code=ASSERTION_FAILED");exit 1}
finally{if($master){[Array]::Clear($master,0,$master.Length)}}
