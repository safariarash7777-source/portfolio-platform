/** Pure validation for a proposed durable save intent. No storage or transport. */
import { isSourceUrl, parseWorkbook, type ResearchWorkbook } from './research-workbook';

export const MAX_INTENT_REQUEST_BYTES = 2_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isIntentId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
export async function hashIntentRequest(requestBody: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(requestBody));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export interface WorkbookSaveIntentRequest {
  /** Exact bytes represented as UTF-8 text; never regenerate for a retry. */
  requestBody: string;
  workbookId: string;
  baseVersion: number;
  targetVersion: number;
  workbook: ResearchWorkbook;
}

export function parseWorkbookSaveIntent(requestBody: unknown): WorkbookSaveIntentRequest {
  if (typeof requestBody !== 'string' || new TextEncoder().encode(requestBody).length > MAX_INTENT_REQUEST_BYTES) throw new Error('invalid_intent_request');
  let payload: Record<string, unknown>;
  try {
    const value = JSON.parse(requestBody);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    payload = value;
  } catch { throw new Error('invalid_intent_request'); }
  const base = payload.baseVersion;
  if (payload.action !== 'save' || !isIntentId(payload.workbookId) || !Number.isSafeInteger(base) || (base as number) < 0 || (base as number) >= 2_147_483_647 ||
      ((base === 0) ? payload.creationId !== payload.workbookId : payload.creationId !== undefined)) throw new Error('invalid_intent_request');
  let workbook: ResearchWorkbook;
  try { workbook = parseWorkbook(JSON.stringify(payload.workbook)); } catch { throw new Error('invalid_intent_request'); }
  if (!workbook.title.trim() || workbook.title.length > 300 || new TextEncoder().encode(JSON.stringify(workbook)).length > 1_000_000 ||
      workbook.evidence.some(e => e.sourceUrl.trim() && !isSourceUrl(e.sourceUrl.trim()))) throw new Error('invalid_intent_request');
  return { requestBody, workbookId: payload.workbookId, baseVersion: base as number, targetVersion: (base as number) + 1, workbook };
}

export function canonicalWorkbook(value: unknown): string {
  const workbook = parseWorkbook(JSON.stringify(value));
  return JSON.stringify(workbook, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}
