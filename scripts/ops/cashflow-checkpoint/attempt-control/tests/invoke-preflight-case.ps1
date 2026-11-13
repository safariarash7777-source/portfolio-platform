param([Parameter(Mandatory)][string]$Harness,[AllowEmptyString()][string]$Root)
# Deliberately reproduce a fresh caller using Continue, not a helpful parent Stop.
$ErrorActionPreference='Continue'
try { & $Harness -CanonicalRoot $Root; exit 0 } catch { exit 1 }
