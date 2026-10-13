# Data pipeline follow-up — 2026-10-13

This follow-up uses three temporary development helpers (relay/runtime, Codal,
and IME storage), with parent integration and cross-review. These are not website
agents. No model runtime, agent scheduler, new collector, or automatic publication
has been activated.

## Verified current distinction

The website changes in PR #230 were merged and browser-checked on the main
deployment. This follow-up addresses remaining collector/storage defects. Its
code is a release candidate until the relay and database changes are installed
and their natural collection cycles verified. A successful web deployment does
not deploy the separate Liara relay or install SQL.

- Codal's previous single read stopped at the Data API's 1,000-row cap. A bounded
  read of the same 200-symbol universe returned 5,200 rows. Consequently 112
  symbols with at least eight stored reports were incorrectly eligible for
  backfill. The correction paginates by descending ID and rejects incomplete
  reads. Stored row count still does not prove correct financial extraction.
- Commodity mapping now preserves missing/invalid values as null rather than
  silently converting them to zero. Valid zero and source units are retained.
- IME storage preparation adds explicit minimal grants, RLS checks, append-only
  guards including TRUNCATE, and atomic installation that refuses existing
  history objects. It does not create a second storage model or rewrite history.
- The candidate certificate writer uses each quote's source date, rejects missing
  or future source dates, and cannot relabel an overnight retained quote as today.
  Physical collection now separates the attempted day from successful completion;
  failed storage does not advance its cursor or increase same-day provider calls.
- Cross-review removed a proposed null-equal physical-trade constraint because it
  could discard distinguishable rows. Existing nullable identity semantics remain;
  duplicates under null fields need a provider identity contract. Disposable test
  databases use random names and are removed only if created by that test run.

See [Codal evidence](codal-coverage-followup.md),
[relay reconciliation](RELAY-RECONCILIATION.md), and
[IME installation runbook](../RELEASE-ime-storage.md).

## Why live closure remains open

1. Active Liara release is v49; v50 failed. Four runtime file hashes match the
   older relay, and source-clock retention code is absent. Review the selected
   delta and preserve config/cache/rollback before replacing this runtime.
2. The separate commodity feed credential is absent from active configuration.
   Installing code cannot supply that missing configuration. No key value is
   recorded here, and the main market key was not substituted.
3. The budget lease RPC is missing and an authoritative provider daily balance
   has not been established. Codal archive usage was 198/200 at observation time;
   no forced refresh or bulk recovery was run.
4. Installing IME tables beneath the old certificate writer would allow retained
   quotes to be labelled with the current wall-clock day. Storage installation
   must follow verification of the source-date writer, not precede it.
5. A fresh custom database dump and encrypted copy were created privately on the
   database host. Both checksums and archive listing passed. This backup has not
   been restore-tested, so it is not a completed migration prerequisite. No live
   migration or data mutation was performed.

## Website agent status and next sequence

`lib/intelligence/agent-readiness.ts` explicitly reports runtime missing: the
existing role map/readiness UI has neither model calls nor a scheduler.
`PRODUCT-BLUEPRINT.md` Gate 4 starts with one Research & Market Monitoring Agent.
The existing stages are monitor → source-linked evidence → draft analysis;
approval, sensitive publication and portfolio mutation remain outside its powers.

1. Complete the above data release, validate source dates/units/nulls and compare
   database receipts with actual cards over natural cycles.
2. Use the existing research workbook, approval queue and analysis memory rather
   than building parallel models. Specify the first agent's read tools, evidence
   contract, qualitative inputs from deterministic calculations, evaluation cases,
   failure behavior and human correction workflow.
3. Resolve the existing open source and model/access/budget decisions D-022 and
   D-023; do not mark them approved merely because a plugin is installed.
4. Build and evaluate an inactive/shadow draft-producing runtime first. Test on
   real approved examples with provenance and invalidation conditions. Learning
   initially means reviewed feedback and versioned knowledge/evaluation updates,
   not unreviewed self-modification.
5. Add the lower-cost user-support role after the research workflow is accepted,
   with existing member permissions and escalation boundaries. Activation remains
   a separate step; the user's current no-activation instruction remains in force.

This is implementation sequencing for the existing product plan, not a claim
that the planned five-role team has been built or accepted.
