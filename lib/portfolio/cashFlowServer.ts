import type { SupabaseClient } from "@supabase/supabase-js";
import { authSessionFailure } from "../auth/session-error";
import { withDeadline } from "../deadline";
import { CASH_FLOW_BODY_LIMIT, cashFlowObject, cashFlowReport, cashFlowUuid, validateCashFlowPayload, validateCashFlowPeriod, validateCashFlowRead, validateCashFlowReceipt, validateCashFlowWriteRequest, type CashFlowApiError, type CashFlowErrorCode, type CashFlowRead, type CashFlowWriteRequest } from "./cashFlowApiContract";
import type { CashFlowPeriod } from "./cashFlow";

interface DbResult { data: unknown; error: { code?: string } | null }
export interface CashFlowDb {
  authenticate(): Promise<{ user: { id: string } | null; error: unknown }>;
  latest(owner: string, period: CashFlowPeriod, signal: AbortSignal): PromiseLike<DbResult>;
  selected(owner: string, period: CashFlowPeriod, id: string, signal: AbortSignal): PromiseLike<DbResult>;
  history(owner: string, period: CashFlowPeriod, before: number | undefined, signal: AbortSignal): PromiseLike<DbResult>;
  entries(id: string, signal: AbortSignal): PromiseLike<DbResult>;
  record(request: CashFlowWriteRequest, signal: AbortSignal): PromiseLike<DbResult>;
}
const headers = "id,user_id,period_start,period_end,version,account_definitions,scope_account_keys,opening,coverage,entry_count,created_at";
/** Always uses the caller's native session client; no admin/service-role client. */
export function cashFlowDb(client: SupabaseClient): CashFlowDb {
  const series = (owner: string, period: CashFlowPeriod) => client.from("member_cash_flow_versions").select(headers).eq("user_id", owner).eq("period_start", period.startOn).eq("period_end", period.endOn);
  return {
    async authenticate() { const { data, error } = await client.auth.getUser(); return { user: data.user, error }; },
    latest: (owner, period, signal) => series(owner, period).order("version", { ascending: false }).limit(1).abortSignal(signal).maybeSingle(),
    selected: (owner, period, id, signal) => series(owner, period).eq("id", id).abortSignal(signal).maybeSingle(),
    history: (owner, period, before, signal) => {
      let query = client.from("member_cash_flow_versions").select("id,user_id,period_start,period_end,version,created_at").eq("user_id", owner).eq("period_start", period.startOn).eq("period_end", period.endOn).order("version", { ascending: false }).limit(21);
      if (before !== undefined) query = query.lt("version", before);
      return query.abortSignal(signal);
    },
    entries: (id, signal) => client.from("member_cash_flow_entries").select("version_id,entry_key,basis,kind,amount_toman,occurred_on,source,category,note,account_key,from_account_key,to_account_key").eq("version_id", id).order("entry_key").limit(501).abortSignal(signal),
    record: (request, signal) => client.rpc("record_member_cash_flow", { p_payload: request.payload, p_client_token: request.clientToken, p_base_version: request.baseVersion }).abortSignal(signal),
  };
}
class HttpFailure extends Error { constructor(readonly status: number, readonly code: CashFlowErrorCode) { super(code); } }
const messages: Record<CashFlowErrorCode, string> = {
  INVALID_INPUT: "اطلاعات جریان نقد معتبر نیست.", AUTH_REQUIRED: "برای مشاهده و ثبت جریان نقد وارد شوید.", FORBIDDEN: "دسترسی مجاز نیست.", OWNER_CHANGED: "هویت عضو تغییر کرده است؛ درخواست ارسال نشد.", ORIGIN_FORBIDDEN: "مبدأ درخواست مجاز نیست.", NOT_FOUND: "نسخهٔ انتخاب‌شده در دسترس نیست.", CONFLICT: "نسخه یا شناسهٔ ثبت تعارض دارد؛ درخواست و متن فعلی را حفظ کنید.", BODY_TOO_LARGE: "حجم درخواست بیش از حد مجاز است.", RATE_LIMITED: "محدودیت موقت درخواست؛ نتیجهٔ قبلی همچنان ممکن است نامشخص باشد.", AUTH_UNAVAILABLE: "بررسی نشست در دسترس نیست.", READ_UNAVAILABLE: "خواندن جریان نقد در دسترس نیست؛ دادهٔ قبلی را حفظ کنید.", WRITE_UNAVAILABLE: "نتیجهٔ ثبت مشخص نیست؛ همان درخواست را دوباره بررسی کنید.",
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
function failure(error: unknown, fallback: CashFlowErrorCode): Response {
  const known = error instanceof HttpFailure ? error : new HttpFailure(503, fallback);
  return json({ state: "error", code: known.code, error: messages[known.code] } satisfies CashFlowApiError, known.status);
}
async function authenticate(db: CashFlowDb): Promise<string> {
  let auth: Awaited<ReturnType<CashFlowDb["authenticate"]>>;
  try { auth = await db.authenticate(); } catch { throw new HttpFailure(503, "AUTH_UNAVAILABLE"); }
  const status = authSessionFailure(auth.error);
  if (status === 503) throw new HttpFailure(503, "AUTH_UNAVAILABLE");
  if (status === 401 || !auth.user) throw new HttpFailure(401, "AUTH_REQUIRED");
  if (!cashFlowUuid(auth.user.id)) throw new HttpFailure(503, "AUTH_UNAVAILABLE");
  return auth.user.id;
}
async function rawBody(request: Request, signal: AbortSignal): Promise<unknown> {
  if (!request.body) throw new HttpFailure(400, "INVALID_INPUT");
  const reader = request.body.getReader(), parts: Uint8Array[] = []; let length = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw new Error("Preparation stopped");
      const part = await reader.read();
      if (signal.aborted) throw new Error("Preparation stopped");
      if (part.done) break;
      length += part.value.byteLength;
      if (length > CASH_FLOW_BODY_LIMIT) { cancel(); throw new HttpFailure(413, "BODY_TOO_LARGE"); }
      parts.push(part.value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new HttpFailure(400, "INVALID_INPUT"); }
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}
export async function postCashFlow(request: Request, connect: () => Promise<CashFlowDb>): Promise<Response> {
  if (request.headers.get("origin") !== new URL(request.url).origin) return failure(new HttpFailure(403, "ORIGIN_FORBIDDEN"), "WRITE_UNAVAILABLE");
  let prepared: { db: CashFlowDb; owner: string; input: CashFlowWriteRequest };
  try {
    // This closure MUST NOT start an RPC: late Auth/body completion cannot mutate anything.
    prepared = await withDeadline(async signal => {
      let db: CashFlowDb, owner: string;
      try { db = await connect(); owner = await authenticate(db); }
      catch (error) { if (error instanceof HttpFailure) throw error; throw new HttpFailure(503, "AUTH_UNAVAILABLE"); }
      if (signal.aborted) throw new Error("Preparation stopped");
      const body = await rawBody(request, signal);
      let input: CashFlowWriteRequest;
      try { input = validateCashFlowWriteRequest(body); } catch { throw new HttpFailure(400, "INVALID_INPUT"); }
      if (input.expectedOwnerId !== owner) throw new HttpFailure(403, "OWNER_CHANGED");
      return { db, owner, input };
    }, 10_000);
  } catch (error) { return failure(error, "WRITE_UNAVAILABLE"); }
  try {
    // Deadline limits waiting only. The DB may still commit after an ignored abort.
    const result = await withDeadline(signal => Promise.resolve(prepared.db.record(prepared.input, signal)), 10_000);
    if (result.error) {
      const code = result.error.code ?? "";
      if (code === "42501") throw new HttpFailure(403, "FORBIDDEN");
      if (code === "PT409" || code === "40001") throw new HttpFailure(409, "CONFLICT");
      if (code.startsWith("22") || code.startsWith("23")) throw new HttpFailure(400, "INVALID_INPUT");
      throw new Error("Unconfirmed write");
    }
    const row = cashFlowObject(result.data, ["contractVersion", "version_id", "version", "entry_count", "reused", "canonical_content_hash"]);
    const receipt = validateCashFlowReceipt({ contractVersion: row.contractVersion, ownerId: prepared.owner, versionId: row.version_id, version: row.version, entryCount: row.entry_count, reused: row.reused, canonicalContentHash: row.canonical_content_hash }, prepared.input);
    return json(receipt, receipt.reused ? 200 : 201);
  } catch (error) { return failure(error, "WRITE_UNAVAILABLE"); }
}
function selection(url: URL): { period: CashFlowPeriod; version?: string; beforeVersion?: number } {
  const allowed = ["startOn", "endOn", "version", "beforeVersion"];
  if ([...url.searchParams.keys()].some(key => !allowed.includes(key) || url.searchParams.getAll(key).length !== 1)) throw new HttpFailure(400, "INVALID_INPUT");
  try {
    const period = validateCashFlowPeriod({ startOn: url.searchParams.get("startOn"), endOn: url.searchParams.get("endOn") });
    const version = url.searchParams.get("version"), before = url.searchParams.get("beforeVersion");
    if (version !== null && !cashFlowUuid(version) || before !== null && (!/^[1-9]\d*$/.test(before) || Number(before) > 2_147_483_647)) throw new Error("Invalid selection");
    return { period, ...(version !== null ? { version } : {}), ...(before !== null ? { beforeVersion: Number(before) } : {}) };
  } catch { throw new HttpFailure(400, "INVALID_INPUT"); }
}
const headerKeys = ["id", "user_id", "period_start", "period_end", "version", "account_definitions", "scope_account_keys", "opening", "coverage", "entry_count", "created_at"];
function ownedHeader(value: unknown, owner: string, period: CashFlowPeriod): Record<string, unknown> {
  const row = cashFlowObject(value, headerKeys);
  if (row.user_id !== owner || row.period_start !== period.startOn || row.period_end !== period.endOn || !cashFlowUuid(row.id) || !Number.isInteger(row.version) || Number(row.version) < 1 || !Number.isInteger(row.entry_count) || Number(row.entry_count) < 0 || Number(row.entry_count) > 500) throw new Error("Invalid owned header");
  return row;
}
function entryPayload(value: unknown, versionId: unknown): unknown {
  const row = cashFlowObject(value, ["version_id", "entry_key", "basis", "kind", "amount_toman", "occurred_on", "source", "category", "note", "account_key", "from_account_key", "to_account_key"]);
  if (row.version_id !== versionId || row.kind === "transfer" && row.account_key !== null || row.kind !== "transfer" && (row.from_account_key !== null || row.to_account_key !== null)) throw new Error("Invalid version entry");
  return { entryKey: row.entry_key, basis: row.basis, kind: row.kind, amountToman: row.amount_toman, occurredOn: row.occurred_on, source: row.source, category: row.category, note: row.note,
    ...(row.kind === "transfer" ? { fromAccountKey: row.from_account_key, toAccountKey: row.to_account_key } : { accountKey: row.account_key }) };
}
export async function getCashFlow(request: Request, connect: () => Promise<CashFlowDb>): Promise<Response> {
  try {
    const startedAt = Date.now();
    const selected = selection(new URL(request.url));
    const data = await withDeadline(async signal => {
      let db: CashFlowDb;
      try { db = await connect(); } catch { throw new HttpFailure(503, "AUTH_UNAVAILABLE"); }
      const owner = await authenticate(db);
      if (signal.aborted) throw new Error("Read stopped");
      // Optional metadata has its own shorter bound, preserving a valid explicit snapshot.
      const metadataBudget = Math.max(1, Math.min(7_500, 10_000 - (Date.now() - startedAt) - 100));
      const optional = <T>(load: (signal: AbortSignal) => PromiseLike<T>) => withDeadline(child => Promise.resolve(load(child)), metadataBudget, signal).then(value => ({ value }), () => ({ value: null }));
      const latestTask = optional(child => db.latest(owner, selected.period, child));
      const historyTask = optional(child => db.history(owner, selected.period, selected.beforeVersion, child));
      const selectionTask = selected.version ? Promise.resolve(db.selected(owner, selected.period, selected.version, signal)) : latestTask.then(result => {
        if (!result.value || result.value.error) throw new Error("Latest unavailable"); return result.value;
      });
      const selectedResult = await selectionTask;
      if (selectedResult.error) throw new Error("Selected unavailable");
      if (selected.version && selectedResult.data === null) throw new HttpFailure(404, "NOT_FOUND");
      const header = selectedResult.data === null ? null : ownedHeader(selectedResult.data, owner, selected.period);
      let snapshot: CashFlowRead["snapshot"] = null;
      if (header) {
        const entries = await db.entries(String(header.id), signal);
        if (entries.error || !Array.isArray(entries.data) || entries.data.length !== header.entry_count || entries.data.length > 500) throw new Error("Incomplete entries");
        const payload = validateCashFlowPayload({ contractVersion: 1, period: selected.period, accountDefinitions: header.account_definitions, scopeAccountKeys: header.scope_account_keys, opening: header.opening, coverage: header.coverage, entries: entries.data.map(row => entryPayload(row, header.id)) });
        snapshot = { id: String(header.id), version: Number(header.version), createdAt: String(header.created_at), payload };
      }
      const [latestResult, historyResult] = await Promise.all([latestTask, historyTask]);
      let latest: CashFlowRead["latest"] = { state: "error", id: null, version: null };
      if (latestResult.value && !latestResult.value.error) {
        if (latestResult.value.data === null) latest = { state: "ready", id: null, version: 0 };
        else { try { const item = ownedHeader(latestResult.value.data, owner, selected.period); latest = { state: "ready", id: String(item.id), version: Number(item.version) }; } catch { /* Invalid optional metadata remains error, never a numeric latest version. */ } }
      }
      let history: CashFlowRead["history"] = { state: "error", items: [], nextBeforeVersion: null };
      if (historyResult.value && !historyResult.value.error) {
        try {
          if (!Array.isArray(historyResult.value.data) || historyResult.value.data.length > 21) throw new Error("Invalid history");
          const rows = historyResult.value.data.map(value => {
            const row = cashFlowObject(value, ["id", "user_id", "period_start", "period_end", "version", "created_at"]);
            if (row.user_id !== owner || row.period_start !== selected.period.startOn || row.period_end !== selected.period.endOn) throw new Error("Invalid history owner/period");
            return { id: row.id as string, version: row.version as number, createdAt: row.created_at as string };
          });
          // Validate every row, including the lookahead row, before trimming the page.
          rows.forEach((row, i) => { if (!cashFlowUuid(row.id) || !Number.isInteger(row.version) || row.version < 1 || row.version > 2_147_483_647 || typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt)) || i > 0 && row.version >= rows[i - 1].version || selected.beforeVersion !== undefined && row.version >= selected.beforeVersion) throw new Error("Invalid history ordering"); });
          if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error("Duplicate history");
          if (rows.some(row => latest.state === "ready" && (row.version > latest.version! || row.version === latest.version && row.id !== latest.id) || snapshot && row.version === snapshot.version && row.id !== snapshot.id)) throw new Error("History version mismatch");
          history = { state: "ready", items: rows.slice(0, 20), nextBeforeVersion: rows.length > 20 ? rows[19].version : null };
        } catch { /* A malformed optional history never erases the valid selected snapshot. */ }
      }
      return validateCashFlowRead({ contractVersion: "cash-flow-read.v1", state: snapshot ? "ready" : "empty", ownerId: owner, period: selected.period, snapshot, report: snapshot ? cashFlowReport(snapshot.payload, owner) : null, latest, history }, { ...selected, ownerId: owner });
    }, 10_000);
    return json(data);
  } catch (error) { return failure(error, "READ_UNAVAILABLE"); }
}
