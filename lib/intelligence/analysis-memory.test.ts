import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildAnalysisMemory, OUTCOME_LABEL, type RealizedOutcome } from "./analysis-memory";
import type {
  IntelAnalysis, IntelClaim, IntelClaimEvidence, IntelEffect, IntelEvidence, IntelSource,
} from "./contracts";

const an = (id: string, o: Partial<IntelAnalysis> = {}): IntelAnalysis => ({
  id, domain: "fx_gold", title: `تحلیل ${id}`, bodyMd: "متن", status: "published",
  decisionNote: null, createdBy: "arash", approvedBy: "arash",
  approvedAt: "2026-08-20T00:00:00.000Z", publishedAt: "2026-08-20T00:00:00.000Z", ...o,
});
const cl = (id: string, analysisId: string, o: Partial<IntelClaim> = {}): IntelClaim => ({
  id, analysisId, eventId: null, kind: "FACT", statement: "گزاره", confidence: 70, scenarioLabel: null, ...o,
});
const evi = (id: string, sourceId: string): IntelEvidence => ({
  id, sourceId, excerpt: "م", contentUrl: null,
  observedAt: "2026-08-20T00:00:00.000Z", publishedAt: null, contentHash: `H-${id}`,
});
const src = (id: string, o: Partial<IntelSource> = {}): IntelSource => ({
  id, kind: "official", name: id, url: null, trustTier: "primary",
  approved: true, approvedBy: "arash", approvedAt: "2026-08-01T00:00:00.000Z", ...o,
});
const ce = (claimId: string, evidenceId: string): IntelClaimEvidence => ({ claimId, evidenceId });
const eff = (id: string, analysisId: string, targetKey: string): IntelEffect => ({
  id, analysisId, eventId: null, target: "asset_class", targetKey,
  direction: "up", magnitudeBand: "medium", horizon: "short_term", confidence: 60,
});

/** یک تحلیلِ کاملاً سالم — پایهٔ مقایسه. */
const healthy = () => ({
  analyses: [an("a1")],
  claims: [cl("c1", "a1")],
  links: [ce("c1", "v1")],
  evidence: [evi("v1", "s1")],
  sources: [src("s1")],
  effects: [eff("f1", "a1", "gold")],
});

describe("ردِ تحلیل از شاهد تا اثر", () => {
  test("تحلیلِ سالم مانعِ شاهدی ندارد", () => {
    const h = healthy();
    const m = buildAnalysisMemory(h.analyses, h.claims, h.links, h.evidence, h.sources, h.effects);
    assert.equal(m.traces[0].evidenceBlockReason, null);
    assert.equal(m.traces[0].state, "ready");
    assert.equal(m.blockedByEvidence, 0);
  });

  test("دارایی‌های متأثر از اثرهای ثبت‌شده می‌آیند، نه از حدس", () => {
    const h = healthy();
    const m = buildAnalysisMemory(
      h.analyses, h.claims, h.links, h.evidence, h.sources,
      [eff("f1", "a1", "gold"), eff("f2", "a1", "equity_ir"), eff("f3", "other", "cash")]
    );
    assert.deepEqual(m.traces[0].affectedAssets, ["equity_ir", "gold"]);
  });

  test("انواعِ گزاره جدا شمرده می‌شوند", () => {
    const h = healthy();
    const m = buildAnalysisMemory(
      h.analyses,
      [cl("c1", "a1"), cl("c2", "a1", { kind: "INFERENCE" }), cl("c3", "a1", { kind: "SCENARIO", scenarioLabel: "base" })],
      [ce("c1", "v1"), ce("c2", "v1"), ce("c3", "v1")],
      h.evidence, h.sources, h.effects
    );
    const t = m.traces[0];
    assert.equal(t.factCount, 1);
    assert.equal(t.inferenceCount, 1);
    assert.equal(t.scenarioCount, 1);
  });
});

