/** Additive advisor-only roster; financial totals are deliberately unavailable in v1. */
export const ROSTER_LIMIT = 100;
export const RISK_CATEGORIES = ["محافظه‌کار", "متعادل", "تهاجمی", "بسیار تهاجمی"] as const;
export type RiskCategory = typeof RISK_CATEGORIES[number];
export const RISK_STATES = ["current", "expired", "missing", "ambiguous", "invalid"] as const;
export type RosterRiskState = typeof RISK_STATES[number];
export const ROSTER_MISSING_CODES = ["risk_missing", "risk_expired", "risk_ambiguous", "risk_invalid", "holdings_not_recorded", "holdings_empty", "cashflow_period_not_recorded", "goals_not_recorded", "goals_empty"] as const;
export type RosterMissingCode = typeof ROSTER_MISSING_CODES[number];
export interface RosterRisk {
  state: RosterRiskState; category: RiskCategory | null; assessmentId: string | null;
  assessedAt: string | null; expiresAt: string | null; forcedExpiredAt: string | null;
  source: "risk_assessments";
}
export interface RosterRow {
  relationshipId: string; clientId: string; clientLabel: string; grantedAt: string;
  risk: RosterRisk;
  holdings: { versionId: string | null; state: "not_recorded" | "empty" | "recorded" };
  cashFlow: { versionId: string | null; state: "not_recorded" | "recorded" };
  goals: { versionId: string | null; state: "not_recorded" | "empty" | "recorded" };
  assetValue: { state: "unavailable"; totalToman: null; reason: "valuation_not_in_roster_v1" };
  missingCodes: RosterMissingCode[];
}
export interface RosterRead {
  contractVersion: "consultation-roster.v1"; actorId: string; generatedAt: string;
  period: { startOn: string; endOn: string };
  capabilities: { risk: true; financialPresence: true; assetValueRange: false };
  rows: RosterRow[]; totalAuthorized: number; totalMatched: number; page: number; pageSize: number;
}
/** GET /api/consultation/roster. Lists are comma-separated, OR within a list / AND between filters.
 * Missing codes support missingMode=any|all. Numeric asset filters are rejected (capability=false).
 * Page defaults 1, pageSize 25 (max50). Period pair optional, defaults current Tehran month.
 */
