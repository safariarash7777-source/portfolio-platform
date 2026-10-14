/** Static security-contract checks only; not PostgreSQL grammar or DB acceptance. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('./proposed-exact-webinar.sql', import.meta.url), 'utf8');
const executable = sql.replace(/--[^\n]*/g, '');
const functions = new Map([...executable.matchAll(
  /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.(\w+)\s*\(([\s\S]*?)\)\s*([\s\S]*?)\$m2\$([\s\S]*?)\$m2\$;/gi,
)].map((match) => [match[1], { parameters: match[2], attributes: match[3], body: match[4] }]));
const body = name => {
  assert.ok(functions.has(name), `missing function ${name}`);
  return functions.get(name).body;
};

test('proposal is explicit, transaction bounded, and does not change global entitlements/Auth', () => {
  assert.match(sql, /^-- PROPOSAL ONLY/);
  assert.equal((executable.match(/^BEGIN;/gm) ?? []).length, 1);
  assert.equal((executable.match(/^COMMIT;/gm) ?? []).length, 1);
  assert.doesNotMatch(executable, /\b(?:entitlements|profiles|auth\.users|ALTER\s+ROLE|CREATE\s+ROLE|DROP\s+TABLE|DELETE\s+FROM|TRUNCATE)\b/i);
  assert.doesNotMatch(executable, /interval\s+'[^']*(?:month|year|day)'/i);
  assert.match(executable, /ALTER COLUMN price_toman DROP DEFAULT/);
  assert.match(executable, /ADD COLUMN access_enabled boolean NOT NULL DEFAULT false/);
  assert.match(executable, /ADD COLUMN access_qualified boolean NOT NULL DEFAULT false/);
});

