# Test-only fail-closed instrumentation. Never load caller main or Initialize.
if($PSVersionTable.PSVersion.Major -lt 7){throw 'POWERSHELL_7_REQUIRED_NO_SKIP'}
if(('CheckpointCrypto' -as [type]) -or ('CheckpointSsh' -as [type])){throw 'FRESH_TEST_PROCESS_REQUIRED'}
$script:UnexpectedBoundaryAttempts=0;$script:SentinelProbeDenied=0;$script:WrappedStaticOperations=0;$script:BoundarySelfTest=$false
function Block-ExternalCall([string]$Kind){
  if($script:BoundarySelfTest){$script:SentinelProbeDenied++}else{$script:UnexpectedBoundaryAttempts++}
  throw "OFFLINE_BOUNDARY_DENIED:$Kind"
}
foreach($name in @('ssh','ssh.exe','scp','scp.exe','docker','curl','Start-Process','Invoke-Expression','Invoke-WebRequest','Invoke-RestMethod','Add-Type','Initialize-NA','Initialize-AP','Initialize-NAV3','V3NativeMetadata','V3Packet','NAFreshMetadata','Write-NACipher','PrivateDirectory','WriteNew','APSign','Assert-R2Observation','Assert-NAPostProof','Get-ChildItem','Get-Acl','Set-Acl','BoundedBytes')){
  Set-Item "function:$name" ([scriptblock]::Create("Block-ExternalCall '$name'"))
}
function New-OfflineBlock([string]$Code){
  $t=$null;$e=$null;$ast=[Management.Automation.Language.Parser]::ParseInput($Code,[ref]$t,[ref]$e)
  if($e.Count -or @($ast.EndBlock.Statements).Count -ne 1 -or $ast.EndBlock.Statements[0] -isnot [Management.Automation.Language.FunctionDefinitionAst]){throw 'OFFLINE_FUNCTION_ONLY'}
  foreach($cmd in $ast.FindAll({param($n)$n -is [Management.Automation.Language.CommandAst]},$true)){
    $name=$cmd.GetCommandName()
    if(-not $name -or $name -cnotmatch '^(AP[A-Za-z]+|NA[A-Za-z]+|Assert-[A-Za-z0-9-]+|Get-NAV3Mapping|Get-NAMapping|Get-NAV3PriorState|Get-V3ActiveControllerBinding|Test-V3Bool|Mock[A-Za-z]+|New-MockLock|Block-ExternalCall|Read-APAttempt|Invoke-NAV3BoundAction|Invoke-V3|Open-NAPriorLease|Close-NALease|CheckPath|CheckPrivateDirectory|PrivateDirectory|WriteNew|Write-NACipher|BoundedBytes|Get-Command|Get-ChildItem|Join-Path|Test-Path|Select-Object|Sort-Object|Add-Member|ConvertFrom-Json|ConvertTo-Json)$'){throw "OFFLINE_COMMAND_NOT_ALLOWLISTED:$name"}
  }
  # Dangerous static calls are replaced, not permitted merely because a branch
  # currently seems unreachable. Reaching one fails the entire suite, even when
  # an individual negative test catches the thrown exception.
  $edits=@();$end=-1
  foreach($n in @($ast.FindAll({param($x)$x -is [Management.Automation.Language.InvokeMemberExpressionAst] -and $x.Static},$true)|Sort-Object {$_.Extent.StartOffset})){
    if($n.Extent.StartOffset -lt $end){continue}
    $type=$n.Expression.Extent.Text;$member=$n.Member.Extent.Text
    if(($type -ceq '[IO.MemoryStream]' -and $member -ceq 'new') -or ($type -ceq '[Array]' -and $member -ceq 'Clear')){continue}
    $edits+=@{start=$n.Extent.StartOffset;length=$n.Extent.EndOffset-$n.Extent.StartOffset;text="(Block-ExternalCall 'static-member')"};$end=$n.Extent.EndOffset
  }
  foreach($edit in @($edits|Sort-Object start -Descending)){$Code=$Code.Remove($edit.start,$edit.length).Insert($edit.start,$edit.text);$script:WrappedStaticOperations++}
  return [scriptblock]::Create($Code)
}
# Counterexample: an actual File read in an extracted function must be replaced
# and denied before a filesystem call. This one deliberate probe is separate
# from unexpected test-boundary attempts, which must remain exactly zero.
. (New-OfflineBlock "function Test-UnsafeBoundary { [IO.File]::ReadAllBytes('SYNTHETIC-NONEXISTENT') }")
$script:BoundarySelfTest=$true
try{Test-UnsafeBoundary;throw 'SENTINEL_DID_NOT_REJECT'}catch{if($_.Exception.Message -cne 'OFFLINE_BOUNDARY_DENIED:static-member'){throw}}finally{$script:BoundarySelfTest=$false}
if($script:SentinelProbeDenied -ne 1){throw 'SENTINEL_PROBE_REQUIRED'}
function Complete-OfflineBoundary($Result){
  if($script:UnexpectedBoundaryAttempts -ne 0 -or $script:SentinelProbeDenied -ne 1){throw 'OFFLINE_BOUNDARY_ATTEMPTED_NO_PASS'}
  $Result.externalCalls=0;$Result.unexpectedBoundaryAttempts=$script:UnexpectedBoundaryAttempts;$Result.sentinelProbeDenied=$script:SentinelProbeDenied;$Result.staticOperationsWrapped=$script:WrappedStaticOperations
}
