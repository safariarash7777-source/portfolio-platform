import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { isPrivateBotConversation } from './private-chat';

test('only the sender’s own private chat is eligible for personal responses', () => {
  assert.equal(isPrivateBotConversation({ from: { id: 42 }, chat: { id: 42, type: 'private' } }), true);
  for (const message of [undefined, {}, { from: { id: 42 }, chat: { id: -42, type: 'group' } },
    { from: { id: 42 }, chat: { id: 42, type: 'supergroup' } },
    { from: { id: 42 }, chat: { id: 43, type: 'private' } },
    { from: { id: 42 }, chat: { id: 42 } },
    { from: { id: 42, is_bot: true }, chat: { id: 42, type: 'private' } },
    { from: { id: 0 }, chat: { id: 0, type: 'private' } },
    { from: { id: NaN }, chat: { id: NaN, type: 'private' } },
    { from: { id: 1.5 }, chat: { id: 1.5, type: 'private' } },
    { from: { id: Number.MAX_SAFE_INTEGER + 1 }, chat: { id: Number.MAX_SAFE_INTEGER + 1, type: 'private' } },
  ]) assert.equal(isPrivateBotConversation(message), false);
});

// Execute the actual POST handler with synthetic I/O: no Telegram or database access.
function harness(source = readFileSync(new URL('../../app/api/telegram/webhook/route.ts', import.meta.url), 'utf8')) {
  let databaseClients = 0;
  const sent: number[] = [];
  const mod = { exports: {} as { POST: (req: unknown) => Promise<{ status: number }> } };
  const imports: Record<string, unknown> = {
    'next/server': { NextResponse: { json: (_body: unknown, options?: { status: number }) => ({ status: options?.status ?? 200 }) } },
    '@/lib/telegram/private-chat': { isPrivateBotConversation },
    '@/lib/supabase/admin': { createAdminClient: () => { databaseClients++; return {}; } },
    '@/lib/telegram': { sendMessage: async (chatId: number) => { sent.push(chatId); } },
    '@/lib/markdown': {}, '@/lib/format': {}, '@/lib/content-hub': {},
  };
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports: mod.exports,
    require: (name: string) => {
      if (!(name in imports)) throw new Error(`Unexpected dependency: ${name}`);
      return imports[name];
    },
    process: { env: { TELEGRAM_WEBHOOK_SECRET: 'dummy-test-only' } },
    console: { error: () => undefined },
  });
  return {
    invoke: (body: unknown, secret = 'dummy-test-only') => mod.exports.POST({
      headers: { get: () => secret }, json: async () => body,
    }),
    databaseClients: () => databaseClients,
    sent,
  };
}

for (const type of ['group', 'supergroup', 'channel', undefined]) {
  for (const text of ['/portfolio', '/announcements', '123456', '/help']) {
    test(`${type ?? 'missing chat type'} ${text}: no database read, code redemption or reply`, async () => {
      const h = harness();
      assert.equal((await h.invoke({ message: { text, from: { id: 42 }, chat: { id: -99, type } } })).status, 200);
      assert.equal(h.databaseClients(), 0);
      assert.deepEqual(h.sent, []);
    });
  }
}

test('a valid private help request still reaches the existing handler', async () => {
  const h = harness();
  assert.equal((await h.invoke({ message: { text: '/help', from: { id: 42 }, chat: { id: 42, type: 'private' } } })).status, 200);
  assert.equal(h.databaseClients(), 1);
  assert.deepEqual(h.sent, [42]);
});

test('a mismatched private recipient cannot receive the sender’s data', async () => {
  const h = harness();
  await h.invoke({ message: { text: '/portfolio', from: { id: 42 }, chat: { id: 43, type: 'private' } } });
  assert.equal(h.databaseClients(), 0);
  assert.deepEqual(h.sent, []);
});

test('webhook authentication still runs before message processing', async () => {
  const h = harness();
  assert.equal((await h.invoke({ message: { text: '/help', from: { id: 42 }, chat: { id: 42, type: 'private' } } }, 'wrong')).status, 401);
  assert.equal(h.databaseClients(), 0);
  assert.deepEqual(h.sent, []);
});

test('public channel updates still enter the separate channel handler', async () => {
  const h = harness();
  await h.invoke({ channel_post: { message_id: 7, chat: { username: 'arashsafariiiiiiii' }, text: 'synthetic' } });
  // Stub stops at creation; the unchanged channel handler was reached, not suppressed.
  assert.equal(h.databaseClients(), 1);
  assert.deepEqual(h.sent, []);
});

test('negative control: removing the private-chat gate reaches personal handlers from a group', async () => {
  const source = readFileSync(new URL('../../app/api/telegram/webhook/route.ts', import.meta.url), 'utf8');
  const mutated = source.replace('if (!isPrivateBotConversation(msg))', 'if (false)');
  assert.notEqual(mutated, source);
  const h = harness(mutated);
  await h.invoke({ message: { text: '/help', from: { id: 42 }, chat: { id: -99, type: 'group' } } });
  assert.equal(h.databaseClients(), 1);
  assert.deepEqual(h.sent, [-99]);
});
