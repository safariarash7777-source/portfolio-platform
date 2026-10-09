import { AuthInvalidJwtError } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as recovery from './password-recovery'

const fragment = '#type=recovery&access_token=synthetic-access&refresh_token=synthetic-refresh'

function fixture(options: { setError?: unknown; userError?: unknown; user?: unknown; throwSet?: boolean } = {}) {
  const calls: string[] = []
  const auth = {
    setSession: async (tokens: { access_token: string; refresh_token: string }) => {
      calls.push('setSession')
      assert.deepEqual(tokens, { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' })
      if (options.throwSet) throw new Error('synthetic transport failure')
      return { error: options.setError ?? null }
    },
    getUser: async () => {
      calls.push('getUser')
      return { data: { user: options.user === undefined ? { id: 'synthetic-existing-owner' } : options.user }, error: options.userError ?? null }
    },
  }
  return { calls, auth, input: {
    fragment,
    clearFragment: () => { calls.push('clearFragment') },
    createAuth: () => { calls.push('createAuth'); return auth },
  } }
}

test('operator recovery clears the fragment before SDK creation and requires verified user', async () => {
  const f = fixture()
  assert.equal(await recovery.initializePasswordRecovery(f.input), 'ready')
  assert.deepEqual(f.calls, ['clearFragment', 'createAuth', 'setSession', 'getUser'])
})

test('existing PKCE callback uses the same client/session without a second token exchange', async () => {
  const f = fixture()
  assert.equal(await recovery.initializePasswordRecovery({ ...f.input, fragment: '' }), 'ready')
  assert.deepEqual(f.calls, ['createAuth', 'getUser'])
})

for (const bad of [
  '#type=magiclink&access_token=x&refresh_token=y',
  '#type=recovery&access_token=x',
  '#type=recovery&refresh_token=y',
  '#type=recovery',
  '#type=recovery&access_token=&refresh_token=y',
  '#type=recovery&access_token=x&access_token=y&refresh_token=z',
  '#type=recovery&type=signup&access_token=x&refresh_token=y',
  '#type=recovery&access_token=x&refresh_token=y&error=access_denied',
  '#error_description=synthetic-error',
]) {
  test(`malformed/non-recovery fragment is cleared and never creates an Auth client: ${bad.split('&')[0]}`, async () => {
    const f = fixture()
    assert.equal(await recovery.initializePasswordRecovery({ ...f.input, fragment: bad }), 'invalid')
    assert.deepEqual(f.calls, ['clearFragment'])
  })
}

test('oversized fragment is rejected before parsing or creating a client', async () => {
  const f = fixture()
  assert.equal(await recovery.initializePasswordRecovery({ ...f.input, fragment: '#' + 'x'.repeat(32769) }), 'invalid')
  assert.deepEqual(f.calls, ['clearFragment'])
})

test('a forged/rejected session cannot make the password form ready', async () => {
  const f = fixture({ setError: { status: 400, code: 'bad_jwt' } })
  assert.equal(await recovery.initializePasswordRecovery(f.input), 'invalid')
  assert.equal(f.calls.includes('getUser'), false)
})

test('the real SDK malformed JWT error is invalid, not a temporary outage', async () => {
  const error = new AuthInvalidJwtError('Synthetic malformed token')
  assert.equal(error.status, 400)
  assert.equal(error.code, 'invalid_jwt')
  const f = fixture({ setError: error })
  assert.equal(await recovery.initializePasswordRecovery(f.input), 'invalid')
  assert.deepEqual(f.calls, ['clearFragment', 'createAuth', 'setSession'])
})
test('transport failure is unavailable, not a claim that the recovery link expired', async () => {
  const f = fixture({ throwSet: true })
  assert.equal(await recovery.initializePasswordRecovery(f.input), 'unavailable')
})

test('getUser validation is required after SDK session restoration', async () => {
  const f = fixture({ userError: { status: 401 }, user: null })
  assert.equal(await recovery.initializePasswordRecovery(f.input), 'invalid')
})

test('getUser outage is separate from invalid credentials', async () => {
  const f = fixture({ userError: { status: 503 }, user: null })
  assert.equal(await recovery.initializePasswordRecovery(f.input), 'unavailable')
})

test('no verified session does not reveal the password form', async () => {
  const f = fixture({ user: null })
  assert.equal(await recovery.initializePasswordRecovery({ ...f.input, fragment: '' }), 'invalid')
})

test('request failure message does not reveal account or provider details', () => {
  const failures = [{ status: 404, message: 'Account missing' }, { status: 500, message: 'SMTP connection refused' }, new Error('transport')]
  const messages = failures.map(recovery.passwordRecoveryRequestError)
  assert.equal(new Set(messages).size, 1)
  assert.ok(messages[0])
  assert.equal(recovery.passwordRecoveryRequestError(null), null)
  assert.notEqual(recovery.passwordRecoveryRequestError({ status: 429 }), messages[0])
})

// Execute the real page handlers with a mocked SDK. No GoTrue request, user or token is created.
const localRequire = createRequire(import.meta.url)
type ElementNode = { type?: unknown; props?: { children?: unknown; onSubmit?: (event: { preventDefault(): void }) => Promise<void> } }
function findForm(node: unknown): ElementNode | undefined {
  if (Array.isArray(node)) {
    for (const child of node) { const found = findForm(child); if (found) return found }
    return undefined
  }
  if (!node || typeof node !== 'object') return undefined
  const element = node as ElementNode
  if (element.type === 'form') return element
  return findForm(element.props?.children)
}

function pageFixture(page: 'forgot-password' | 'reset-password', initial: unknown[], auth: Record<string, unknown>) {
  const states = [...initial]
  let stateIndex = 0
  const navigations: string[] = []
  const pageModule = { exports: {} as { default?: () => unknown } }
  const source = readFileSync(new URL(`../../app/(auth)/${page}/page.tsx`, import.meta.url), 'utf8')
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports: pageModule.exports,
    require: (name: string) => name === 'react' ? {
      useState: (value: unknown) => { const index = stateIndex++; if (states[index] === undefined) states[index] = value; return [states[index], (next: unknown) => { states[index] = next }] },
      useEffect: () => undefined,
      useRef: () => ({ current: null }),
    } : name === '@/lib/supabase/client' ? { createClient: () => ({ auth }) }
      : name === '@/lib/auth/password-recovery' ? recovery
      : name === '@/components/ui/Logo' || name === 'next/link' ? { default: () => null }
      : localRequire(name),
    window: { location: { origin: 'https://site.example', assign: (url: string) => navigations.push(url) } },
    setTimeout: (callback: () => void) => { callback(); return 0 },
  })
  const form = findForm(pageModule.exports.default!())
  return { states, navigations, hasForm: !!form, submit: () => form!.props!.onSubmit!({ preventDefault() {} }) }
}

