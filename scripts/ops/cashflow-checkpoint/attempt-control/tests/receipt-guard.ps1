# Pure receipt validation. No transport, filesystem, provider, key or archive I/O.
function Assert-OfflineReceiptKeys([System.Text.Json.JsonElement]$Element) {
  if ($Element.ValueKind -eq [System.Text.Json.JsonValueKind]::Object) {
    # Reject exact, escaped-equivalent and case-ambiguous keys before projection.
    $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($property in $Element.EnumerateObject()) {
      if (-not $seen.Add($property.Name)) { throw 'OFFLINE_RECEIPT_DUPLICATE_KEY' }
      Assert-OfflineReceiptKeys $property.Value
    }
  } elseif ($Element.ValueKind -eq [System.Text.Json.JsonValueKind]::Array) {
    foreach ($value in $Element.EnumerateArray()) { Assert-OfflineReceiptKeys $value }
  }
}
function Assert-OfflineHarnessReceipt([string]$Json, [string]$ExpectedStatus, [int]$ExpectedCount) {
  $ErrorActionPreference = 'Stop'
  $cases = @{
    PASS_SYNTHETIC_EXISTING_ATTEMPT_CONTRACT = 22
    PASS_SYNTHETIC_V3_ATTEMPT_BRANCH = 76
    PASS_SYNTHETIC_MOCK_ATTEMPT_LIFECYCLE = 14
  }
  if ($ExpectedStatus -cnotin @($cases.Keys) -or $cases[$ExpectedStatus] -ne $ExpectedCount) { throw 'OFFLINE_RECEIPT_EXPECTATION_INVALID' }
  if ([string]::IsNullOrWhiteSpace($Json) -or $Json.Length -gt 1048576) { throw 'OFFLINE_RECEIPT_REQUIRED' }
  $document = $null
  try {
    $options = [System.Text.Json.JsonDocumentOptions]::new()
    $options.MaxDepth = 64
    $document = [System.Text.Json.JsonDocument]::Parse($Json,$options)
    $root = $document.RootElement
    # Inspect the raw JSON root; never enumerate/unbox a singleton array.
    if ($root.ValueKind -ne [System.Text.Json.JsonValueKind]::Object) { throw 'OFFLINE_RECEIPT_OBJECT_REQUIRED' }
    Assert-OfflineReceiptKeys $root
    $status = $root.GetProperty('status')
    if ($status.ValueKind -ne [System.Text.Json.JsonValueKind]::String -or $status.GetString() -cne $ExpectedStatus) { throw 'OFFLINE_RECEIPT_STATUS' }
    $counts = @{count=$ExpectedCount; externalCalls=0; unexpectedBoundaryAttempts=0; sentinelProbeDenied=1}
    foreach ($name in $counts.Keys) {
      $element = $root.GetProperty($name)
      [long]$number = 0
      if ($element.ValueKind -ne [System.Text.Json.JsonValueKind]::Number -or
          -not $element.TryGetInt64([ref]$number) -or $number -lt 0 -or $number -gt 9007199254740991 -or
          $number -ne $counts[$name]) { throw 'OFFLINE_RECEIPT_INTEGER_COUNTER' }
    }
    foreach ($name in @('nativeActionsExecuted','cryptoExecuted','keysAccessed','archiveAccessed','externalWrites')) {
      if ($root.GetProperty($name).ValueKind -ne [System.Text.Json.JsonValueKind]::False) { throw 'OFFLINE_RECEIPT_BOUNDARY_FLAG' }
    }
  } catch { throw 'OFFLINE_RECEIPT_REJECTED' }
  finally { if ($null -ne $document) { $document.Dispose() } }
}
