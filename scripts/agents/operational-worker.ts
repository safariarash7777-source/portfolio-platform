/** Fixed, deterministic server monitor. No model, user messages, repairs or arbitrary SQL. */
import { spawnSync } from 'node:child_process';
import { buildDataQualityReport, buildCoordinatorReport, type AgentRun, type AgentCheck } from '../../lib/intelligence/operational-agents';

const DB = 'portfolio-stage-db-1';
const CONTAINERS = [DB, 'portfolio-stage-rest-1', 'portfolio-stage-auth-1', 'portfolio-stage-storage-1', 'portfolio-stage-gateway-1'];
function sql(query: string, role: 'anon' | 'site_monitor_writer'): unknown {
  const result = spawnSync('/usr/bin/docker', ['exec', '-i', DB, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    input: `BEGIN; SET LOCAL statement_timeout='15s'; SET LOCAL ROLE ${role}; ${query}; COMMIT;`,
    encoding: 'utf8', timeout: 25_000, maxBuffer: 12 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error('database_operation_failed');
  return JSON.parse(result.stdout.trim());
}

/** Body capped while streaming; redirects forbidden so no auth/unknown routes are followed. */
async function probeAbout(): Promise<AgentCheck> {
  const base = { key: 'public_about', label: 'صفحهٔ عمومی سایت' };
  try {
    const response = await fetch('https://portfolio-platform-fawn.vercel.app/about', {
      redirect: 'manual', signal: AbortSignal.timeout(12_000), headers: { 'User-Agent': 'Portfolio-Operational-Monitor/1.0' },
    });
    if (response.status !== 200 || !response.headers.get('content-type')?.includes('text/html')) {
      await response.body?.cancel();
      return { ...base, state: 'failed', detail: 'صفحهٔ عمومی از دید سرور پاسخ HTML موفق نداد؛ ورود و مسیرهای خصوصی آزموده نشده‌اند.' };
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('body_missing');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.length; if (size > 1024 * 1024) throw new Error('body_too_large');
        chunks.push(chunk.value);
      }
    } finally { await reader.cancel().catch(() => undefined); }
    const html = Buffer.concat(chunks).toString('utf8');
    return { ...base, state: html.includes('درباره') ? 'ok' : 'failed', detail: html.includes('درباره')
      ? 'پاسخ HTML و نشانگر صفحهٔ عمومی معتبر است؛ این آزمون پذیرش مرورگر یا ورود کاربر نیست.'
      : 'پاسخ موفق بود اما نشانگر صفحه در HTML پیدا نشد.' };
  } catch {
    return { ...base, state: 'failed', detail: 'دسترسی به صفحهٔ عمومی از دید سرور در مهلت تعیین‌شده تأیید نشد.' };
  }
}

function containerChecks(): AgentCheck[] {
  return CONTAINERS.map((name, index) => {
    const base = { key: `service_${index}`, label: ['پایگاه داده', 'درگاه داده', 'احراز هویت', 'ذخیره‌سازی فایل', 'درگاه شبکه'][index] };
    const result = spawnSync('/usr/bin/docker', ['inspect', '--format', '{{json .State}}', name], { encoding: 'utf8', timeout: 5_000, maxBuffer: 32_768 });
    if (result.error || result.status !== 0) return { ...base, state: 'unknown', detail: 'وضعیت فرایند سرویس قابل خواندن نبود.' };
    try {
      const state = JSON.parse(result.stdout);
      const failed = !state.Running || state.Health?.Status === 'unhealthy';
      return { ...base, state: failed ? 'failed' : state.Health?.Status === 'starting' ? 'unknown' : 'ok', detail: failed
        ? 'فرایند متوقف یا بررسی سلامت کانتینر ناموفق است.'
        : state.Health?.Status === 'healthy' ? 'فرایند فعال و بررسی سلامت کانتینر موفق است؛ پذیرش کامل مسیر کاربر جداست.'
          : 'فرایند فعال است؛ سلامت کاربردی این سرویس با این کنترل اثبات نمی‌شود.' };
    } catch { return { ...base, state: 'unknown', detail: 'پاسخ وضعیت سرویس قابل تفسیر نبود.' }; }
  });
}

async function main() {
  type Source = { snapshot: unknown | null; snapshotUpdatedAt: string | null; codalStateAt: string | null };
  let source: Source | null = null;
  try {
    source = sql(`SELECT json_build_object('snapshot',(SELECT payload FROM public.ir_market_snapshots WHERE key='latest'),
      'snapshotUpdatedAt',(SELECT updated_at FROM public.ir_market_snapshots WHERE key='latest'),
      'codalStateAt',(SELECT updated_at FROM public.ir_market_snapshots WHERE key='codal_engine_state'))`, 'anon') as Source;
  } catch { /* Never log database response, data or credentials. */ }
  const now = Date.now();
  const data = buildDataQualityReport(source ?? { snapshot: null, snapshotUpdatedAt: null, codalStateAt: null }, now);
  const checks: AgentCheck[] = [
    { key: 'stored_data_read', label: 'خواندن دادهٔ ذخیره‌شده', state: source ? 'ok' : 'failed', detail: source ? 'خواندن محدود با نقش فقط‌خواندنی موفق بود.' : 'خواندن دادهٔ ذخیره‌شده تأیید نشد.' },
    ...containerChecks(), await probeAbout(),
  ];
  const status = checks.some(c => c.state === 'failed') ? 'failed' : checks.some(c => c.state === 'unknown') ? 'unknown' : 'ok';
  const technical: AgentRun = { role: 'site_monitor', status, report: {
    summary: 'پایش قطعی سرویس‌ها و صفحهٔ عمومی؛ بدون تغییر داده، ارسال پیام یا اقدام اصلاحی خودکار.', checks,
    actions: status === 'ok' ? [] : ['مسیرهای ناموفق از همان سرور بررسی شوند؛ تغییر تنظیمات پس از تشخیص علت انجام شود.'],
  } };
  const reports = [data, technical, buildCoordinatorReport(data, technical)];
  const slot = Math.floor(now / 600_000);
  // All three records commit atomically. Unique run_key makes replay after a lost response safe.
  const payload = reports.map(run => ({ ...run, run_key: `operational-v1:${slot}:${run.role}` }));
  const json = JSON.stringify(payload);
  if (Buffer.byteLength(json) > 180_000) throw new Error('report_limit');
  const hex = Buffer.from(json).toString('hex');
  const receipt = sql(`WITH payload AS (SELECT value AS p FROM jsonb_array_elements(convert_from(decode('${hex}','hex'),'UTF8')::jsonb)),
    inserted AS (INSERT INTO public.site_agent_runs(run_key,role,status,report)
      SELECT p->>'run_key',p->>'role',p->>'status',p->'report' FROM payload
      ON CONFLICT(run_key) DO NOTHING RETURNING id)
    SELECT json_build_object('inserted',(SELECT count(*) FROM inserted),'slot',${slot})`, 'site_monitor_writer');
  console.log(JSON.stringify({ ok: true, receipt, observedStates: reports.map(r => ({ role: r.role, status: r.status })) }));
}
main().catch(() => { console.error(JSON.stringify({ ok: false, reason: 'operational_run_failed' })); process.exitCode = 1; });
