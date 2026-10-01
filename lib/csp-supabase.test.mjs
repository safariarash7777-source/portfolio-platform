import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { supabaseConnectSrc } = createRequire(import.meta.url)('./csp-supabase.js');

test('self-hosted Auth allows only its configured HTTPS origin', () => {
  assert.equal(supabaseConnectSrc('https://62.60.191.24/liara-preview'),
    'https://*.supabase.co wss://*.supabase.co https://62.60.191.24');
  for (const url of ['', 'not a URL', 'http://62.60.191.24', 'javascript:alert(1)', 'https://test.supabase.co']) {
    assert.equal(supabaseConnectSrc(url), 'https://*.supabase.co wss://*.supabase.co');
  }
});
