// Node >=18 compatible; no reviver context.source or third-party dependencies.
const CAP_KEYS = new Set(['mv', 'marketValue']);
const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const MAX_TOKEN_LENGTH = 128;
const MAX_DIGITS = 64;
/** Exact nonnegative integral magnitude only. Unit is NOT inferred here. */
export function canonicalCapitalization(token) {
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) return null;
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
  if (!match) return null;
  const fraction = match[2] ?? '';
  const exponentText = match[3] ?? '0';
  if (exponentText.replace(/^[+-]/, '').length > 3) return null;
  const exponent = Number(exponentText);
  if (Math.abs(exponent) > MAX_DIGITS) return null;
  let digits = match[1] + fraction;
  const shift = exponent - fraction.length;
  if (shift < 0) {
    const cut = -shift;
    if (cut >= digits.length) return /^0+$/.test(digits) ? '0' : null;
    if (!/^0+$/.test(digits.slice(-cut))) return null;
    digits = digits.slice(0, -cut);
  } else {
    if (digits.length + shift > MAX_TOKEN_LENGTH) return null;
    digits += '0'.repeat(shift);
  }
  digits = digits.replace(/^0+(?=\d)/, '');
  return digits.length <= MAX_DIGITS ? digits : null;
}
/**
 * Parse untouched provider JSON text, preserving ONLY mv/marketValue as exact
 * decimal strings (or null). Other fields retain native JSON.parse semantics.
 * Never call this on JSON.stringify(alreadyParsedResponse): precision is lost.
 */
export function parseCapitalizationJson(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES) throw new Error('capitalization_json_input_limit');
  // Full grammar validation precedes token rewriting. Sanitized errors contain
  // neither provider payloads nor a substring of a malformed response.
  try { JSON.parse(text); } catch { throw new Error('capitalization_json_invalid'); }
  const pieces = [];
  let cursor = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '"') continue;
    const start = i++;
    while (i < text.length && text[i] !== '"') {
      if (text[i] === '\\') i++;
      i++;
    }
    const end = i + 1;
    const key = JSON.parse(text.slice(start, end));
    let colon = end;
    while (/\s/.test(text[colon] ?? '') && colon < text.length) colon++;
    if (!CAP_KEYS.has(key) || text[colon] !== ':') continue;
    let valueStart = colon + 1;
    while (/\s/.test(text[valueStart] ?? '') && valueStart < text.length) valueStart++;
    if (!/[-0-9]/.test(text[valueStart] ?? '')) continue;
    let valueEnd = valueStart;
    while (valueEnd < text.length && /[-+0-9.eE]/.test(text[valueEnd])) valueEnd++;
    const exact = canonicalCapitalization(text.slice(valueStart, valueEnd));
    pieces.push(text.slice(cursor, valueStart), JSON.stringify(exact));
    cursor = valueEnd;
    i = valueEnd - 1;
  }
  pieces.push(text.slice(cursor));
  return JSON.parse(pieces.join(''), (key, value) => CAP_KEYS.has(key) ? canonicalCapitalization(value) : value);
}
