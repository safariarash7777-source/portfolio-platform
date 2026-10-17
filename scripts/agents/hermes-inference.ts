import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { RESEARCH_INSTRUCTIONS, validateResearchDraft, type ResearchPacket } from '../../lib/intelligence/research-agent';
import { RESEARCH_POLICY } from '../../lib/intelligence/research-policy';

export const RESEARCH_MODEL = RESEARCH_POLICY.model;
export async function inferResearch(packet: ResearchPacket) {
  const directory = await mkdtemp(join(tmpdir(), 'portfolio-hermes-research-'));
  try {
    const input = join(directory, 'prompt.txt');
    await writeFile(input, `${RESEARCH_INSTRUCTIONS}\n${JSON.stringify(packet)}`, { mode: 0o600 });
    const executable = process.platform === 'win32' ? join(process.env.LOCALAPPDATA ?? '', 'hermes', 'bin', 'hermes.exe') : 'hermes';
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|TOKEN|SECRET|PASSWORD|SUPABASE/i.test(key))), NODE_ENV: process.env.NODE_ENV };
    const { stdout } = await promisify(execFile)(executable, [
      'chat', '--safe-mode', '--provider', 'openai-codex', '--model', RESEARCH_MODEL,
      '--reasoning', RESEARCH_POLICY.effort, '--toolsets', 'none', '--max-turns', String(RESEARCH_POLICY.maxTurns),
      '--run-budget', String(RESEARCH_POLICY.runSeconds), '--oneshot', '--quiet', '--query-file', input,
    ], { cwd: directory, env, timeout: RESEARCH_POLICY.timeoutMs, maxBuffer: 1024 * 1024, windowsHide: true });
    const start = stdout.indexOf('{'), end = stdout.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('missing_structured_draft');
    return validateResearchDraft(JSON.parse(stdout.slice(start, end + 1)), packet);
  } finally {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('portfolio-hermes-research-')) throw new Error('unsafe_cleanup_target');
    await rm(directory, { recursive: true, force: true });
  }
}
