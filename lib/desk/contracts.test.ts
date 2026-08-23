import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DATA_STATE_LABEL,
  DESK_SECTIONS,
  DESK_SECTION_LABEL,
  DESK_SECTION_QUESTION,
  briefPublishBlockReason,
  buildDeskView,
  buildPanel,
  canPublishBrief,
  classifySource,
  deskAgeMinutes,
  isDataFault,
  rollupDeskState,
  summarise,
  worstState,
  type DataState,
  type DeskPanel,
  type DeskSource,
  type SourceSpec,
} from "@/lib/desk/contracts";

const NOW = new Date("2026-07-31T12:00:00Z");
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const RULE = { freshWithinMinutes: 60 };
const SPEC: SourceSpec = { table: "ir_market_snapshots", label: "اسنپ‌شات", rule: RULE };
const NO_RULE: SourceSpec = { table: "intel_reference_positions", label: "موقعیت", rule: null };

test("every declared section has a label and a question it answers", () => {
  // ۶ از ۱۴۰۵/۰۶/۰۱: ناحیهٔ «مشتری و محصول» اضافه شد تا سؤالِ پنجمِ روزِ آرش
  // («چه کسی منتظرِ اقدامِ من است؟») ناحیهٔ خودش را داشته باشد.
  assert.equal(DESK_SECTIONS.length, 6);
  for (const key of DESK_SECTIONS) {
    assert.ok(DESK_SECTION_LABEL[key], `${key} has no label`);
    assert.ok(DESK_SECTION_QUESTION[key]?.includes("؟"), `${key} names no question`);
  }
});

// The whole reason this module exists: an unavailable source and an empty
// source must never collapse into the same state.
test("unavailable and empty are distinct states, never merged", () => {
  const unavailable = classifySource(SPEC, { available: false, count: 0 }, NOW);
  const empty = classifySource(SPEC, { available: true, count: 0 }, NOW);
  assert.equal(unavailable.state, "unavailable");
  assert.equal(empty.state, "empty");
  assert.notEqual(unavailable.state, empty.state);
  assert.match(empty.detail, /خالی|صفر|هیچ رکورد/);
});

test("an unavailable source reports no count at all, while an empty one reports a real zero", () => {
  const unavailable = classifySource(SPEC, { available: false, count: 0 }, NOW);
  const empty = classifySource(SPEC, { available: true, count: 0 }, NOW);
  assert.equal(unavailable.count, null, "«نمی‌توانم بپرسم» نباید صفر شود");
  assert.equal(empty.count, 0, "صفرِ واقعی باید دیده شود");
});

test("an unavailable source keeps its stated reason", () => {
  const result = classifySource(
    SPEC,
    { available: false, count: 0, unavailableReason: "جدول اجرا نشده" },
    NOW
  );
  assert.equal(result.detail, "جدول اجرا نشده");
});

test("freshness splits ready from stale, and age is reported either way", () => {
  const fresh = classifySource(SPEC, { available: true, count: 3, lastAt: ago(10) }, NOW);
  const old = classifySource(SPEC, { available: true, count: 3, lastAt: ago(600) }, NOW);
  assert.equal(fresh.state, "ready");
  assert.equal(fresh.ageMinutes, 10);
  assert.equal(old.state, "stale");
  assert.equal(old.ageMinutes, 600);
});

test("a source with records but genuinely no time dimension is ready, not stale", () => {
  const result = classifySource(NO_RULE, { available: true, count: 4 }, NOW);
  assert.equal(result.state, "ready");
  assert.equal(result.ageMinutes, null);
});

/**
 * نقصِ نسخهٔ اول، حالا بسته: آستانه تعریف شده بود ولی زمانی خوانده نشد، و
 * تابع مؤدبانه «به‌روز» برمی‌گرداند. یک شاخصِ مرده که سبز است از نبودنِ
 * شاخص بدتر است.
 */
test("a source that has a freshness rule but no timestamp is never called ready", () => {
  const result = classifySource(SPEC, { available: true, count: 4, lastAt: null }, NOW);
  assert.equal(result.state, "unavailable");
  assert.equal(result.ageMinutes, null);
  assert.equal(result.count, 4, "شمارشِ معتبر باید حفظ شود");
});

test("a broken timestamp column is reported as a misconfiguration, not as freshness", () => {
  const result = classifySource(SPEC, { available: true, count: 9, timestampBroken: true }, NOW);
  assert.equal(result.state, "unavailable");
  assert.equal(result.ageMinutes, null);
  assert.equal(result.count, 9);
  assert.match(result.detail, /اشتباه پیکربندی/);
  assert.match(result.detail, /ir_market_snapshots/);
});

test("a future timestamp is clamped to zero rather than reported as negative", () => {
  assert.equal(deskAgeMinutes(new Date(NOW.getTime() + 60_000), NOW), 0);
  assert.equal(deskAgeMinutes(null, NOW), null);
  assert.equal(deskAgeMinutes("not a date", NOW), null);
});

