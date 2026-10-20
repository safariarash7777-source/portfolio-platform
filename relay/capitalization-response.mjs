import { parseCapitalizationJson } from './capitalization-json.mjs';
const EXACT_ENDPOINTS = new Set(['Tsetmc/AllSymbols.php', 'Tsetmc/Symbol.php']);
/** Fixed endpoint strategy: cache and in-flight keys need no parser-mode variant. */
export async function readProviderJson(response, endpoint) {
  if (!EXACT_ENDPOINTS.has(endpoint)) return response.json();
  const text = await response.text();
  const exact = parseCapitalizationJson(text); // validates bounds/grammar before native parse
  const native = JSON.parse(text);
  const annotate = (row, precise) => row && typeof row === 'object' && !Array.isArray(row)
    ? { ...row, marketValueExact: typeof precise?.mv === 'string' ? precise.mv : null }
    : row;
  // The additive field is always reconstructed, never trusted from provider JSON.
  return Array.isArray(native) ? native.map((row, index) => annotate(row, exact[index])) : annotate(native, exact);
}
