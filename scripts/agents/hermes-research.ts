/** Private, one-shot research through the owner's existing Hermes subscription login.
 * No scheduler, publication, database credentials, or paid-provider fallback.
 * Usage: tsx scripts/agents/hermes-research.ts --synthetic
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { prepareResearchPacket, RESEARCH_INSTRUCTIONS, validateResearchDraft } from '../../lib/intelligence/research-agent';

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--synthetic') throw new Error('synthetic_probe_only');
  const now = Date.now();
  const packet = prepareResearchPacket([{
    id: 'synthetic-only', source: 'codal', sourceUrl: 'https://codal.ir/synthetic-not-a-real-report',
    period: 'synthetic', observedAt: new Date(now).toISOString(),
    ratios: { gross_margin: 35, operating_margin: 20, net_margin: null, revenue_growth: 40, net_profit_growth: null, pe_ttm: null },
  }], now, 60000);
  const directory = await mkdtemp(join(tmpdir(), 'portfolio-hermes-probe-'));
  try {
    const input = join(directory, 'prompt.txt');
    await writeFile(input, `${RESEARCH_INSTRUCTIONS}\nThis is a synthetic contract test, not a real company.\n${JSON.stringify(packet)}`, { mode: 0o600 });
    const executable = process.platform === 'win32'
      ? join(process.env.LOCALAPPDATA ?? '', 'hermes', 'bin', 'hermes.exe') : 'hermes';
    const { stdout } = await promisify(execFile)(executable, [
      'chat', '--safe-mode', '--provider', 'openai-codex', '--model', 'gpt-6-luna',
      // Installed Hermes resolves unknown toolsets to an empty list; safe-mode disables plugins/MCP.
      '--toolsets', 'none', '--max-turns', '1', '--run-budget', '60',
      '--oneshot', '--quiet', '--query-file', input,
    ], { cwd: directory, timeout: 90000, maxBuffer: 1024 * 1024, windowsHide: true });
    const start = stdout.indexOf('{');
    const end = stdout.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('missing_structured_draft');
    const draft = validateResearchDraft(JSON.parse(stdout.slice(start, end + 1)), packet);
    // Safe receipt only. Never persist a synthetic draft as real research.
    console.log(JSON.stringify({ probe: 'synthetic-hermes-research', provider: 'openai-codex', model: 'gpt-6-luna', status: draft.status, claims: draft.claims.length, scenarios: draft.scenarios.length, published: false }));
  } finally {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('portfolio-hermes-probe-')) {
      throw new Error('unsafe_cleanup_target');
    }
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch((error: unknown) => {
  const failure = error as { message?: string; killed?: boolean; code?: unknown };
  const reason = failure.killed ? 'process_timeout' : /^[a-z_]+$/.test(failure.message ?? '') ? failure.message : 'provider_or_transport_failure';
  console.error(JSON.stringify({ probe: 'synthetic-hermes-research', accepted: false, reason }));
  process.exitCode = 1;
});
