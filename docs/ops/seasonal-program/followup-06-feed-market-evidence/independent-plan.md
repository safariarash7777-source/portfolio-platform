# Independent feed185 / market187 combined acceptance — preparation record

Reviewer `/root/limited_independent` is separate from the composition author. This plan was written before runtime readiness. Fresh execution subsequently completed on `be7b7230a50d0f16aba18b408829ccd7f85f1299`, environment `followup06-feed-market-native-local`, origin `http://127.0.0.1:3399`; see [independent final report](independent.md) and [39 actual rows](independent.json). The frozen 38-case PR186 acceptance is historical only; its results are not carried into this new matrix.

Inputs: PR185 `a54b161b8df88f83e8624273b1c4bb2ffd10f787` (runtime `eb94b97f50a1b628af4f84554f7a1ce06780910e`, based on181); PR187 `874c16096d792af2f57fc9142fde3124c0321dc1` (runtime `4687ceaa05d57233c1d718453016f3f1171aa353`, based on182/174). Final combined SHA and production build must be declared before execution. Tests record their own actual SHA, environment, UTC time and observation.

The new exclusively synthetic native environment is `followup06-feed-market-native-local`, loopback origin3399, with separate containers/volumes and private ACL directory. Root owns setup/build/fixtures. The reviewer changes no product/schema/Auth, creates no accounts/phone proof, and does not touch PR186, feed-owner3540, DEV07/173 or real databases. Feed migration `20261001121858_member_publication_feed_reads.sql` extends the canonical08 reader; its hash, RLS/FORCE/grants and actual RPC cache readiness must be verified in this new environment.

| Case group | Required fresh evidence |
|---|---|
| Actual Auth | A/B/admin fresh UI login, unmodified native GoTrue token response200, native user200 and canonicalUUID; no injected cookies/JWT/storageState |
| Scoped list | A sees only current/published/still-approved A items; B only B; guest401/adminwithoutgrant403; public/draft/ready/withdrawn/returned excluded; REST/RPC cannot bypass |
| Pagination/DTO | More than20 A items, complete two-page union without duplicate; cohort-bound cursor rejected in B; bad input400; no private actor/workbook/notes/financial/contact fields in DTO |
| Explicit read | GET detail creates no receipt; actual UI «خواندم» produces uid/version receipt; repeated/concurrent mark retains first timestamp and one row; caller cannot set actor/time |
| Version | Admin08 creates/ready/publishes next version; previous receipt remains historical, old version404, new version unread; separate new receipt |
| Withdraw/returned | First mark dedicated published synthetic versions; actual admin withdraw / workbook returned commands remove detail/feed and deny receipt replay; old receipt not deleted |
| Revoke | Admin04 revokes A actual grant; saved cursor/detail/readRPC and open page can no longer access; B remains allowed; no receipt grants access |
| Identity/error | Owned REST/Auth fault produces honest503/unavailable, recovery returns empty/pending, no fabricated confirmed phone or identity writer success |
| Financial/needs | Own A/B financial row/version digests survive all feed changes; B cannot read A; existing needs DTO version/body unchanged; same-tab unsaved text survives feed error/retry and is not shown to B |
| Public market | Iran/full board remains available when global hangs; both failures show last complete cache with original timestamps; cold Iran failure is null with explicit error or timeout according to cause; unknown/private analytics kind400 |
| Coverage | Default100-row data UI initiates no analytics; each selected public kind completes expected synthetic row coverage; mid-scan cold error503, stale only prior complete cache/time; hung scan ends at budget and retry recovers; filter/search/sort remain usable |
| Isolation | Root server egress guard + fixture audit prove zero live provider calls. Browser aborts non-loopback requests. Timing is local synthetic, not Production p95 or live freshness |

Fault controls are only the new private `fault.json`: `{auth:true}`, `{rest:true}`, `{storage:true}`, or `{}`. Native containers remain running. Market fixture15913 accepts `/control` and reports `/stats`; server clock offset stays0 during real Auth/feed. Market tests run last with bounded synthetic offsets for cache expiry and restore offset0/control-ready in `finally`. Synthetic clock is never Auth evidence.

Run prerequisites: immutable `app-manifest.json{sha,environment,origin}`, nonsecret `fixtures.json` IDs plus lifecycle command inputs, and ACL-only reviewer credentials. Harness refuses runtime without an explicit full `--run-sha=<SHA>` matching the build. Missing fixtures/control/readiness are **BLOCKED**, not fabricated PASS. Any failure is reported to its owner before a correction; only affected paths are rechecked after a new immutable build.

OPEN: quota178 installation/reset/failclosed and two live market cycles; known187 legacy bulkReturns/history/watchlist coverage limits; human DEV07/173; real phone/provider matching; NEXT09/bot/channel. PR189 and miniapp#5 are inventory only. The previously policy-blocked **NEXT09 built-server action** will not be repeated or routed through another tool. Neither PR189 nor miniapp runtime is executed in this phase. No main merge, Production/shared migration, backup or live upstream requests.
