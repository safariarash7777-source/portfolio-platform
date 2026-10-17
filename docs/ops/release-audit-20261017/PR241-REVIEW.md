# PR241 independent code and release review — 2026-10-17

Reviewed head: `3755898bb485c085883e8a8b5b453ccd87b2bd87`; Git tree: `5bc32120f6fc05592c23eba4611fa89bd7d9e04f`. Local current main: `582fba194b2565f6dee046deafbff147bffcf375`. No code was changed, no tests repeated, and no relay publication, provider request, refresh, backfill, database write or configuration change was performed by this review.

## Independent result

No actionable code defect found in the exact three-file diff. Two existing title matchers now accept the optional grammatical word «در». Admission continues to require local standalone scope, matching period/months, million-rial units, observed positive capital, compatible columns and identical normalization. The real public Vanovin fixture is used only as a spelling witness; the tests explicitly avoid claiming its generic title proves standalone scope. Positive parser and mocked-engine cases preserve data/write identity; negative cases cover unknown/consolidated/negated scope, unrelated use of independent, wrong period/unit and non-positive capital. Existing engine request limits, failure ledger and watermark behavior are unchanged.

Current main contains no relay-file changes after base `065c293afa9a30ca2bd213c1936abaa92918cb57`. Therefore integration does not require rebasing/retesting an unchanged relay tree. `git diff --check origin/main...HEAD` passed and the lane is clean. The raw GitHub PR response reports draft=true, mergeable=true, mergeable_state=clean. The normalized get_pr_info response's mergeable=false disagrees and should not be used as a conflict finding.

## Validation evidence

- Exact-head CI [39020116133](https://github.com/safariarash7777-source/portfolio-platform/actions/runs/39020116133) completed successfully; no rerun was started.
- The PR description and coordinator's existing COMMAND-CENTER report reused offline parser=86 PASS and cycle=62 PASS, including TAP parent counts; no failure/skip. Their stated tree matches the tree above. Original raw logs were not located in this review, so these remain attributed prior receipts rather than newly inspected raw logs.
- Vercel Preview readiness does not exercise these relay files.

## Read-only publication evidence and its limits

The latest workflow_dispatch publication in the GitHub Actions listing is [38518920086](https://github.com/safariarash7777-source/portfolio-platform/actions/runs/38518920086), created 2026-10-14T05:51:44Z. Job `115703895100` records INPUT_SHA `065c293afa9a30ca2bd213c1936abaa92918cb57`, successful preflight/publication/health/debug acceptance/record steps, image `apps/6a5351feb95bf1e50c1ee34f:copewixp2ed3`, and deployment `7057968732`. This is a historical deployment receipt, not proof that no later external publisher changed the running app.

An unauthenticated read of `https://arsadata.liara.run/healthz` during this review returned HTTP 200 and body `ok`. It proves process health only. No authenticated runtime hash/config/debug observation was obtained in this lane. Current replica count, release image, runtime file bytes and natural-cycle behavior require the operational owner's read-only probe.

Git-blob SHA256 checksums (LF source bytes, not Windows working-copy CRLF):

| File | Target | SHA256 |
| --- | --- | --- |
| relay/codal.mjs | base 065c293 | `695a3522026eeb347f4f5f13ad97d607e420f1118b0e833ddf81ae27a91a6e58` |
| relay/codal.mjs | PR241 head | `1ccf387b26c7a03800b4cef5a385f527e2051fdc39c75c34f865cdf009e0dd5a` |

## Coordinated release requirements

1. Coordinator owns merge and the publication queue. Operational owner first confirms active release/image, one replica and selected sole publisher; compares runtime hashes against the recorded baseline. Keep both optional budget enforcement flags unchanged. Phase28 absence is not an unconditional gate while both flags are off.
2. Preserve current release/rollback image, environment and mutable persisted Codal engine/archive/watermark/failure, candle, NAV blacklist and market/symbol state using the established private backup flow; verify decrypt/hash readback. Do not reset ledger, budgets, caches or watermarks. Include the exact backup receipt and checksums in the coordinator's release record.
3. Mark PR ready and merge through the coordinator queue, wait for successful CI on the exact chosen main target, then dispatch the existing manual Deploy relay workflow for that SHA under the sole publisher lock. This patch requires no migration, new producer or quota increase. Rolling back means publishing the verified preceding image/eligible SHA, preserving newer append-only data and state.
4. Verify release/image and runtime `codal.mjs` hash against the target above, plus process/debug health and retained state. Healthz and generic workflow debug acceptance alone do not prove this parser patch.
5. Observe the next existing natural Codal cycle (default interval three hours; restart startup at ~90 seconds), existing per-stage diagnostics and append-only persistence. An admissible real title with the optional word must produce unchanged qualified data/write identity. Absence of such a report leaves positive live ingestion unproven; synthetic requests/backfill are not acceptance substitutes.

Merging is useful to make the corrected relay artifact eligible for coordinated publication. A web-only deployment changes no parser runtime behavior. Code review is ready; relay release/live acceptance are separate and remain with the coordinator and operational owner.
