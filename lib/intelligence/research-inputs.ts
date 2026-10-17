import { computeRatios } from '../core/engine';
import { jalaliYmdToGregorian } from '../core/jalali';
import { dedupeByPeriod, latestParserRows, reportScope, publishKey, fetchQueries, FETCH_LIMITS, type CodalRow } from '../fundamental/supabase';
import { isMillionRialUnit } from '../fundamental/units';
import type { CodalN10Data } from '../fundamental/types';
import { prepareResearchPacket, type ResearchObservation } from './research-agent';

export type StoredResearchCodalRow = CodalRow & { published_at?: string | null; captured_at?: string | null };
export const DEFAULT_REPORT_MAX_AGE_MS = 240 * 86400000;
export interface ResearchProvenance {
  evidence: string; symbol: string; reportId: number; sourceUrl: string;
  periodEnd: string; periodMonths: number; publishedAt: string; capturedAt: string | null;
  fetchedAt: string; unit: 'میلیون ریال'; scope: 'company';
}
export interface ResearchInputs {
  observations: ResearchObservation[];
  /** Local persistence only: never serialize this object to the model. */
  provenance: ResearchProvenance[];
  excluded: { symbol: string; reason: string }[];
}
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const persianDate = new Intl.DateTimeFormat('en-US-u-ca-persian', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Roundtrip closes permissive dates such as the thirty-first day of a short month. */
function validJalali(value: string): string | null {
  const gregorian = jalaliYmdToGregorian(value);
  if (!gregorian) return null;
  const parts = persianDate.formatToParts(new Date(`${gregorian}T12:00:00Z`));
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}` === value.replaceAll('/', '-') ? gregorian : null;
}

function publication(row: StoredResearchCodalRow): string | null {
  if (row.published_at != null) {
    if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(row.published_at)) return null;
    const at = Date.parse(row.published_at);
    return Number.isFinite(at) ? new Date(at).toISOString() : null;
  }
  const key = publishKey(row);
  if (!key) return null;
  const date = validJalali(key.slice(0, 10));
  // Modern Iranian disclosures use the fixed Tehran offset; no inferred capture/publication clock.
  if (!date || date < '2023-01-01') return null;
  return new Date(`${date}T${key.slice(11)}+03:30`).toISOString();
}

/** Canonical version is selected BEFORE validation: invalid amendments never revive superseded data. */
export function prepareCodalResearchInputs(rows: StoredResearchCodalRow[], symbols: string[], now: number, maxReportAgeMs = DEFAULT_REPORT_MAX_AGE_MS): ResearchInputs {
  if (!Number.isFinite(now) || !Number.isFinite(maxReportAgeMs) || maxReportAgeMs <= 0 || !symbols.length || symbols.length > 20 || new Set(symbols).size !== symbols.length) throw new Error('invalid_research_universe');
  const result: ResearchInputs = { observations: [], provenance: [], excluded: [] };
  for (const symbol of symbols) {
    try {
      if (!symbol.trim() || symbol !== symbol.trim() || /[0-9۰-۹٠-٩]$|ح$/.test(symbol)) throw new Error('excluded_instrument');
      const sourceRows = rows.filter(r => r.symbol === symbol && r.report_kind === 'ن-۱۰');
      if (!sourceRows.length) throw new Error('missing_report');
      // Malformed parsed records must not disappear before canonical selection.
      if (sourceRows.some(r => !r.data || typeof r.data.period_end !== 'string' || !validJalali(r.data.period_end) || typeof r.data.period_months !== 'number' || ![3, 6, 9, 12].includes(r.data.period_months))) throw new Error('invalid_report_period');
      const selected = dedupeByPeriod(latestParserRows(sourceRows)).sort((a, b) => b.data.period_end.localeCompare(a.data.period_end) || (b.data as CodalN10Data).period_months - (a.data as CodalN10Data).period_months)[0] as StoredResearchCodalRow;
      const data = selected.data as CodalN10Data;
      if (reportScope(selected.title) !== 'company') throw new Error('ambiguous_report_scope');
      if (!isMillionRialUnit(data.unit)) throw new Error('unknown_report_unit');
      if (data.symbol !== symbol || data.report_kind !== 'ن-۱۰' || !Number.isSafeInteger(selected.id) || selected.id <= 0 || typeof data.audited !== 'boolean') throw new Error('invalid_report_identity');
      const s = data.standalone;
      if (!s || ![s.revenue, s.cogs, s.gross_profit, s.operating_profit, s.net_profit].every(finite)) throw new Error('incomplete_financials');
      if (Math.abs(s.gross_profit - (s.revenue - Math.abs(s.cogs))) > 1) throw new Error('arithmetic_mismatch');
      const publishedAt = publication(selected);
      const periodDate = validJalali(data.period_end)!;
      if (!publishedAt || Date.parse(publishedAt) > now || now - Date.parse(publishedAt) > maxReportAgeMs || Date.parse(`${periodDate}T00:00:00+03:30`) > Date.parse(publishedAt) || now - Date.parse(`${periodDate}T00:00:00+03:30`) > maxReportAgeMs) throw new Error('stale_or_invalid_report_date');
      const sourceUrl = (selected.raw?.announcement_link ?? selected.source_url ?? '').replace(/#pv\d+$/, '');
      // Prior values come only from this disclosure's comparable prior-period columns.
      const prior = s.prior && finite(s.prior.revenue) && finite(s.prior.net_profit) ? { revenue: s.prior.revenue, net_profit: s.prior.net_profit } : null;
      const observation: ResearchObservation = {
        id: `codal:${selected.id}`, source: 'codal', sourceUrl, observedAt: publishedAt,
        period: `${data.period_end}/${data.period_months}`,
        ratios: computeRatios({ ...s, eps_rial: null, capital: null, period_months: data.period_months, audited: data.audited, prior }),
      };
      prepareResearchPacket([observation], now, maxReportAgeMs);
      result.observations.push(observation);
      const captured = selected.captured_at ? Date.parse(selected.captured_at) : NaN;
      result.provenance.push({ evidence: `E${result.observations.length}`, symbol, reportId: selected.id, sourceUrl, periodEnd: data.period_end, periodMonths: data.period_months, publishedAt, capturedAt: Number.isFinite(captured) && captured <= now ? new Date(captured).toISOString() : null, fetchedAt: new Date(now).toISOString(), unit: 'میلیون ریال', scope: 'company' });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      result.excluded.push({ symbol, reason: /^[a-z_]+$/.test(message) ? message : 'invalid_stored_report' });
    }
  }
  return result;
}

/** Reads existing stored reports only. Never contacts BrsApi or the disclosure website. */
export async function readResearchInputs(options: { url: string; anonKey: string; symbols: string[]; now?: number; maxReportAgeMs?: number; fetchImpl?: typeof fetch }): Promise<ResearchInputs> {
  const base = new URL(options.url);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('invalid_research_data_endpoint');
  if (!options.symbols.length || options.symbols.length > 20) throw new Error('invalid_research_universe');
  const rows: StoredResearchCodalRow[] = [];
  for (const symbol of options.symbols) {
    const query = fetchQueries(symbol).find(q => q.kind === 'ن-۱۰')!.qs;
    query.set('select', `${query.get('select')},published_at,captured_at`);
    // Include malformed/null parsed reports so a newer failed parse cannot be hidden.
    query.delete('data');
    let response: Response;
    try { response = await (options.fetchImpl ?? fetch)(`${options.url.replace(/\/+$/, '')}/rest/v1/codal_reports?${query}`, { headers: { apikey: options.anonKey, Authorization: `Bearer ${options.anonKey}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) }); }
    catch { throw new Error('research_data_read_failed'); }
    if (!response.ok) throw new Error('research_data_read_failed');
    let body: unknown;
    try { body = await response.json(); } catch { throw new Error('invalid_research_data_response'); }
    if (!Array.isArray(body) || body.length >= FETCH_LIMITS['ن-۱۰'] || body.some(r => !r || r.symbol !== symbol)) throw new Error('incomplete_research_data_response');
    rows.push(...body as StoredResearchCodalRow[]);
  }
  return prepareCodalResearchInputs(rows, options.symbols, options.now ?? Date.now(), options.maxReportAgeMs);
}