// Deliberately not the intuitive order: empty outranks stale because stale data
// existed at least once, and unavailable outranks both because it says nothing
// about reality at all.
test("worst-state ranking puts unavailable above empty above stale above ready", () => {
  assert.equal(worstState(["ready", "stale"]), "stale");
  assert.equal(worstState(["stale", "empty"]), "empty");
  assert.equal(worstState(["empty", "unavailable"]), "unavailable");
  assert.equal(worstState(["ready", "ready"]), "ready");
  assert.equal(worstState([]), "unavailable");
});

test("rollup takes the worst panel", () => {
  const panel = (state: DataState): DeskPanel => ({
    key: "today", label: "x", question: "?", state, detail: "", sources: [], links: [],
  });
  assert.equal(rollupDeskState([panel("ready"), panel("unavailable")]), "unavailable");
  assert.equal(rollupDeskState([]), "unavailable");
});

/**
 * درسِ اصلیِ `P2-G3-MEGA-004`: بخش نباید تازه‌ترین زمانِ منابعش را بردارد.
 * وگرنه یک منبعِ مرده پشتِ همسایهٔ سالمش پنهان می‌شود.
 */
test("a panel takes the worst of its sources, so a dead source is never masked", () => {
  const dead = classifySource(SPEC, { available: true, count: 5, lastAt: ago(3000) }, NOW);
  const alive = classifySource(
    { table: "fx_rates", label: "ارز", rule: RULE },
    { available: true, count: 5, lastAt: ago(5) },
    NOW
  );
  const panel = buildPanel({ key: "today", links: [{ label: "رصد", href: "/admin/radar" }] }, [dead, alive]);
  assert.equal(dead.state, "stale");
  assert.equal(alive.state, "ready");
  assert.equal(panel.state, "stale", "بخش نباید به‌خاطرِ یک منبعِ سالم سبز شود");
});

test("a panel names every asset it read from and always explains itself", () => {
  const sources: DeskSource[] = [
    classifySource(SPEC, { available: true, count: 2, lastAt: ago(5) }, NOW),
    classifySource({ table: "fx_rates", label: "ارز", rule: RULE }, { available: true, count: 0 }, NOW),
  ];
  const panel = buildPanel({ key: "today", links: [] }, sources);
  assert.deepEqual(panel.sources.map((s) => s.table), ["ir_market_snapshots", "fx_rates"]);
  assert.ok(panel.detail.length > 0, "a panel still explains itself");
  assert.ok(panel.sources.every((s) => s.detail.length > 0), "each source explains itself too");
});

test("the summary counts each state separately rather than reporting one verdict", () => {
  const make = (state: DataState): DeskSource => ({
    table: "t", label: "l", state, detail: "", count: null, ageMinutes: null,
    observedAt: null, fetchedAt: "2026-08-23T00:00:00.000Z",
  });
  const text = summarise([make("ready"), make("stale"), make("empty"), make("unavailable")]);
  assert.match(text, /در دسترس نیست/);
  assert.match(text, /کهنه/);
  assert.match(text, /خالی/);
  assert.match(text, /به‌روز/);
  assert.equal(summarise([]), "هیچ منبعی برای این بخش تعریف نشده");
});

test("the view stamps its own generation time and rolls up its panels", () => {
  const panels: DeskPanel[] = [
    { key: "today", label: "a", question: "?", state: "ready", detail: "", sources: [], links: [] },
    { key: "reference", label: "b", question: "?", state: "unavailable", detail: "", sources: [], links: [] },
  ];
  const view = buildDeskView(panels, NOW);
  assert.equal(view.generatedAt, NOW.toISOString());
  assert.equal(view.overall, "unavailable");
  assert.equal(view.panels.length, 2);
});

// DD-023 lives here rather than in the UI so a future page cannot route around it.
test("a brief never publishes straight from internal draft", () => {
  assert.equal(canPublishBrief("internal_draft", true), false);
  assert.equal(canPublishBrief("pending_approval", true), true);
  assert.equal(canPublishBrief("pending_approval", false), false);
  assert.equal(canPublishBrief("published", true), false);
});

test("the publish block always states a reason a human can act on", () => {
  assert.match(briefPublishBlockReason("internal_draft", true) ?? "", /تأیید/);
  assert.match(briefPublishBlockReason("pending_approval", false) ?? "", /ادمین/);
  assert.equal(briefPublishBlockReason("pending_approval", true), null);
});

/* ── واژگانِ متعارفِ هفت‌حالته — P2-INTELLIGENCE-DESK-MEGA-001 ─────────────── */

