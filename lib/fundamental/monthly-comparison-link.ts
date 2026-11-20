/** Two public issuer symbols in a shareable monthly sales comparison. */
export function monthlyComparisonSymbols(raw: string | null | undefined): string[] {
  if (!raw || raw.length > 81) return [];
  const symbols = raw.split(",");
  if (symbols.length > 2 || new Set(symbols).size !== symbols.length) return [];
  return symbols.every(s => /^[\p{L}\p{N}‌ -]{1,40}$/u.test(s) && s === s.trim()) ? symbols : [];
}