describe("کیفیتِ شاهد مانعِ انتشار است", () => {
  test("گزارهٔ بدونِ شاهد جلوی انتشار را می‌گیرد", () => {
    const h = healthy();
    const m = buildAnalysisMemory(
      h.analyses, [cl("c1", "a1"), cl("c2", "a1")], [ce("c1", "v1")],
      h.evidence, h.sources, h.effects
    );
    assert.equal(m.traces[0].unsupportedClaims, 1);
    assert.match(m.traces[0].evidenceBlockReason!, /شاهد ندارد/);
    assert.equal(m.traces[0].state, "awaiting_review", "منتشرشده باشد هم، بدونِ شاهد آماده نیست");
  });

  test("تحلیلِ بدونِ هیچ گزاره‌ای منتشر نمی‌شود", () => {
    const m = buildAnalysisMemory([an("a1")], [], [], [], [], []);
    assert.match(m.traces[0].evidenceBlockReason!, /هیچ گزاره‌ای/);
  });

  test("شاهد از منبعِ تأییدنشده کافی نیست", () => {
    const h = healthy();
    const m = buildAnalysisMemory(
      h.analyses, h.claims, h.links, h.evidence,
      [src("s1", { approved: false, approvedBy: null, approvedAt: null })], h.effects
    );
    assert.match(m.traces[0].evidenceBlockReason!, /منبعِ تأییدشده/);
  });

  test("پستِ خامِ شبکه هرگز «تحلیلِ مستند» برچسب نمی‌خورد", () => {
    const h = healthy();
    const m = buildAnalysisMemory(
      h.analyses, h.claims, h.links, h.evidence,
      [src("s1", { kind: "telegram", trustTier: "unverified" })], h.effects
    );
    assert.equal(m.traces[0].socialOnlySourcing, true);
    assert.match(m.traces[0].evidenceBlockReason!, /سرنخ هست، تحلیلِ مستند نیست/);
    assert.equal(m.blockedByEvidence, 1);
  });

  test("شبکه در کنارِ منبعِ رسمی مانع نیست", () => {
    const m = buildAnalysisMemory(
      [an("a1")], [cl("c1", "a1")], [ce("c1", "v1"), ce("c1", "v2")],
      [evi("v1", "s1"), evi("v2", "s2")],
      [src("s1", { kind: "telegram", trustTier: "unverified" }), src("s2", { kind: "official" })],
      []
    );
    assert.equal(m.traces[0].socialOnlySourcing, false);
    assert.equal(m.traces[0].evidenceBlockReason, null);
  });
});

describe("چهار حالتِ کارنامه از هم جدا می‌مانند", () => {
  const h = healthy();
  const run = (status: IntelAnalysis["status"], outcomes: RealizedOutcome[] = []) =>
    buildAnalysisMemory([an("a1", { status })], h.claims, h.links, h.evidence, h.sources, h.effects, outcomes)
      .traces[0];

  test("بدونِ نتیجهٔ ثبت‌شده «باز» است — نه «درست»", () => {
    assert.equal(run("published").outcome, "open");
  });

  test("در انتظارِ تأیید «منتظرِ بازبینی» است، نه «باز»", () => {
    assert.equal(run("pending_approval").outcome, "awaiting_review");
  });

  test("«بسته‌شده» و «باطل‌شده» یکی نیستند", () => {
    const closed = run("published", [{ analysisId: "a1", kind: "closed", note: "ن", recordedAt: "2026-08-22T00:00:00.000Z" }]);
    const invalid = run("published", [{ analysisId: "a1", kind: "invalidated", note: "ن", recordedAt: "2026-08-22T00:00:00.000Z" }]);
    assert.equal(closed.outcome, "closed");
    assert.equal(invalid.outcome, "invalidated");
    assert.notEqual(closed.outcomeLabel, invalid.outcomeLabel);
  });

  test("شمارشِ کلی با مجموعِ حالت‌ها می‌خواند", () => {
    const m = buildAnalysisMemory(
      [an("a1"), an("a2", { status: "pending_approval" }), an("a3")],
      [cl("c1", "a1"), cl("c2", "a2"), cl("c3", "a3")],
      [ce("c1", "v1"), ce("c2", "v1"), ce("c3", "v1")],
      [evi("v1", "s1")], [src("s1")], [],
      [{ analysisId: "a3", kind: "invalidated", note: "ن", recordedAt: "2026-08-22T00:00:00.000Z" }]
    );
    assert.equal(m.open + m.closed + m.invalidated + m.awaitingReview, m.traces.length);
    assert.equal(m.awaitingReview, 1);
    assert.equal(m.invalidated, 1);
    assert.equal(m.open, 1);
  });

  test("هر چهار حالت برچسبِ فارسیِ متمایز دارند", () => {
    const labels = Object.values(OUTCOME_LABEL);
    assert.equal(new Set(labels).size, labels.length);
  });
});

describe("زبان و ورودیِ خالی", () => {
  test("هیچ واژهٔ اجرایی تولید نمی‌شود", () => {
    const h = healthy();
    const text = JSON.stringify(buildAnalysisMemory(h.analyses, h.claims, h.links, h.evidence, h.sources, h.effects));
    for (const banned of ["سیگنال", "توصیه", "بخرید", "بفروشید", "تضمین"]) {
      assert.ok(!text.includes(banned), banned);
    }
  });

  test("ورودیِ خالی خطا نمی‌دهد", () => {
    const m = buildAnalysisMemory([], [], [], [], [], []);
    assert.deepEqual(m.traces, []);
    assert.equal(m.blockedByEvidence, 0);
  });
});