test('public read and member insert bypasses close; admin policies remain', () => {
  assert.match(executable, /DROP POLICY IF EXISTS webinars_public_read ON public\.webinars/);
  assert.match(executable, /DROP POLICY IF EXISTS wr_user_insert ON public\.webinar_registrations/);
  assert.doesNotMatch(executable, /DROP POLICY[^;]*(?:webinars_admin_all|wr_admin_all)/);
  const metadata = body('list_public_webinars');
  assert.doesNotMatch(metadata, /platform_url|invite_link|user_id|SELECT\s+(?:\w+\.)?\*/i);
  assert.match(metadata, /jsonb_build_object\(/);
  assert.match(metadata, /'registered_count'/);
  assert.match(metadata, /r\.payment_status IN \('paid','free'\)/);
  assert.doesNotMatch(metadata, /r\.access_qualified/);
});

test('disabled or malformed windows deny and registered windows/price cannot silently change', () => {
  assert.match(executable, /NOT access_enabled OR[\s\S]*?isfinite\(access_starts_at\)[\s\S]*?access_starts_at < access_ends_at/);
  const policy = body('m2_webinar_policy_guard');
  for (const field of ['price_toman', 'access_starts_at', 'access_ends_at']) {
    assert.match(policy, new RegExp(`NEW\\.${field} IS DISTINCT FROM OLD\\.${field}`));
  }
  assert.match(policy, /EXISTS \(SELECT 1 FROM public\.webinar_registrations/);
  assert.doesNotMatch(policy, /NEW\.access_enabled IS DISTINCT FROM OLD\.access_enabled/);
  const access = body('webinar_access');
  assert.match(access, /NOT w\.access_enabled OR w\.status NOT IN \('published','live','ended'\)/);
  assert.match(access, /now\(\)<w\.access_starts_at OR now\(\)>=w\.access_ends_at/);
});

test('free qualification and registration owner come only from canonical scoped registration', () => {
  const registration = body('register_for_webinar');
  assert.match(registration, /owner_id uuid := auth\.uid\(\)/);
  assert.match(registration, /WHERE webinar_id=w\.id AND user_id=owner_id FOR UPDATE/);
  assert.match(registration, /CASE WHEN w\.price_toman=0 THEN 'free' ELSE 'pending' END,w\.price_toman=0/);
  for (const field of ['registration_id', 'webinar_id', 'payment_status', 'needs_payment', 'already_registered']) {
    assert.equal((registration.match(new RegExp(`'${field}'`, 'g')) ?? []).length >= 2, true, `${field} missing on replay`);
  }
  const access = body('webinar_access');
  assert.match(access, /WHERE webinar_id=w\.id AND user_id=owner_id/);
  assert.match(access, /NOT reg\.access_qualified/);
  assert.match(access, /w\.price_toman<>0 OR reg\.payment_id IS NOT NULL/);
});

test('paid access requires exact qualified registration plus paid ledger and ready attempt', () => {
  const access = body('webinar_access');
  for (const invariant of [
    /pay\.user_id IS DISTINCT FROM owner_id/, /pay\.amount IS DISTINCT FROM w\.price_toman/,
    /pay\.status<>'paid'/, /pay\.verified_at IS NULL/, /pay\.ref_id IS NULL/,
    /attempt\.state<>'ready'/, /attempt\.webinar_id IS DISTINCT FROM w\.id/,
    /attempt\.payment_id IS DISTINCT FROM pay\.id/, /attempt\.authority IS DISTINCT FROM pay\.authority/,
  ]) assert.match(access, invariant);
  assert.match(access, /RETURN jsonb_build_object\('allowed',true,'webinar_id',w\.id,'user_id',owner_id/);
});

test('attempt reservation is durable and has no automatic requesting reset', () => {
  assert.match(executable, /registration_id uuid PRIMARY KEY REFERENCES public\.webinar_registrations\(id\) ON DELETE RESTRICT/);
  assert.match(executable, /ALTER TABLE public\.webinar_payment_attempts ENABLE ROW LEVEL SECURITY/);
  assert.match(executable, /REVOKE ALL ON TABLE public\.webinar_payment_attempts FROM PUBLIC,anon,authenticated,service_role/);
  assert.doesNotMatch(executable, /GRANT [^;]*ON TABLE public\.webinar_payment_attempts TO (?:anon|authenticated)/);
  assert.doesNotMatch(executable, /UPDATE public\.webinar_payment_attempts SET state='requesting'/);
  const prepare = body('prepare_webinar_payment');
  assert.ok(prepare.indexOf('IF FOUND THEN') < prepare.indexOf('INSERT INTO public.webinar_payment_attempts'));
  assert.match(prepare, /'started',false/);
  assert.match(prepare, /'started',true/);
  const unknown = body('mark_webinar_payment_unknown');
  assert.match(unknown, /IF attempt\.state='requesting' THEN[\s\S]*?state='unknown'/);
  assert.doesNotMatch(unknown, /state='ready'|payment_id\s*=|authority\s*=|payment_url\s*=/);
});

test('current policy gates every ready resume before reading or returning an old URL', () => {
  const prepare = body('prepare_webinar_payment');
  const policyGate = prepare.indexOf('IF NOT w.access_enabled');
  const priorAttempt = prepare.indexOf('SELECT * INTO attempt FROM public.webinar_payment_attempts');
  assert.ok(policyGate >= 0 && policyGate < priorAttempt, 'policy gate must precede ready/requesting/unknown resume');
  const gate = prepare.slice(policyGate, priorAttempt);
  for (const invariant of [
    /w\.access_starts_at IS NULL OR w\.access_ends_at IS NULL/,
    /NOT isfinite\(w\.access_starts_at\) OR NOT isfinite\(w\.access_ends_at\)/,
    /w\.access_starts_at>=w\.access_ends_at/,
    /clock_timestamp\(\)>=w\.access_ends_at/,
    /NOT w\.registration_open OR w\.status NOT IN \('published','live'\)/,
  ]) assert.match(gate, invariant);
  assert.doesNotMatch(gate, /clock_timestamp\(\)<w\.access_starts_at/);
});

test('ready resume releases only the exact still-pending ledger and never retries a rejected payment', () => {
  const prepare = body('prepare_webinar_payment');
  const priorAttempt = prepare.indexOf('SELECT * INTO attempt FROM public.webinar_payment_attempts');
  const ready = prepare.indexOf("IF attempt.state='ready' THEN", priorAttempt);
  const ledger = prepare.indexOf('SELECT * INTO pay FROM public.payments', ready);
  const release = prepare.indexOf("'payment_url'", ledger);
  assert.ok(ready > priorAttempt && ledger > ready && release > ledger, 'resume must read bound canonical ledger before URL release');
  const bound = prepare.slice(ready, release);
  for (const invariant of [
    /pay\.user_id IS DISTINCT FROM owner_id/, /pay\.amount IS DISTINCT FROM attempt\.amount/,
    /pay\.authority IS DISTINCT FROM attempt\.authority/, /reg\.payment_id IS DISTINCT FROM pay\.id/,
    /pay\.status NOT IN \('pending','paid','failed'\)/,
  ]) assert.match(bound, invariant);
  assert.match(prepare, /release_allowed := pay\.status='pending' AND clock_timestamp\(\)<w\.access_ends_at/);
  assert.match(prepare, /'payment_url',CASE WHEN release_allowed THEN attempt\.payment_url ELSE NULL END/);
  assert.match(prepare, /'release_allowed',release_allowed/);
  assert.doesNotMatch(prepare, /UPDATE public\.payments|UPDATE public\.webinar_payment_attempts/);
});

test('attach retains known authority atomically but withholds its URL after manager closure', () => {
  const attach = body('attach_webinar_payment');
  const writes = attach.indexOf('INSERT INTO public.payments(user_id,amount,authority,status)');
  const releaseGate = attach.indexOf('release_allowed :=');
  assert.ok(writes >= 0 && releaseGate > writes, 'known payment must be retained before release decision');
  for (const invariant of [
    /w\.access_enabled AND w\.registration_open/, /w\.status IN \('published','live'\)/,
    /isfinite\(w\.access_starts_at\) AND isfinite\(w\.access_ends_at\)/,
    /w\.access_starts_at<w\.access_ends_at/, /clock_timestamp\(\)<w\.access_ends_at/,
    /'payment_url',CASE WHEN release_allowed THEN p_payment_url ELSE NULL END/,
    /'release_allowed',release_allowed/,
  ]) assert.match(attach, invariant);
  assert.doesNotMatch(attach, /RAISE[^;]*policy is closed/);
});

test('free capacity retains source count; paid capacity stays blocked without a new policy', () => {
  const registration = body('register_for_webinar');
  assert.match(registration, /payment_status IN \('paid','free'\)/);
  assert.doesNotMatch(registration, /payment_status IN \('pending','paid','free'\)/);
  for (const name of ['register_for_webinar', 'prepare_webinar_payment']) {
    assert.match(body(name), /IF w\.price_toman>0 AND w\.max_capacity IS NOT NULL THEN/);
    assert.match(body(name), /paid capacity reservation policy is not configured/);
  }
});

test('all mutating payment paths acquire webinar -> registration -> attempt -> payment locks', () => {
  for (const name of ['prepare_webinar_payment', 'attach_webinar_payment', 'mark_webinar_payment_unknown',
    'settle_webinar_payment', 'reject_webinar_payment']) {
    const definition = body(name);
    const ordered = ['SELECT * INTO w FROM public.webinars', 'SELECT * INTO reg FROM public.webinar_registrations',
      'SELECT * INTO attempt FROM public.webinar_payment_attempts'];
    if (['prepare_webinar_payment', 'attach_webinar_payment', 'settle_webinar_payment', 'reject_webinar_payment'].includes(name)) {
      ordered.push('SELECT * INTO pay FROM public.payments');
    }
    let previous = -1;
    for (const statement of ordered) {
      const index = definition.indexOf(statement);
      assert.ok(index > previous, `${name} lock order missing/out of order: ${statement}`);
      assert.match(definition.slice(index, definition.indexOf(';', index)), /FOR UPDATE/);
      previous = index;
    }
  }
});

test('ready attachment validates canonical amount/authority/URL and keeps bindings atomic', () => {
  const attach = body('attach_webinar_payment');
  assert.match(attach, /https:\/\/payment\.zarinpal\.com\/pg\/StartPay\//);
  assert.match(attach, /https:\/\/sandbox\.zarinpal\.com\/pg\/StartPay\//);
  assert.match(attach, /w\.price_toman IS DISTINCT FROM p_amount/);
  assert.match(attach, /INSERT INTO public\.payments\(user_id,amount,authority,status\)/);
  assert.match(attach, /UPDATE public\.webinar_registrations SET payment_id=pay\.id/);
  assert.match(attach, /UPDATE public\.webinar_payment_attempts SET state='ready',payment_id=pay\.id/);
  assert.doesNotMatch(attach, /amount_toman|status='verified'|\bCOMMIT\b/);
});

test('read context excludes legacy/orphan/foreign ledger and normalizes receipt precision', () => {
  const context = body('read_webinar_payment_context');
  assert.match(context, /JOIN public\.webinar_payment_attempts a ON a\.registration_id=r\.id/);
  assert.match(context, /a\.state='ready'/);
  assert.match(context, /a\.authority=p\.authority AND a\.amount=p\.amount AND p\.user_id=r\.user_id/);
  assert.match(context, /p\.status IN \('pending','failed'\) AND r\.payment_status='pending' AND NOT r\.access_qualified/);
  assert.match(context, /p\.status='paid' AND r\.payment_status='paid' AND r\.access_qualified/);
  assert.match(context, /date_trunc\('milliseconds',p\.verified_at\)/);
  assert.match(functions.get('read_webinar_payment_context').attributes, /VOLATILE/);
});

test('settlement uses canonical ledger and registration qualification in one transaction; replay does not write', () => {
  const settle = body('settle_webinar_payment');
  const replay = settle.slice(settle.indexOf("IF pay.status='paid' THEN"), settle.indexOf("IF reg.payment_status<>'pending'"));
  assert.match(replay, /pay\.ref_id IS DISTINCT FROM p_ref_id/);
  assert.match(replay, /reg\.payment_status<>'paid' OR NOT reg\.access_qualified/);
  assert.match(replay, /'settled',true,'reused',true/);
  assert.doesNotMatch(replay, /INSERT|UPDATE|verify_payment\(/);
  assert.match(settle, /verified_owner := public\.verify_payment\(p_authority,p_ref_id,p_amount,NULL\)/);
  assert.match(settle, /verified_owner IS DISTINCT FROM reg\.user_id/);
  assert.match(settle, /UPDATE public\.webinar_registrations SET payment_status='paid',access_qualified=true/);
  assert.match(settle, /'settled',true,'reused',false/);
  assert.doesNotMatch(settle, /NOT w\.access_enabled|w\.status NOT IN|now\(\)>=w\.access_ends_at|\bCOMMIT\b/);
  assert.match(settle, /p_ref_id::numeric>9007199254740991/);
  const reject = body('reject_webinar_payment');
  assert.match(reject, /pay\.status NOT IN \('pending','failed'\)/);
  assert.match(reject, /IF pay\.status='pending' THEN PERFORM public\.fail_payment\(p_authority\)/);
  assert.doesNotMatch(reject, /access_qualified=true|verify_payment\(/);
});

test('all exposed functions have explicit grants and service calls enforce service claims', () => {
  const signatures = new Map([
    ['list_public_webinars', ['', 'anon,authenticated,service_role']],
    ['register_for_webinar', ['uuid', 'authenticated']], ['webinar_access', ['uuid', 'authenticated']],
    ['prepare_webinar_payment', ['uuid', 'authenticated']],
    ['attach_webinar_payment', ['uuid,text,text,integer', 'service_role']],
    ['mark_webinar_payment_unknown', ['uuid', 'service_role']],
    ['read_webinar_payment_context', ['text,uuid', 'service_role']],
    ['settle_webinar_payment', ['text,uuid,uuid,integer,text', 'service_role']],
    ['reject_webinar_payment', ['text,uuid,uuid,integer', 'service_role']],
  ]);
  for (const [name, [signature, roles]] of signatures) {
    assert.ok(executable.includes(`REVOKE ALL ON FUNCTION public.${name}(${signature}) FROM PUBLIC,anon,authenticated,service_role;`));
    assert.ok(executable.includes(`GRANT EXECUTE ON FUNCTION public.${name}(${signature}) TO ${roles};`));
    assert.match(functions.get(name).attributes, /SECURITY DEFINER SET search_path = pg_catalog, public|SECURITY DEFINER\s+SET search_path = pg_catalog, public/);
    if (roles === 'service_role') assert.match(body(name), /current_setting\('request\.jwt\.claims',true\)[\s\S]*?IS DISTINCT FROM 'service_role'/);
  }
});

test('dollar-quoted bodies balance; this check deliberately makes no grammar claim', () => {
  assert.equal((executable.match(/\$m2\$/g) ?? []).length, functions.size * 2);
  assert.equal(functions.size, 11);
});