export interface RosterFilters {
  search: string; riskCategories: RiskCategory[]; riskStates: RosterRiskState[];
  missing: RosterMissingCode[]; missingMode: "any" | "all";
  page: number; pageSize: number; startOn?: string; endOn?: string;
}
const uuid = (x: unknown): x is string => typeof x === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x);
const dateTime = (x: unknown): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(x) && Number.isFinite(Date.parse(x));
const day = (x: unknown): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x;
function object(x: unknown, keys: string[]): Record<string, unknown> {
  if (!x || typeof x !== "object" || Array.isArray(x) || Object.keys(x).length !== keys.length || Object.keys(x).some(k => !keys.includes(k))) throw Error("Invalid roster shape");
  return x as Record<string, unknown>;
}
const nullableUuid = (x: unknown) => x === null || uuid(x);
const nullableDate = (x: unknown) => x === null || dateTime(x);
export function rosterMissingCodes(row: Pick<RosterRow, "risk" | "holdings" | "cashFlow" | "goals">): RosterMissingCode[] {
  const codes: RosterMissingCode[] = [];
  if (row.risk.state !== "current") codes.push(`risk_${row.risk.state}`);
  if (row.holdings.state === "not_recorded") codes.push("holdings_not_recorded");
  if (row.holdings.state === "empty") codes.push("holdings_empty");
  if (row.cashFlow.state === "not_recorded") codes.push("cashflow_period_not_recorded");
  if (row.goals.state === "not_recorded") codes.push("goals_not_recorded");
  if (row.goals.state === "empty") codes.push("goals_empty");
  return codes;
}
export function validateRosterRead(value: unknown, expectedActorId?: string): RosterRead {
  const v = object(value, ["contractVersion", "actorId", "generatedAt", "period", "capabilities", "rows", "totalAuthorized", "totalMatched", "page", "pageSize"]);
  if (v.contractVersion !== "consultation-roster.v1" || !uuid(v.actorId) || expectedActorId && v.actorId !== expectedActorId || !dateTime(v.generatedAt)) throw Error("Invalid roster identity");
  const p = object(v.period, ["startOn", "endOn"]);
  if (!day(p.startOn) || !day(p.endOn) || p.endOn < p.startOn || Date.parse(p.endOn) - Date.parse(p.startOn) > 365 * 86400000) throw Error("Invalid roster period");
  const c = object(v.capabilities, ["risk", "financialPresence", "assetValueRange"]);
  if (c.risk !== true || c.financialPresence !== true || c.assetValueRange !== false) throw Error("Invalid roster capabilities");
  if (!Array.isArray(v.rows) || v.rows.length > ROSTER_LIMIT) throw Error("Roster bounds");
  const ids = new Set<string>();
  for (const value of v.rows) {
    const r = object(value, ["relationshipId", "clientId", "clientLabel", "grantedAt", "risk", "holdings", "cashFlow", "goals", "assetValue", "missingCodes"]);
    if (!uuid(r.relationshipId) || ids.has(r.relationshipId) || !uuid(r.clientId) || typeof r.clientLabel !== "string" || !r.clientLabel.trim() || r.clientLabel.length > 160 || !dateTime(r.grantedAt)) throw Error("Invalid roster row");
    ids.add(r.relationshipId);
    const risk = object(r.risk, ["state", "category", "assessmentId", "assessedAt", "expiresAt", "forcedExpiredAt", "source"]);
    if (!RISK_STATES.includes(risk.state as RosterRiskState) || !nullableUuid(risk.assessmentId) || !nullableDate(risk.assessedAt) || !nullableDate(risk.expiresAt) || !nullableDate(risk.forcedExpiredAt) || risk.source !== "risk_assessments") throw Error("Invalid roster risk");
    if (["current", "expired"].includes(risk.state as string)) {
      if (!RISK_CATEGORIES.includes(risk.category as RiskCategory) || !uuid(risk.assessmentId) || !dateTime(risk.assessedAt) || !dateTime(risk.expiresAt)) throw Error("Invalid classified risk");
      const assessed = Date.parse(risk.assessedAt), expires = Date.parse(risk.expiresAt), now = Date.parse(v.generatedAt);
      if (assessed > now || expires !== assessed + 180 * 86400000) throw Error("Invalid risk expiry");
      const forced = risk.forcedExpiredAt !== null && Date.parse(risk.forcedExpiredAt as string) > assessed && Date.parse(risk.forcedExpiredAt as string) <= now;
      if ((risk.state === "expired") !== (now > expires || forced) || risk.forcedExpiredAt !== null && !forced) throw Error("Invalid risk status");
    } else if (risk.category !== null || risk.assessmentId !== null || risk.assessedAt !== null || risk.expiresAt !== null || risk.forcedExpiredAt !== null) throw Error("Uncertain risk must be null");
    for (const key of ["holdings", "cashFlow", "goals"] as const) {
      const item = object(r[key], ["versionId", "state"]);
      const allowed = key === "cashFlow" ? ["not_recorded", "recorded"] : ["not_recorded", "empty", "recorded"];
      if (!allowed.includes(item.state as string) || !nullableUuid(item.versionId) || (item.state === "not_recorded") !== (item.versionId === null)) throw Error("Invalid financial presence");
    }
    const a = object(r.assetValue, ["state", "totalToman", "reason"]);
    if (a.state !== "unavailable" || a.totalToman !== null || a.reason !== "valuation_not_in_roster_v1") throw Error("Unsupported roster valuation");
    if (JSON.stringify(r.missingCodes) !== JSON.stringify(rosterMissingCodes(r as unknown as RosterRow))) throw Error("Invalid missing codes");
  }
  for (const k of ["totalAuthorized", "totalMatched", "page", "pageSize"] as const) if (typeof v[k] !== "number" || !Number.isSafeInteger(v[k])) throw Error("Invalid pagination");
  const result = v as unknown as RosterRead;
  if (result.totalAuthorized < 0 || result.totalAuthorized > ROSTER_LIMIT || result.totalMatched < 0 || result.totalMatched > result.totalAuthorized || result.page < 1 || result.page > 100 || result.pageSize < 1 || result.pageSize > ROSTER_LIMIT || result.rows.length !== Math.max(0, Math.min(result.pageSize, result.totalMatched - (result.page - 1) * result.pageSize))) throw Error("Inconsistent pagination");
  return result;
}
export function parseRosterFilters(params: URLSearchParams): RosterFilters {
  const allowed = ["search", "riskCategories", "riskStates", "missing", "missingMode", "page", "pageSize", "startOn", "endOn"];
  if ([...params.keys()].some(k => !allowed.includes(k) || params.getAll(k).length !== 1)) throw Error("Invalid roster query");
  function list<T extends string>(key: string, choices: readonly T[]): T[] {
    const s = params.get(key); if (s === null) return [];
    const entries = s.split(",");
    if (!entries.length || entries.some(x => !choices.includes(x as T)) || new Set(entries).size !== entries.length) throw Error("Invalid roster choices");
    return entries as T[];
  }
  function integer(k: string, fallback: number, max: number) { const x = params.get(k); if (x === null) return fallback; if (!/^[1-9]\d*$/.test(x) || Number(x) > max) throw Error("Invalid page"); return Number(x); }
  const search = (params.get("search") ?? "").trim(), mode = params.get("missingMode") ?? "any";
  const startOn = params.get("startOn"), endOn = params.get("endOn");
  if (search.length > 160 || !["any", "all"].includes(mode)) throw Error("Invalid search");
  if ((startOn === null) !== (endOn === null) || startOn !== null && endOn !== null && (!day(startOn) || !day(endOn) || endOn < startOn || Date.parse(endOn) - Date.parse(startOn) > 365 * 86400000)) throw Error("Invalid period");
  return { search, riskCategories: list("riskCategories", RISK_CATEGORIES), riskStates: list("riskStates", RISK_STATES), missing: list("missing", ROSTER_MISSING_CODES), missingMode: mode as "any" | "all", page: integer("page", 1, 100), pageSize: integer("pageSize", 25, 50), ...(startOn && endOn ? { startOn, endOn } : {}) };
}
export function filterRoster(read: RosterRead, filters: RosterFilters): RosterRead {
  if (read.page !== 1 || read.rows.length !== read.totalAuthorized || read.totalMatched !== read.totalAuthorized) throw Error("Roster requires complete authorized snapshot");
  const normalize = (s: string) => s.normalize("NFKC").replace(/ي/g, "ی").replace(/ك/g, "ک").toLocaleLowerCase("fa");
  const rows = read.rows.filter(r => (!filters.search || normalize(r.clientLabel).includes(normalize(filters.search))) && (!filters.riskCategories.length || r.risk.category !== null && filters.riskCategories.includes(r.risk.category)) && (!filters.riskStates.length || filters.riskStates.includes(r.risk.state)) && (!filters.missing.length || (filters.missingMode === "all" ? filters.missing.every(c => r.missingCodes.includes(c)) : filters.missing.some(c => r.missingCodes.includes(c)))))
    .sort((a, b) => Date.parse(b.grantedAt) - Date.parse(a.grantedAt) || a.relationshipId.localeCompare(b.relationshipId));
  return { ...read, rows: rows.slice((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize), totalMatched: rows.length, page: filters.page, pageSize: filters.pageSize };
}