test("شش ناحیهٔ میز کامل‌اند و «مشتری و محصول» جا افتاده است", () => {
  assert.ok(DESK_SECTIONS.includes("clients"), "ناحیهٔ مشتری و محصول باید وجود داشته باشد");
  for (const key of DESK_SECTIONS) {
    assert.ok(DESK_SECTION_LABEL[key], `برچسبِ ${key}`);
    assert.ok(DESK_SECTION_QUESTION[key], `پرسشِ ${key}`);
  }
});

test("هر هفت حالت برچسبِ فارسی دارند", () => {
  const states: DataState[] = [
    "loading", "ready", "awaiting_review", "unconfigured", "stale", "empty", "unavailable",
  ];
  for (const s of states) {
    assert.ok(DATA_STATE_LABEL[s] && DATA_STATE_LABEL[s].length > 0, s);
  }
});

test("تصمیمِ نگرفته و بازبینیِ نشده خرابیِ داده حساب نمی‌شوند", () => {
  // این تفکیک کلِ دلیلِ وجودِ دو حالتِ تازه است: یک تصمیمِ مالک نباید در نوارِ
  // سلامت مثلِ یک فیدِ خراب دیده شود.
  assert.equal(isDataFault("unconfigured"), false);
  assert.equal(isDataFault("awaiting_review"), false);
  assert.equal(isDataFault("ready"), false);
  assert.equal(isDataFault("loading"), false);

  assert.equal(isDataFault("stale"), true);
  assert.equal(isDataFault("empty"), true);
  assert.equal(isDataFault("unavailable"), true);
});

test("خرابیِ واقعی روی حالتِ انسانی غالب می‌شود، نه برعکس", () => {
  // اگر ترتیب برعکس بود، یک فیدِ مرده پشتِ «منتظرِ بازبینی» پنهان می‌شد.
  assert.equal(worstState(["awaiting_review", "unavailable"]), "unavailable");
  assert.equal(worstState(["unconfigured", "stale"]), "stale");
  assert.equal(worstState(["unconfigured", "empty"]), "empty");
  assert.equal(worstState(["ready", "awaiting_review"]), "awaiting_review");
  assert.equal(worstState(["ready", "unconfigured"]), "unconfigured");
});

test("«در حال دریافت» گذراست و خرابیِ واقعی را نمی‌پوشاند", () => {
  assert.equal(worstState(["loading", "unavailable"]), "unavailable");
  assert.equal(worstState(["loading", "stale"]), "stale");
  assert.equal(worstState(["loading", "ready"]), "loading");
});

test("هر منبع ساعتِ خودش را حمل می‌کند", () => {
  const now = new Date("2026-08-23T10:00:00.000Z");
  const src = classifySource(
    { table: "ir_market_snapshots", label: "اسنپ‌شات", rule: { freshWithinMinutes: 60 } },
    { available: true, count: 5, lastAt: "2026-08-23T09:30:00.000Z" },
    now
  );
  assert.equal(src.observedAt, "2026-08-23T09:30:00.000Z", "زمانِ خودِ داده");
  assert.equal(src.fetchedAt, "2026-08-23T10:00:00.000Z", "زمانِ پرسیدنِ ما");
  assert.notEqual(src.observedAt, src.fetchedAt, "این دو یک چیز نیستند");
});

test("منبعِ بی‌زمان «اکنون» را جعل نمی‌کند", () => {
  const now = new Date("2026-08-23T10:00:00.000Z");
  const src = classifySource(
    { table: "leads", label: "لید", rule: null },
    { available: true, count: 3, lastAt: null },
    now
  );
  assert.equal(src.observedAt, null, "نبودِ زمان یعنی null، نه اکنون");
  assert.equal(src.fetchedAt, "2026-08-23T10:00:00.000Z");
});

test("ستونِ زمانیِ شکسته، زمانِ مشاهده را جعل نمی‌کند", () => {
  const now = new Date("2026-08-23T10:00:00.000Z");
  const src = classifySource(
    { table: "t", label: "l", rule: { freshWithinMinutes: 60 } },
    { available: true, count: 9, lastAt: "2026-08-23T09:00:00.000Z", timestampBroken: true },
    now
  );
  assert.equal(src.state, "unavailable");
  assert.equal(src.observedAt, null, "وقتی ستون خوانده نشد، زمان قابلِ دانستن نیست");
  assert.equal(src.count, 9, "شمارشِ معتبر حفظ می‌شود");
});

test("منبعِ در دسترس نبودن، هیچ زمانی ادعا نمی‌کند", () => {
  const now = new Date("2026-08-23T10:00:00.000Z");
  const src = classifySource(
    { table: "leads", label: "لید", rule: null },
    { available: false, count: 0, unavailableReason: "جدول وجود ندارد" },
    now
  );
  assert.equal(src.state, "unavailable");
  assert.equal(src.observedAt, null);
  assert.equal(src.count, null, "شمارشِ نخوانده null است، نه صفر");
});