for (const error of [{ status: 500, message: 'SMTP unavailable' }, { status: 429, message: 'rate limited' }]) {
  test(`real forgot handler keeps the input and does not claim send success on ${error.status}`, async () => {
    const p = pageFixture('forgot-password', ['member@example.test', '', '', false, false], {
      resetPasswordForEmail: async () => ({ error }),
    })
    await p.submit()
    assert.equal(p.states[0], 'member@example.test')
    assert.ok(p.states[2])
    assert.equal(p.states[3], false)
    assert.equal(p.states[4], false)
  })
}

test('real forgot handler preserves the existing PKCE callback destination on accepted request', async () => {
  let destination: string | undefined
  const p = pageFixture('forgot-password', ['member@example.test', '', '', false, false], {
    resetPasswordForEmail: async (_email: string, options: { redirectTo: string }) => { destination = options.redirectTo; return { error: null } },
  })
  await p.submit()
  assert.equal(destination, 'https://site.example/auth/callback?next=/reset-password')
  assert.equal(p.states[4], true)
})

test('real reset handler waits for verified recovery state before updating anything', async () => {
  let updates = 0
  const p = pageFixture('reset-password', ['synthetic-password', 'synthetic-password', {}, '', false, false, false, 'checking'], {
    updateUser: async () => { updates++; return { error: null } },
  })
  assert.equal(p.hasForm, false)
  assert.equal(updates, 0)
})

test('real reset handler validates confirmation before contacting Auth', async () => {
  let updates = 0
  const p = pageFixture('reset-password', ['synthetic-password', 'different-synthetic-password', {}, '', false, false, false, 'ready'], {
    updateUser: async () => { updates++; return { error: null } },
  })
  await p.submit()
  assert.equal(updates, 0)
  assert.ok((p.states[2] as { confirm?: string }).confirm)
})

test('real reset failure keeps owner input and does not navigate or claim success', async () => {
  const p = pageFixture('reset-password', ['synthetic-password', 'synthetic-password', {}, '', false, false, false, 'ready'], {
    updateUser: async () => ({ error: { message: 'synthetic service outage' } }),
  })
  await p.submit()
  assert.equal(p.states[0], 'synthetic-password')
  assert.equal(p.states[1], 'synthetic-password')
  assert.equal(p.states[5], false)
  assert.equal(p.states[4], false)
  assert.deepEqual(p.navigations, [])
})

test('real reset success uses canonical updateUser and full navigation to the existing dashboard', async () => {
  let updateKeys: string[] = []
  const p = pageFixture('reset-password', ['synthetic-password', 'synthetic-password', {}, '', false, false, false, 'ready'], {
    updateUser: async (update: Record<string, unknown>) => { updateKeys = Object.keys(update); return { error: null } },
  })
  await p.submit()
  assert.deepEqual(updateKeys, ['password'])
  assert.equal(p.states[5], true)
  assert.deepEqual(p.navigations, ['/dashboard'])
})
