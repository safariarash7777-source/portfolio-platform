# Test-only fault injection on data.sql, after the real dump succeeded.
#   midrestore : a failing statement right after the auth.users COPY block, so
#                roles, schema and auth rows are already applied in the same
#                transaction when it fails.
#   dropnotes  : keep only the first 100 rows of public.notes - valid SQL, an
#                incomplete backup that only the comparison can catch.
#   empty      : zero-byte data.sql.
$a = @($args)
if ($a -notcontains '--data-only' -or -not $env:BK_FAULT) { exit 0 }
$f = $a[[array]::IndexOf($a, '-f') + 1]
$enc = New-Object System.Text.UTF8Encoding($false)
$text = [System.IO.File]::ReadAllText($f, $enc)
$lines = $text -split "`n"
$outLines = New-Object System.Collections.Generic.List[string]
switch ($env:BK_FAULT) {
  'midrestore' {
    $inUsers = $false; $done = $false
    foreach ($l in $lines) {
      $outLines.Add($l)
      if ($l -like 'COPY "auth"."users"*') { $inUsers = $true }
      elseif ($inUsers -and -not $done -and $l -eq '\.') {
        $outLines.Add('INSERT INTO public.injected_fault_table_does_not_exist VALUES (1);')
        $done = $true; $inUsers = $false
      }
    }
    if (-not $done) { Write-Host 'fault.ps1: auth.users COPY block not found'; exit 3 }
  }
  'dropnotes' {
    $inNotes = $false; $kept = 0; $dropped = 0
    foreach ($l in $lines) {
      if ($l -like 'COPY "public"."notes"*') { $inNotes = $true; $outLines.Add($l) }
      elseif ($inNotes -and $l -eq '\.') { $inNotes = $false; $outLines.Add($l) }
      elseif ($inNotes) { if ($kept -lt 100) { $outLines.Add($l); $kept++ } else { $dropped++ } }
      else { $outLines.Add($l) }
    }
    if ($dropped -eq 0) { Write-Host 'fault.ps1: public.notes COPY block not found'; exit 3 }
    Write-Host "fault.ps1: dropped $dropped rows of public.notes"
  }
  'empty' { [System.IO.File]::WriteAllText($f, '', $enc); exit 0 }
  default { Write-Host "fault.ps1: unknown BK_FAULT $env:BK_FAULT"; exit 3 }
}
[System.IO.File]::WriteAllText($f, ($outLines -join "`n"), $enc)
exit 0
