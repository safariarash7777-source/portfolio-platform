import 'server-only';
import { createClient } from '@/lib/supabase/server';

export const OPERATIONAL_ROLES = ['data_quality', 'site_monitor', 'coordinator'] as const;
export type OperationalRole = typeof OPERATIONAL_ROLES[number];
export type OperationalState = 'ok' | 'stale' | 'failed' | 'unknown';
interface OperationalReport {
  summary: string;
  checks: { key: string; label: string; state: OperationalState; detail: string; lastAt: string | null }[];
  actions: string[];
}
export interface OperationalAgentView {
  role: OperationalRole;
  state: OperationalState;
  recordedState: OperationalState | null;
  createdAt: string | null;
  heartbeatStale: boolean;
  report: OperationalReport | null;
  unavailableReason: string | null;
}
export interface OperationalAgentsView {
  agents: OperationalAgentView[];
  unavailableReason: string | null;
}
const STATES: OperationalState[] = ['ok', 'stale', 'failed', 'unknown'];
const MAX_AGE_MS = 30 * 60 * 1000;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_operational_record');
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('invalid_operational_text');
  return value;
}
function state(value: unknown): OperationalState {
  if (!STATES.includes(value as OperationalState)) throw new Error('invalid_operational_state');
  return value as OperationalState;
}
function missing(role: OperationalRole, unavailableReason: string): OperationalAgentView {
  return { role, state: 'unknown', recordedState: null, createdAt: null, heartbeatStale: false, report: null, unavailableReason };
}
function parse(role: OperationalRole, input: unknown, now: number): OperationalAgentView {
  const row = object(input);
  const createdAt = text(row.created_at, 60);
  const timestamp = Date.parse(createdAt);
  if (!Number.isFinite(timestamp) || timestamp > now + 120_000) throw new Error('invalid_operational_time');
  const recordedState = state(row.status);
  const report = object(row.report);
  const summary = text(report.summary, 4000);
  if (!Array.isArray(report.checks) || report.checks.length > 100 || !Array.isArray(report.actions) || report.actions.length > 30) throw new Error('invalid_operational_report');
  const checks = report.checks.map(input => {
    const check = object(input);
    const lastAt = check.lastAt == null ? null : text(check.lastAt, 60);
    if (lastAt !== null && !Number.isFinite(Date.parse(lastAt))) throw new Error('invalid_check_time');
    return { key: text(check.key, 100), label: text(check.label, 200), state: state(check.state), detail: text(check.detail, 1800), lastAt };
  });
  if (new Set(checks.map(check => check.key)).size !== checks.length) throw new Error('duplicate_operational_check');
  const actions = report.actions.map(value => text(value, 1800));
  const heartbeatStale = now - timestamp > MAX_AGE_MS;
  // A stale heartbeat cannot erase a recorded failure or make an unknown result healthy.
  const effectiveState = heartbeatStale && recordedState === 'ok' ? 'stale' : recordedState;
  return { role, state: effectiveState, recordedState, createdAt, heartbeatStale, report: { summary, checks, actions }, unavailableReason: null };
}

/** Private session read only. The newest invalid record never falls back to an older healthy run. */
export async function loadOperationalAgentsView(now = Date.now()): Promise<OperationalAgentsView> {
  const unavailable = (reason: string): OperationalAgentsView => ({ unavailableReason: reason, agents: OPERATIONAL_ROLES.map(role => missing(role, reason)) });
  if (!Number.isFinite(now)) return unavailable('زمان ارزیابی وضعیت معتبر نیست.');
  try {
    const client = await createClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return unavailable('برای مشاهدهٔ گزارش پایش، نشست معتبر مدیریت لازم است.');
    const { data: profile, error: profileError } = await client.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profileError || profile?.role !== 'admin') return unavailable('دسترسی مدیریتی به گزارش پایش احراز نشد.');
    const { data, error } = await client.from('site_agent_runs')
      .select('id,run_key,role,created_at,status,report').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(60);
    if (error) return unavailable('گزارش پایش قابل خواندن نیست؛ اتصال، نصب جدول و مجوز دسترسی باید بررسی شود.');
    const rows = (data ?? []) as unknown[];
    const agents = OPERATIONAL_ROLES.map(role => {
      const row = rows.find(value => value && typeof value === 'object' && (value as Record<string, unknown>).role === role);
      if (!row) return missing(role, 'در رکوردهای اخیر، گزارشی برای این نقش پیدا نشد؛ وضعیت اجرا نامشخص است.');
      try { return parse(role, row, now); }
      catch { return missing(role, 'تازه‌ترین گزارش این نقش ساختار یا زمان معتبر ندارد و نیازمند بررسی است.'); }
    });
    return { agents, unavailableReason: null };
  } catch {
    return unavailable('مخزن گزارش پایش اکنون در دسترس نیست؛ وضعیت اجرا قابل احراز نیست.');
  }
}
