# Current bounded financial/research acceptance

Exact product baseline: `582fba194b2565f6dee046deafbff147bffcf375`.

Adapted from the existing `c62d026f` PR228 lab. Historical reports/receipts are preserved in the original worktree; they are not current acceptance. Only the baseline, distinct image tag and stronger ownership checks changed in the lab. See `evidence-current/adapter-review.json`. No product/schema/permissions changed.

This evidence branch contains only harness/receipt changes. For a rerun, create a fresh separate worktree detached at the exact baseline and copy only the reviewed tracked harness files into it; never copy `.local` directories. The strengthened HEAD guard intentionally rejects running against the later evidence commit. Never copy real `.env`, credentials or dumps. Use only a fresh `.local` manifest and the original owned cleanup. Runtime network must attest internal/defaultRoutes=0, loopback ingress, no bind mounts. The lab uses only synthetic Auth users and newly allocated tmpfs PostgreSQL.

PowerShell from repository root:

```powershell
docker build -f scripts/isolated-e2e/Dockerfile -t isolated-financial-582fba1 .
node scripts/isolated-e2e/lab.mjs up
if ($LASTEXITCODE -ne 0) { throw 'Setup blocked' }
node scripts/isolated-e2e/lab.mjs attest
if ($LASTEXITCODE -ne 0) { throw 'Attestation blocked' }
node scripts/isolated-e2e/api-acceptance.mjs
$acceptanceExit = $LASTEXITCODE
node scripts/isolated-e2e/lab.mjs down
```

Do not rerun the API runner on a populated ledger; its first case requires zero rows. This completed run was cleaned. Archive its ignored `.local` directory before a new `up`; never remove an unreviewed manifest or reset external DBs.

`api-acceptance.mjs` exercises real Auth-issued SSR cookies and Next route handlers, with independently authenticated sessions and direct DB readback. It has no browser driver. The legacy Playwright browser runner cannot be run under this environment's current CUA-only browser instructions and was not invoked. Current UI work was performed through CUA. `ui-readback.mjs` verifies the documented CUA sequence after a separate synthetic UI account is created by real isolated Auth: first manual3g save, reload, select excluded scope, observe both asset/debt saves disabled, confirm scope, observe editor unlock, change optional title and save second financial version. It is not a replacement for performing those CUA actions.

Only reviewed `evidence-current` receipts are shareable. `.local/state.json` and generated `.env` files contain ephemeral synthetic credentials and must never be copied/uploaded. Current result and precise untested scope are in `REPORT.fa.md`.
