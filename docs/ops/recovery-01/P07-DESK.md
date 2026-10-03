# RECOVERY-01 — P07 desk readiness

2026-10-03. NOT_READY for current main-site delivery. No real DB write, service or deployment by P07. P00 owns the final release manifest, backup/restore compatibility and installation.

## Baseline and reused fix

Owner instruction read in full; SHA256 `7BCC9DE9DA825CEF1900F53227C80952CD0ECB553C8632D99EE17E3722BE14D5` verified against `RECOVERY-01-arash-site.md` supplied by the coordinator. Production association of `51fd0661d48d791ce8758a87828a81ce72cac6df` is from that instruction; local Git source inspected, not a fresh deployment/DB inventory.

At 51fd, `/admin/desk` renders `ArashCommandDesk`; `ResearchWorkbook` is local state/file export only. The workbook server route/store/phase34 SQL, P07ManualDesk and PublicationWorkbench are absent from this source tree. Therefore applying PR220 alone cannot establish a usable persisted desk on this baseline. Keep the current public shell and admin desk appearance; do not automatically install whole PR206/177/188/199.

PR220 is reused, not rewritten: `f0857a8898120cf0c6e7a9cac9021a7b4c6c9806`, stacked on PR206@051ca87. Exact CI37112044200 completed SUCCESS, all five jobs verified (quality111171681333, database111171681416, secrets/SQL111171681429, dependencies111171681502, gate111172110087). Local34 PASS/0 FAIL/0 SKIP, typecheck, targeted lint, static React4 and secrets1320 PASS. Its product patch is the import/use of existing p07ReviewCurrent. Installed cfa is unchanged.

## Minimum dependency and appearance boundary

For workbook persistence: existing `ResearchWorkbook` server controls + `workbook-store`/admin API and its tests, the research route parameter support, and phase34 versions/reviews/guard/RLS/grants. Phase34 depends on existing Auth/profiles; all real prerequisites must be checked by P00 on the actual destination. Sandbox18 migrations are not Production installation evidence.

For a member publication lifecycle: `publication` command/parser + admin server/HTTP/API/PublicationWorkbench and existing canonical publication queue schema/functions. Queue SQL requires phase34 and the seasonal/cohort prerequisite. Publication feed/member reader/distribution are separate dependencies; they must not be silently bundled just to make a desk screen render. If unavailable, expose saved research with an explicit publication limitation.

For private preparation: implemented optional typed allowlisted privatePreparation in the SAME workbook body; intake/claims/ambiguities and evidence remain bound to the immutable workbook version. A bounded collapsible field group is embedded in the existing ResearchWorkbook, preserving its card styling. No P07ManualDesk/ArashCommandDesk/route/shell change in this correction, additional table/ledger or new composer. Canonical intake parsing and current-review helper were moved unchanged in purpose into small pure modules, re-exported to existing P07 callers, so the runtime closure has no publication/cohort dependency. This remains an isolated implementation/test track pending P00 installation and final manifest.

`P07_PRIVATE_PREPARATION_ENABLED` defaults off in the existing admin route. The upgraded server rejects private save/review while off and returns writer capability to the admin UI, which explicitly says not ready. The enabled upgraded writer rejects old-client metadata omission with409 and retains existing bodies; malformed/unknown contract is rejected, never silently stripped. Private original text retains exact whitespace and bounded length. Structural approval includes incomplete private preparation, but booleans are human checklist entries and never a grant or approval. Member publication continues its explicit public-body allowlist.

51fd→base206 also changes ArashCommandDesk and the desk page; those broad changes are not a minimal required patch. The patch set must preserve the 51fd shell and mount only necessary existing research controls, with before/after390/1440 visual evidence. Public appearance and synthetic-sample gating remain separate P00 checks.

## Newly discovered Native re-approval prerequisite

Phase34 line54 defines `research_workbook_reviews_one_approval`: UNIQUE(version_id) WHERE decision='approved_internal'. No current checkout migration removes it. Thus same-version approve→return→reapprove can hit23505/409 even though the synthetic fixture allows201. PR220 fixes the UI badge correctly; local re-approval201 is NOT a Native re-approval receipt. The earlier source/fixture triage is supplemented by this SQL finding.

P00 selected the fresh-version path. After an approved version is returned, same-version approval is disabled and an explicit «ایجاد نسخهٔ تازه برای بازبینی» action copies through the existing save/baseVersion CAS. It creates n+1 with zero reviews; the human then explicitly confirms its approval. Original reviews and one_approval index are preserved. The synthetic fixture now models this uniqueness instead of falsely allowing same-version reapproval. SQL regression was added to the existing phase34 integration test for private RLS, original approval+return, repeated-approval rejection, fresh version, stale-base conflict and fresh approval. SQL/schema were not changed or installed by P07.

P00 actual catalog witness `P00-PRODUCTION-SCHEMA.json` at2026-10-03T09:38:24Z was read: destination used by current main site has profiles/entitlements with RLS; workbook versions/reviews and approval index are absent. The container name includes stage but this is NOT a synthetic permission to write. Therefore phase34 installation remains a real additive prerequisite under P00 backup/restore. This observation supersedes the earlier UNKNOWN existence, not the missing installation/acceptance.

## Rollback and acceptance gates

Old parsers ignore privatePreparation and could silently omit it on a new save. An old-code rollback therefore requires an independently enforced write freeze/read-only mode for workbook writes, not simply flipping a flag the old binary does not know. The upgraded writer must also reject metadata-dropping writes from an older client. Do not restore by deleting version history. Freeze writes first, retain backup and all new bodies, restore a compatible reader/writer, then resume only after preservation checks.

NOT_READY reasons: final release manifest and phase34 installation/DB grant compatibility not accepted; private writer gate still defaults off; no Native browser reload/device2/memberB/private-intake denial/publication denial receipt; no real human research approval. Production publication queue is absent and must remain an explicit service limitation, not trigger a whole cohort installation. Source/CI/local synthetic tests do not close these gates. P00 coordinates exact candidate and backup/rollback before any real effect. Human review remains a human action.

## Bounded delivery evidence and exact handoff

Runtime selected files/digests are in `P07-SELECTED-FILES.json`. On the Production51fd integration retain the existing admin layout, AdminShell, ArashCommandDesk, admin/desk and admin/research page. Only replace ResearchWorkbook and its parser, add the existing admin workbook API/store, two small pure modules and private field group, then coordinate the unchanged phase34 SQL. Existing createClient/session/profiles prerequisites stay owned by P01/P00; no service-role writer or Auth override. Research page query support and P07ManualDesk/PublicationWorkbench are NOT required to open saved workbooks: the existing new workbook list controls support reopen directly.

Local49 PASS/0 FAIL/0 SKIP, full typecheck, targeted lint, static React4 and secret scan are recorded for the implementation before exact correction CI. Component-boundary tests execute actual TSX handlers and stored bodies with a minimal hook host; independent component state is not a second physical device or browser acceptance. Pending unregistered entries cannot be silently saved/downloaded, metadata is not discarded after import, and edits during an in-flight save remain dirty. Added SQL integration cases await CI execution; no local Postgres/service was started. Exact-head CI will be reported separately; PR220 CI is not transferred to this change or the combined release.

Publication ready/publish denial after return is still a P00 candidate gate only if that resulting candidate actually includes canonical publication functions. For the minimum Production release without those functions, member publication must be explicitly unavailable; private workbook persistence must not pretend to supply it.
