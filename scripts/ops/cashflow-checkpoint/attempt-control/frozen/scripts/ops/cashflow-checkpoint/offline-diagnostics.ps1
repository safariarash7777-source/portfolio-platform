# Synthetic streams and local files only. CheckpointSsh is never instantiated.
$ErrorActionPreference='Stop';$phase='setup';$master=$null
. (Join-Path $PSScriptRoot 'offline-failure-contract.ps1')
$checks=[Collections.Generic.List[object]]::new()
$run=Join-Path (Join-Path $PSScriptRoot 'test-output') ('diagnostics-'+[guid]::NewGuid().ToString('N'))
function Assert([bool]$Value,[string]$Name){if(-not $Value){throw 'assertion'};$checks.Add(@{name=$Name;status='PASS'})}
function Detail([Exception]$Exception){
  $text=SafeFailureDetails $Exception
  Assert (Test-CheckpointFailureOutput ("CHECKPOINT_FAILED stage=r2-capture code=OPERATION_FAILED diagnostic=$text`n")) 'strict fixed diagnostic schema'
  Assert (-not $text.Contains($script:sentinel,[StringComparison]::Ordinal)) 'sentinel not present in public diagnostic'
  return ($text|ConvertFrom-Json)
}
function EncryptFailure([IO.Stream]$InputStream,[long]$Expected,[string]$Hash,[string]$Name){
  $path=Join-Path $run ($Name+'.enc');$failed=$null
  try{[CheckpointCrypto]::Encrypt($InputStream,$path,$script:sentinel,$Expected,$Hash,$master)}catch{$failed=$_.Exception}
  Assert ($null -ne $failed) 'injected stream failure rejected'
  Assert ([IO.File]::Exists($path)) 'partial ciphertext retained'
  Assert (-not [IO.File]::Exists((Join-Path $run 'verified.json'))) 'failure does not create verification receipt'
  return (Detail $failed)
}
try{
  [IO.Directory]::CreateDirectory($run)|Out-Null
  $fixtureType=@'
public sealed class CheckpointSyntheticStream : System.IO.MemoryStream,ICheckpointTransportObservation {
    readonly CheckpointTransportState state;readonly string fault;public int Reads {get;private set;}
    public CheckpointSyntheticStream(byte[] bytes,int? exitCode,bool? timedOut,string fault):base(bytes,false){state=new CheckpointTransportState(exitCode,timedOut);this.fault=fault;}
    public CheckpointTransportState ObserveTransport()=>state;
    public override int Read(byte[] buffer,int offset,int count){Reads++;if(!System.String.IsNullOrEmpty(fault))throw new System.IO.IOException(fault);return base.Read(buffer,offset,count);}
}
'@
  # Compile the exact production text and the synthetic stream in one assembly;
  # no altered production implementation or unresolved in-memory assembly reference.
  Add-Type -TypeDefinition ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'CheckpointCrypto.cs'),[Text.Encoding]::UTF8)+"`n"+$fixtureType)
  # Load only the two actual failure-formatting functions, never execute wrapper operations.
  $tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'backup-checkpoint.ps1'),[ref]$tokens,[ref]$errors)
  Assert ($errors.Count -eq 0) 'wrapper syntax parses'
  foreach($name in @('SafeFailureStage','SafeFailureDetails')){
    $function=$ast.Find({param($node)$node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq $name},$true)
    Assert ($null -ne $function) 'actual formatter function found'
    . ([scriptblock]::Create($function.Extent.Text))
  }
  $script:failureTypesLoaded=$true;$script:sentinel='SYNTHETIC-SECRET-'+[guid]::NewGuid().ToString('N')
  $master=[Security.Cryptography.RandomNumberGenerator]::GetBytes(64)
  $bytes=[byte[]]::new(3*[CheckpointCrypto]::BufferSize+37);for($i=0;$i -lt $bytes.Length;$i++){$bytes[$i]=[byte](($i*31+17)%251)}
  $hash=[CheckpointCrypto]::Hash($bytes)
  $phase='success'
  $source=[CheckpointSyntheticStream]::new($bytes,0,$false,$null)
  $good=Join-Path $run 'good.enc'
  try{[CheckpointCrypto]::Encrypt($source,$good,'synthetic-header',$bytes.Length,$hash,$master)}finally{$source.Dispose()}
  [CheckpointCrypto]::Verify($good,'synthetic-header',$bytes.Length,$hash,$master)
  Assert ($source.Reads -eq 5) 'diagnostics add no stream reads across three buffers plus EOF'
  Assert ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'CheckpointCrypto.cs')).Contains('process.ErrorDataReceived+=(s,e)=>{};')) 'SSH stderr remains discarded'
  $phase='eof'
  $short=[CheckpointSyntheticStream]::new([byte[]]@(1,2,3),255,$false,$null)
  try{$d=EncryptFailure $short 100 ('0'*64) 'short'}finally{$short.Dispose()}
  Assert ($d.code -ceq 'INPUT_EOF_LENGTH_MISMATCH' -and $d.phase -ceq 'ENCRYPT_LENGTH' -and $d.expectedLength -eq 100 -and $d.observedLength -eq 3 -and $d.hashState -ceq 'NOT_CHECKED' -and $d.sshExitCode -eq 255 -and $d.sshTimedOut -ceq $false) 'early EOF and observed nonzero exit remain separate observations'
  $short=[CheckpointSyntheticStream]::new([byte[]]::new(0),$null,$true,$null)
  try{$d=EncryptFailure $short 100 ('0'*64) 'deadline-eof'}finally{$short.Dispose()}
  Assert ($d.code -ceq 'INPUT_EOF_LENGTH_MISMATCH' -and $d.observedLength -eq 0 -and $null -eq $d.sshExitCode -and $d.sshTimedOut -ceq $true) 'deadline observation does not invent an exit code or historical cause'
  $phase='length-hash'
  $long=[IO.MemoryStream]::new([byte[]]@(1,2,3,4),$false)
  try{$d=EncryptFailure $long 3 ('0'*64) 'too-long'}finally{$long.Dispose()}
  Assert ($d.code -ceq 'INPUT_LENGTH_EXCEEDED' -and $d.observedLength -eq 4 -and $d.expectedLength -eq 3) 'long input has a separate bounded length code'
  $same=[IO.MemoryStream]::new([byte[]]@(1,2,3),$false)
  try{$d=EncryptFailure $same 3 ('0'*64) 'hash-mismatch'}finally{$same.Dispose()}
  Assert ($d.code -ceq 'INPUT_SHA256_MISMATCH' -and $d.hashState -ceq 'MISMATCH' -and $d.observedLength -eq 3 -and $null -eq $d.sshTimedOut) 'equal length with wrong SHA256 stays a hash failure without a fabricated transport'
  $phase='secret-io'
  $broken=[CheckpointSyntheticStream]::new([byte[]]::new(0),$null,$false,('password='+$sentinel+' command=synthetic path=C:/'+$sentinel))
  try{$d=EncryptFailure $broken 100 ('0'*64) 'read-io'}finally{$broken.Dispose()}
  Assert ($d.code -ceq 'IO_FAILURE' -and $d.phase -ceq 'ENCRYPT_READ' -and $d.observedLength -eq 0) 'IO exception classified without exporting message or path'
  $phase='ssh-factories'
  $d=Detail ([CheckpointFailures]::SshExit($true,$false,$null))
  Assert ($d.code -ceq 'SSH_EXIT_WAIT_TIMEOUT' -and $null -eq $d.sshExitCode -and $d.sshTimedOut -ceq $false) 'exit wait timeout is distinct from the original deadline'
  $d=Detail ([CheckpointFailures]::SshExit($false,$true,255))
  Assert ($d.code -ceq 'SSH_DEADLINE_TIMEOUT' -and $d.sshTimedOut -ceq $true -and $d.sshExitCode -eq 255) 'deadline and an observed exit are retained independently'
  $d=Detail ([CheckpointFailures]::SshExit($false,$false,255))
  Assert ($d.code -ceq 'SSH_NONZERO_EXIT' -and $d.sshExitCode -eq 255) 'nonzero SSH exit classified by the same factory as Complete'
  $phase='unknown'
  $unknown=[Exception]::new($sentinel);$unknown.Data['code']='INPUT_SHA256_MISMATCH';$unknown.Data['path']=$sentinel
  $d=Detail $unknown
  Assert ($d.code -ceq 'UNATTRIBUTED' -and $d.phase -ceq 'UNKNOWN' -and $null -eq $d.expectedLength -and $null -eq $d.observedLength -and $null -eq $d.sshExitCode -and $null -eq $d.sshTimedOut -and $d.hashState -ceq 'UNKNOWN') 'unknown error data cannot manufacture attribution or observed zero'
  Assert ((SafeFailureStage $sentinel) -ceq 'unattributed' -and (SafeFailureStage 'r2-capture') -ceq 'r2-capture') 'only fixed stages can enter the public prefix'
  $script:failureTypesLoaded=$false;$d=Detail $unknown
  Assert ($d.code -ceq 'UNATTRIBUTED') 'failure before reviewed type load uses static unknown schema'
  $script:failureTypesLoaded=$true
  $phase='preservation'
  $before=[CheckpointCrypto]::FileHash($good);$rejected=$null;$stream=[IO.MemoryStream]::new($bytes,$false)
  try{[CheckpointCrypto]::Encrypt($stream,$good,'synthetic-header',$bytes.Length,$hash,$master)}catch{$rejected=$_.Exception}finally{$stream.Dispose()}
  $d=Detail $rejected
  Assert ($d.code -ceq 'IO_FAILURE' -and $d.phase -ceq 'ENCRYPT_DESTINATION' -and [CheckpointCrypto]::FileHash($good) -ceq $before) 'existing ciphertext is never overwritten'
  $phase='wrapper'
  $psi=[Diagnostics.ProcessStartInfo]::new((Get-Command pwsh).Source);$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
  foreach($arg in @('-NoProfile','-File',(Join-Path $PSScriptRoot 'backup-checkpoint.ps1'),'-Action',$sentinel,'-CheckpointId','20261020T235959Z','-ReviewedHelperSha256',('0'*64))){$psi.ArgumentList.Add($arg)}
  $process=[Diagnostics.Process]::new();$process.StartInfo=$psi
  try{[void]$process.Start();$stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync();if(-not $process.WaitForExit(30000)){$process.Kill($true);throw 'test timeout'};$out=$stdout.GetAwaiter().GetResult();$err=$stderr.GetAwaiter().GetResult()
    Assert ($process.ExitCode -ne 0 -and $out.Length -eq 0 -and (Test-CheckpointFailureOutput $err) -and -not $err.Contains($sentinel,[StringComparison]::Ordinal)) 'real wrapper rejects secret-like invalid parameters with one redacted structured line'
  }finally{$process.Dispose()}
  $receipt=[ordered]@{status='PASS';scope='offline synthetic diagnostics only';sshExecuted=$false;nativeCaptureExecuted=$false;databaseAccess=$false;deadlineOrReadPolicyChanged=$false;historicalFailureCause='UNATTRIBUTED';checks=$checks;cryptoSha256=[CheckpointCrypto]::FileHash((Join-Path $PSScriptRoot 'CheckpointCrypto.cs'));wrapperSha256=[CheckpointCrypto]::FileHash((Join-Path $PSScriptRoot 'backup-checkpoint.ps1'))}
  [IO.File]::WriteAllText((Join-Path $run 'diagnostics-receipt.json'),($receipt|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
  [Console]::WriteLine("OFFLINE_DIAGNOSTICS_PASS checks=$($checks.Count)")
}catch{[Console]::Error.WriteLine("OFFLINE_DIAGNOSTICS_FAILED stage=$phase code=ASSERTION_FAILED line=$($_.InvocationInfo.ScriptLineNumber)");exit 1}
finally{if($master){[Array]::Clear($master,0,$master.Length)}}
