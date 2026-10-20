import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalCapitalization, parseCapitalizationJson } from './capitalization-json.mjs';
test('unsafe numeric lexeme and quoted amount survive exactly, other fields keep native types', () => {
  const result = parseCapitalizationJson('{"mv":90071992547409931,"marketValue":"90071992547409933","price":12.5,"unit":"unknown"}');
  assert.equal(result.mv, '90071992547409931');
  assert.equal(result.marketValue, '90071992547409933');
  assert.equal(result.price, 12.5); assert.equal(result.unit, 'unknown');
  assert.notEqual(String(JSON.parse('{"mv":90071992547409931}').mv), result.mv);
});
test('null, negative, fractional, nonnumeric and unit-bearing values never become invented amounts', () => {
  for (const value of ['null', '-1', '-0', '1.01', '1e-2', 'true', '{}', '[]', '"100 IRR"', '"1,000"']) {
    assert.equal(parseCapitalizationJson(`{"mv":${value}}`).mv, null, value);
  }
  assert.equal(parseCapitalizationJson('{"mv":0}').mv, '0');
});
test('scientific and decimal integer forms canonicalize without floating arithmetic', () => {
  for (const [input, expected] of [['9.0071992547409931e16', '90071992547409931'], ['100e-2', '1'], ['1.000', '1'], ['0.0e10', '0'], ['2e+3', '2000']]) {
    assert.equal(parseCapitalizationJson(`{"mv":${input}}`).mv, expected);
    assert.equal(canonicalCapitalization(input), expected);
  }
});
test('nested objects, arrays and escaped property names are handled; string contents are untouched', () => {
  // Build a normal valid escaped string separately to keep the fixture readable.
  const text = '{"rows":[{"m\\u0076":90071992547409931},{"marketValue":22}],"label":' + JSON.stringify('escaped "mv":999 and slash \\') + '}';
  const parsed = parseCapitalizationJson(text);
  assert.equal(parsed.rows[0].mv, '90071992547409931');
  assert.equal(parsed.rows[1].marketValue, '22');
  assert.equal(parsed.label, 'escaped "mv":999 and slash \\');
});
test('duplicate key policy matches native last-key-wins including null', () => {
  assert.equal(parseCapitalizationJson('{"mv":90071992547409931,"mv":null}').mv, null);
  assert.equal(parseCapitalizationJson('{"mv":null,"mv":90071992547409933}').mv, '90071992547409933');
});
test('invalid JSON and oversized input reject without echoing payload', () => {
  for (const text of ['{"mv":01}', '{"mv":1e}', '{"mv":NaN}', '{"mv":2,}', 'private-secret-not-json']) {
    assert.throws(() => parseCapitalizationJson(text), { message: 'capitalization_json_invalid' });
  }
  assert.throws(() => parseCapitalizationJson(' '.repeat(8 * 1024 * 1024 + 1)), { message: 'capitalization_json_input_limit' });
});
test('token and exponent limits abstain without unbounded expansion', () => {
  for (const token of ['1e99999999', '1e65', '1e-65', '1'.repeat(129), '1'.repeat(65)]) assert.equal(canonicalCapitalization(token), null);
  assert.equal(canonicalCapitalization('1'.repeat(64)), '1'.repeat(64));
});
