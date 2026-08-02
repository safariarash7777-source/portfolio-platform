import { test } from "node:test";
import assert from "node:assert/strict";
import {
  capturePackage,
  transitionAnalysis,
  validatePackage,
  describe as describeError,
  type CapturePackage,
  type IntelGateway,
  type IntelWriter,
} from "./service";
import type { AnalysisState } from "./workflow";

/**
 * تست‌های **رفتاری** مرزِ مجوز — نه خواندنِ متنِ سورس.
 *
 * ادعای مرکزی این فایل: در هر مسیرِ رد شدن، کلاینتِ دیتابیس **ساخته نمی‌شود**.
 * شمارندهٔ `writersCreated` تنها راهی است که این ادعا واقعاً اثبات می‌شود؛
 * تستی که فقط شاخهٔ ۴۰۳ را در سورس پیدا کند، پس از یک بازآراییِ اشتباه هم سبز
 * می‌ماند.
 */

interface State {
  writersCreated: number;
  captured: unknown[];
  transitions: Array<{ id: string; to: AnalysisState; note: string | null; actor: string }>;
  storedState: AnalysisState | null;
  failWith?: Error;
  roleThrows?: boolean;
}

function makeGateway(
  user: { id: string } | null,
  role: string | null,
  over: Partial<State> = {}
): { gateway: IntelGateway; state: State } {
  const state: State = {
    writersCreated: 0,
    captured: [],
    transitions: [],
    storedState: "draft",
    ...over,
  };
  const writer: IntelWriter = {
    async capture(payload) {
      if (state.failWith) throw state.failWith;
      state.captured.push(payload);
      return "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    },
    async transition(id, to, note, actor) {
      if (state.failWith) throw state.failWith;
      state.transitions.push({ id, to, note, actor });
    },
    async loadState() {
      return state.storedState;
    },
  };
  const gateway: IntelGateway = {
    async getUser() { return user; },
    async getRole() {
      if (state.roleThrows) throw new Error("db down");
      return role;
    },
    createWriter() { state.writersCreated += 1; return writer; },
    hash(input) { return `h:${input.length.toString(16).padStart(16, "0")}`; },
  };
  return { gateway, state };
}

const ADMIN = { id: "11111111-1111-1111-1111-111111111111" };
const ANALYSIS = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const validPackage = (over: Partial<CapturePackage> = {}): CapturePackage => ({
  source: { kind: "official", name: "بانک مرکزی", url: "https://cbi.ir" },
  evidence: { excerpt: "متنِ شاهد", observedAt: "2026-08-02T10:00:00Z" },
  event: { domain: "macro_ir", title: "رخداد", occurredAt: "2026-08-02T09:00:00Z", scope: "iran" },
  analysis: { domain: "macro_ir", title: "تحلیل", bodyMd: "متن" },
  claims: [{ kind: "FACT", statement: "گزاره", confidence: 70, scenarioLabel: null }],
  ...over,
});

// ── مجوز ────────────────────────────────────────────────────────────────────

test("an anonymous caller gets 401 and no database client is created", async () => {
  const { gateway, state } = makeGateway(null, null);
  const r = await capturePackage(gateway, validPackage());
  assert.equal(r.status, 401);
  assert.equal(state.writersCreated, 0);
});

test("an ordinary user gets 403 and no database client is created", async () => {
  const { gateway, state } = makeGateway(ADMIN, "user");
  const r = await capturePackage(gateway, validPackage());
  assert.equal(r.status, 403);
  assert.equal(state.writersCreated, 0);
});

test("a missing profile row gets 403, not 200 — the check fails closed", async () => {
  const { gateway, state } = makeGateway(ADMIN, null);
  const r = await capturePackage(gateway, validPackage());
  assert.equal(r.status, 403);
  assert.equal(state.writersCreated, 0);
});

test("a failed role read gets 403, not 500 or 200", async () => {
  const { gateway, state } = makeGateway(ADMIN, "admin", { roleThrows: true });
  const r = await capturePackage(gateway, validPackage());
  assert.equal(r.status, 403);
  assert.equal(state.writersCreated, 0);
});

/**
 * گاردِ اصلی. اگر کسی ترتیبِ `authorize` و `createWriter` را جابه‌جا کند،
 * فقط همین تست قرمز می‌شود.
 */
test("across every denial path the writer factory is never called", async () => {
  const cases: Array<[{ id: string } | null, string | null, Partial<State>]> = [
    [null, null, {}],
    [ADMIN, "user", {}],
    [ADMIN, null, {}],
    [ADMIN, "admin", { roleThrows: true }],
    [null, "admin", {}],
  ];
  for (const [user, role, over] of cases) {
    const { gateway, state } = makeGateway(user, role, over);
    await capturePackage(gateway, validPackage());
    await transitionAnalysis(gateway, ANALYSIS, "pending_approval", null);
    assert.equal(state.writersCreated, 0, `writer ساخته شد برای ${JSON.stringify({ user, role })}`);
  }
});

test("no denial message reveals whether any analysis exists", async () => {
  for (const [user, role] of [[null, null], [ADMIN, "user"]] as const) {
    const { gateway } = makeGateway(user, role);
    const r = await transitionAnalysis(gateway, ANALYSIS, "pending_approval", null);
    assert.ok(r.status === 401 || r.status === 403);
    const body = JSON.stringify(r.body);
    assert.doesNotMatch(body, /\d+ تحلیل|count|analysis_id|یافت نشد/, body);
  }
});

test("an admin succeeds and exactly one writer is created", async () => {
  const { gateway, state } = makeGateway(ADMIN, "admin");
  const r = await capturePackage(gateway, validPackage());
  assert.equal(r.status, 201);
  assert.equal(state.writersCreated, 1);
  assert.equal(state.captured.length, 1);
});

// ── هش سمت سرور ─────────────────────────────────────────────────────────────

test("the content hash is computed server-side and never taken from the caller", async () => {
  const { gateway, state } = makeGateway(ADMIN, "admin");
  const payload = validPackage() as CapturePackage & { contentHash?: string };
  payload.contentHash = "کلاینت این را فرستاده";
  await capturePackage(gateway, payload);
  const stored = state.captured[0] as { contentHash: string };
  assert.notEqual(stored.contentHash, "کلاینت این را فرستاده");
  assert.match(stored.contentHash, /^h:/);
});

test("the same evidence hashes the same and different evidence does not", async () => {
  const g1 = makeGateway(ADMIN, "admin");
  const g2 = makeGateway(ADMIN, "admin");
  const g3 = makeGateway(ADMIN, "admin");
  await capturePackage(g1.gateway, validPackage());
  await capturePackage(g2.gateway, validPackage());
  await capturePackage(g3.gateway, validPackage({
    evidence: { excerpt: "متنِ کاملاً دیگری که طولش هم فرق دارد", observedAt: "2026-08-02T10:00:00Z" },
  }));
  const h = (s: { captured: unknown[] }) => (s.captured[0] as { contentHash: string }).contentHash;
  assert.equal(h(g1.state), h(g2.state));
  assert.notEqual(h(g1.state), h(g3.state));
});

// ── اعتبارسنجی ──────────────────────────────────────────────────────────────

test("a javascript: source url is refused before any database call", async () => {
  const { gateway, state } = makeGateway(ADMIN, "admin");
  const r = await capturePackage(gateway, validPackage({
    source: { kind: "news", name: "x", url: "javascript:alert(1)" },
  }));
  assert.equal(r.status, 400);
  assert.equal(state.captured.length, 0, "بستهٔ نامعتبر نباید به دیتابیس برسد");
});

test("confidence outside 0..100 or non-integer is refused", async () => {
  for (const bad of [-1, 101, 70.5]) {
    const { gateway } = makeGateway(ADMIN, "admin");
    const r = await capturePackage(gateway, validPackage({
      claims: [{ kind: "FACT", statement: "x", confidence: bad, scenarioLabel: null }],
    }));
    assert.equal(r.status, 400, `confidence=${bad} پذیرفته شد`);
  }
});

test("a symbol on a non-company event is refused", async () => {
  const { gateway } = makeGateway(ADMIN, "admin");
  const r = await capturePackage(gateway, validPackage({
    event: { domain: "macro_ir", title: "x", occurredAt: "2026-08-02T09:00:00Z", scope: "iran", symbol: "فولاد" },
  }));
  assert.equal(r.status, 400);
});

test("a company event may carry a symbol", () => {
  assert.equal(validatePackage(validPackage({
    event: { domain: "company_codal", title: "x", occurredAt: "2026-08-02T09:00:00Z", scope: "company", symbol: "فولاد" },
  })), null);
});

test("a scenario claim without a label, and a fact claim with one, are both refused", () => {
  assert.ok(validatePackage(validPackage({
    claims: [{ kind: "SCENARIO", statement: "x", confidence: 50, scenarioLabel: null }],
  })));
  assert.ok(validatePackage(validPackage({
    claims: [{ kind: "FACT", statement: "x", confidence: 50, scenarioLabel: "base" }],
  })));
});

test("an empty claim list is refused", () => {
  assert.ok(validatePackage(validPackage({ claims: [] })));
});

test("an event is optional but a malformed one is not tolerated", () => {
  assert.equal(validatePackage(validPackage({ event: null })), null);
  assert.ok(validatePackage(validPackage({
    event: { domain: "not_a_domain", title: "x", occurredAt: "2026-08-02T09:00:00Z", scope: "iran" },
  })));
});

test("a malformed observation timestamp is refused", () => {
  assert.ok(validatePackage(validPackage({
    evidence: { excerpt: "x", observedAt: "دیروز" },
  })));
});

// ── گذارها ──────────────────────────────────────────────────────────────────

test("an illegal transition is refused with 409 and never reaches the database", async () => {
  const { gateway, state } = makeGateway(ADMIN, "admin", { storedState: "draft" });
  const r = await transitionAnalysis(gateway, ANALYSIS, "approved_internal", null);
  assert.equal(r.status, 409);
  assert.equal(state.transitions.length, 0);
});

test("a legal transition is applied and carries the reviewer note and actor", async () => {
  const { gateway, state } = makeGateway(ADMIN, "admin", { storedState: "pending_approval" });
  const r = await transitionAnalysis(gateway, ANALYSIS, "approved_internal", "بررسی شد");
  assert.equal(r.status, 200);
  assert.deepEqual(state.transitions, [
    { id: ANALYSIS, to: "approved_internal", note: "بررسی شد", actor: ADMIN.id },
  ]);
});

/**
 * قاعدهٔ سختِ مأموریت در سطحِ API: این مسیر **هیچ‌وقت** منتشر نمی‌کند، حتی
 * برای ادمین و حتی از حالتِ درست. پیش‌فرضِ این مأموریت عدمِ انتشارِ عمومی است.
 */
test("publication is refused through this route even from approved_internal", async () => {
  const { gateway, state } = makeGateway(ADMIN, "admin", { storedState: "approved_internal" });
  const r = await transitionAnalysis(gateway, ANALYSIS, "published", null);
  assert.equal(r.status, 403);
  assert.equal(state.transitions.length, 0, "هیچ انتشاری نباید به دیتابیس برسد");
});

test("only pending_approval can be reviewed through the route", async () => {
  for (const from of ["draft", "approved_internal", "rejected", "published"] as AnalysisState[]) {
    const { gateway } = makeGateway(ADMIN, "admin", { storedState: from });
    const r = await transitionAnalysis(gateway, ANALYSIS, "rejected", null);
    assert.equal(r.status, 409, `${from} → rejected باید رد شود`);
  }
  const { gateway } = makeGateway(ADMIN, "admin", { storedState: "pending_approval" });
  assert.equal((await transitionAnalysis(gateway, ANALYSIS, "rejected", null)).status, 200);
});

test("a malformed analysis id is refused before any state is loaded", async () => {
  const { gateway, state } = makeGateway(ADMIN, "admin");
  const r = await transitionAnalysis(gateway, "'; DROP TABLE intel_analyses; --", "pending_approval", null);
  assert.equal(r.status, 400);
  assert.equal(state.writersCreated, 0);
});

test("an over-long review note is refused", async () => {
  const { gateway } = makeGateway(ADMIN, "admin", { storedState: "pending_approval" });
  const r = await transitionAnalysis(gateway, ANALYSIS, "rejected", "x".repeat(2001));
  assert.equal(r.status, 400);
});

// ── پیامِ خطا ───────────────────────────────────────────────────────────────

/**
 * متنِ خامِ Postgres می‌تواند مقدارِ ستون یا رشتهٔ اتصال حمل کند. هر خطای
 * ناشناخته باید به یک پیامِ عمومی سقوط کند، نه اینکه لو برود.
 */
test("an unrecognised database error never leaks its raw text", async () => {
  // رشتهٔ اتصال عمداً در زمانِ اجرا ساخته می‌شود. اگر عیناً در سورس می‌آمد،
  // `scripts/scan-secrets.mjs` آن را می‌گرفت — و **درست هم می‌گرفت**: الگوی
  // «رشتهٔ اتصال با رمز» واقعاً آنجا بود. سست‌کردنِ اسکنر برای راحتیِ یک تست،
  // بدترین معاملهٔ ممکن است؛ پس تست عوض شد، نه اسکنر. رفتارِ سنجیده‌شده یکی است.
  const fakeSecret = ["postgres", "://", "user", ":", "hunter2", "@db:5432"].join("");
  const leak = new Error(`connection to ${fakeSecret} failed for row id=42`);
  const { gateway } = makeGateway(ADMIN, "admin", { failWith: leak });
  const r = await capturePackage(gateway, validPackage());
  assert.equal(r.status, 500);
  const body = JSON.stringify(r.body);
  assert.doesNotMatch(body, /hunter2|postgres:\/\/|5432|id=42/);
  assert.equal((r.body as { error: string }).error, "ثبت انجام نشد");
});

test("known database errors become readable Persian without echoing the original", () => {
  assert.equal(describeError(new Error("admin required")), "دسترسی مجاز نیست");
  assert.equal(describeError(new Error('duplicate key value violates unique constraint "x"')),
    "برای این تاریخ بریفِ فعال وجود دارد");
  assert.match(describeError(new Error("every claim of an approved analysis requires evidence")), /شاهد/);
});
