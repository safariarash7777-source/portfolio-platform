import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ANALYSIS_STATUSES, ASSET_CLASSES, CLAIM_KINDS, HORIZONS, INTEL_DOMAINS,
  SCENARIO_LABELS, hasCompleteEvidence, hasCompleteReferenceAllocation,
  isScenarioLabelConsistent, isValidConfidence, toAllocationSeries,
  type IntelClaim, type ReferencePosition,
} from "@/lib/intelligence/contracts";

const SQL = readFileSync(join(process.cwd(), "sql", "phase20_intelligence_model.sql"), "utf8");
const statements = SQL.split("\n").filter((line) => !/^\s*--/.test(line)).join("\n");

test("stable domains, assets and horizons are mirrored by SQL checks", () => {
  assert.equal(INTEL_DOMAINS.length, 10);
  assert.equal(ASSET_CLASSES.length, 7);
  for (const value of [...INTEL_DOMAINS, ...ASSET_CLASSES, ...HORIZONS, ...CLAIM_KINDS, ...SCENARIO_LABELS, ...ANALYSIS_STATUSES]) {
    assert.ok(statements.includes(`'${value}'`), `${value} is missing from SQL`);
  }
});

test("confidence and scenario-label rules are explicit", () => {
  assert.ok(isValidConfidence(0) && isValidConfidence(100));
  assert.ok(!isValidConfidence(-1) && !isValidConfidence(50.5) && !isValidConfidence(101));
  assert.ok(isScenarioLabelConsistent("SCENARIO", "base"));
  assert.ok(!isScenarioLabelConsistent("SCENARIO", null));
  assert.ok(isScenarioLabelConsistent("FACT", null));
});

test("multi-source evidence is relational and publication is controlled", () => {
  assert.match(statements, /CREATE TABLE IF NOT EXISTS public\.intel_claim_evidence/i);
  const claimTable = statements.match(/CREATE TABLE IF NOT EXISTS public\.intel_claims\s*\(([\s\S]*?)\n\);/i)?.[1] ?? "";
  assert.ok(claimTable, "intel_claims DDL was not found");
  assert.doesNotMatch(claimTable, /evidence_id/i, "evidence belongs in the join table, not on a claim");
  assert.doesNotMatch(statements, /published_signal_ids/i);
  assert.match(statements, /CREATE OR REPLACE FUNCTION public\.publish_intel_analysis/i);
  const claims = [{ id: "c1" }, { id: "c2" }] as IntelClaim[];
  assert.ok(hasCompleteEvidence(claims, [{ claimId: "c1", evidenceId: "e1" }, { claimId: "c2", evidenceId: "e1" }]));
  assert.ok(!hasCompleteEvidence(claims, [{ claimId: "c1", evidenceId: "e1" }]));
});

test("analysis-to-signal uses a foreign-key join table, never a UUID array", () => {
  assert.match(statements, /CREATE TABLE IF NOT EXISTS public\.intel_analysis_signals/i);
  assert.match(statements, /signal_id\s+uuid\s+NOT NULL REFERENCES public\.signals\(id\)/i);
  assert.doesNotMatch(statements, /published_signal_ids|uuid\[\]/i);
});

test("reference allocation is versioned, complete and maps to runAllocation inputs", () => {
  for (const table of ["intel_reference_portfolios", "intel_reference_versions", "intel_reference_positions"]) {
    assert.ok(statements.includes(`public.${table}`));
  }
  assert.match(statements, /CREATE OR REPLACE FUNCTION public\.finalize_reference_version/i);
  const positions: ReferencePosition[] = [
    { versionId: "v1", assetClass: "equity_ir", weightPct: 45 },
    { versionId: "v1", assetClass: "gold", weightPct: 25 },
    { versionId: "v1", assetClass: "fixed_income", weightPct: 30 },
  ];
  assert.ok(hasCompleteReferenceAllocation(positions));
  assert.ok(!hasCompleteReferenceAllocation([{ ...positions[0], weightPct: 99 }]));
  const allocation = toAllocationSeries(positions, {});
  assert.deepEqual(allocation.map((x) => x.weight), [0.45, 0.25, 0.3]);
});

test("provenance records origin, model identity, hashes, input references and output", () => {
  assert.match(statements, /CREATE TABLE IF NOT EXISTS public\.intel_runs/i);
  assert.match(statements, /CREATE TABLE IF NOT EXISTS public\.intel_run_inputs/i);
  for (const column of ["origin", "actor_id", "model_provider", "model_name", "model_version", "prompt_hash", "config_hash", "status", "output_analysis_id"]) {
    assert.match(statements, new RegExp(`\\b${column}\\b`, "i"));
  }
  assert.doesNotMatch(statements, /prev_hash|record_hash/);
});

test("all append-only relationships and portfolio effects have mutation guards", () => {
  for (const table of ["intel_evidence", "intel_events", "intel_claims", "intel_claim_evidence", "intel_effects", "intel_portfolio_effects", "intel_analysis_signals", "intel_corrections"]) {
    assert.ok(statements.includes(`'${table}'`), `immutable trigger list misses ${table}`);
  }
});

test("authenticated never receives ALL, TRUNCATE or broad schema grants", () => {
  const grants = statements.match(/GRANT[^;]*TO authenticated/gi) ?? [];
  assert.ok(grants.length > 0);
  for (const grant of grants) {
    assert.doesNotMatch(grant, /\bALL\b|\bTRUNCATE\b|ALL TABLES IN SCHEMA/i);
  }
});

