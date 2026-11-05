# Source-only preflight. Read pinned code, never initialize a controller/provider.
function Assert-CanonicalHarnessRoot([string]$Value) {
  $ErrorActionPreference = 'Stop'
  if ([string]::IsNullOrWhiteSpace($Value)) { throw 'CANONICAL_ROOT_REQUIRED' }
  $resolved = @(Resolve-Path -LiteralPath $Value -ErrorAction Stop)
  if ($resolved.Count -ne 1 -or $resolved[0].Provider.Name -cne 'FileSystem') { throw 'CANONICAL_ROOT_FILESYSTEM_REQUIRED' }
  $root = $resolved[0].ProviderPath
  $item = Get-Item -LiteralPath $root -Force -ErrorAction Stop
  if ($item -isnot [IO.DirectoryInfo] -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'CANONICAL_ROOT_DIRECTORY_REQUIRED' }
  $pinPath = Join-Path $PSScriptRoot 'canonical-source-pins.json'
  if ((Get-FileHash -LiteralPath $pinPath -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant() -cne '1eca780d20112d5cda3be20734da6dc1297bac8676aac63a79f56881f86aa092') { throw 'CANONICAL_PIN_INDEX_CHANGED' }
  $pins = Get-Content -LiteralPath $pinPath -Raw -ErrorAction Stop | ConvertFrom-Json -AsHashtable -ErrorAction Stop
  if ($pins.version -ne 1 -or $pins.base -cne '918e6840a5ed0f6f69c14737ccbda218346cdb76' -or $pins.files.Count -ne 63) { throw 'CANONICAL_PIN_INDEX_INVALID' }
  foreach ($relative in $pins.files.Keys) {
    if ([IO.Path]::IsPathRooted($relative) -or $relative -match '\\|(^|/)\.\.?(?:/|$)') { throw 'CANONICAL_PIN_PATH_INVALID' }
    $parts = $relative.Split('/')
    $full = $root
    for ($i=0; $i -lt $parts.Count; $i++) {
      $full = Join-Path $full $parts[$i]
      $entry = Get-Item -LiteralPath $full -Force -ErrorAction Stop
      if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
          ($i -lt $parts.Count-1 -and $entry -isnot [IO.DirectoryInfo]) -or
          ($i -eq $parts.Count-1 -and $entry -isnot [IO.FileInfo])) { throw 'CANONICAL_SOURCE_FILE_REQUIRED' }
    }
    if ((Get-FileHash -LiteralPath $full -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant() -cne $pins.files[$relative]) { throw 'CANONICAL_SOURCE_CHANGED' }
  }
  return $root
}
