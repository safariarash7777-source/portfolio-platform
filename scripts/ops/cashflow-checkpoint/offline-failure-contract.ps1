# Test-only strict contract for the public error line. Never echo rejected input.
function Test-CheckpointFailureOutput([string]$Text){
  if($Text -cnotmatch '^CHECKPOINT_FAILED stage=[a-z0-9-]+ code=OPERATION_FAILED diagnostic=(\{[^\r\n]*\})\r?\n$'){return $false}
  try{
    $d=$Matches[1]|ConvertFrom-Json
    $keys=@($d.PSObject.Properties.Name|Sort-Object)
    if(($keys -join ',') -cne 'code,expectedLength,hashState,observedLength,phase,sshExitCode,sshTimedOut,version' -or $d.version -ne 1){return $false}
    if($d.code -cnotin [Enum]::GetNames([CheckpointFailureCode]) -or $d.phase -cnotin [Enum]::GetNames([CheckpointFailurePhase]) -or $d.hashState -cnotin [Enum]::GetNames([CheckpointHashState])){return $false}
    foreach($value in @($d.expectedLength,$d.observedLength)){if($null -ne $value -and (($value -isnot [long] -and $value -isnot [int]) -or $value -lt 0)){return $false}}
    if($null -ne $d.sshExitCode -and (($d.sshExitCode -isnot [long] -and $d.sshExitCode -isnot [int]) -or $d.sshExitCode -lt [int]::MinValue -or $d.sshExitCode -gt [int]::MaxValue)){return $false}
    if($null -ne $d.sshTimedOut -and $d.sshTimedOut -isnot [bool]){return $false}
    return $true
  }catch{return $false}
}
