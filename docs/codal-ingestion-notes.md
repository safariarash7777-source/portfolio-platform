# Codal Automated Ingestion — Implementation Notes (Jul 16, 2026)

## Current task
User wants the empty symbol-page sections (کارت امتیاز + تحلیل بنیادی کدال) filled ASAP.
Plan: relay fetches Codal announcements + downloads Excel (inside Iran) → parses → inserts into Supabase `codal_reports` → Next.js symbol page reads from Supabase registry.

## Key facts verified by tests
- BrsApi key: `[REDACTED — BRSAPI_KEY روی Liara]` (valid until 1405-05-26, plan quota 10000/day, ~255 used)
- Codal endpoint: `https://Api.BrsApi.ir/Codal/Announcement.php?key=KEY&l18=<symbol>` — **`l18` param filters correctly** (tested وبملت: 1660 announcements). `symbol` param does NOT filter.
- Response shape: `{count_announcement, count_page, announcement: [...20 per page]}`; item keys: `l18, l30, title, code, date_title, date_send, time_send, date_publish, time_publish, link, link_pdf, link_excel, link_attachment`. `letter_code` is NOT present; must classify by `title` text. Dates are Jalali strings like `۱۴۰۵/۰۴/۰۸` (Persian digits).
- Excel link example: `https://excel.codal.ir/service/Excel/GetAll/8AOOObOOOdi15jOeOOObOOO3XD0Zm7Xw6g%3d%3d/0`
- **excel.codal.ir is BLOCKED from outside Iran** (TLS SSL_ERROR_SYSCALL from sandbox; http also fails). Must download from the Liara relay (inside Iran). Api.BrsApi.ir itself works from sandbox.
- Titles for financial statements: `صورت‌های مالی سال مالی منتهی به ۱۴۰۴/۱۲/۲۹ (حسابرسی نشده)` (has excel), `اطلاعات و صورت‌های مالی میاندوره‌ای دوره ۳ ماهه منتهی به ۱۴۰۵/۰۳/۳۱` (has excel), `گزارش فعالیت ماهانه دوره ۱ ماهه منتهی به ۱۴۰۵/۰۳/۳۱` (has excel, ن-۳۰).

## Repo structure (portfolio-platform, branch main)
- Relay: `relay/server.mjs` (644 lines, plain node http server on Liara app `arsadata`). Env: BRSAPI_KEY, BRSAPI_BASE (default https://Api.BrsApi.ir), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RELAY_TOKEN. Endpoints: `/healthz`, `/`, `/debug`, `/market.json`. Refresh loop every CACHE_MS (5 min) → buildPayload → pushToSupabase (`ir_market_snapshots` key=latest, 3 retries) → pushHistory (`ir_market_history` every 30 min). Helpers: `HDRS` (UA headers), `errMsg`, `sleep`, `recoveredFrom(name)`, `wasFailing` object, `status.sources.*`.
- Deploy: `cd relay && liara deploy --app arsadata --api-token $LIARA_TOKEN --no-app-logs` (LIARA_TOKEN was in shell env earlier; token in notes: task-state-notes.md says env all set on Liara).
- Supabase (relay project): `https://uooeygybrniptzdxuzhj.supabase.co` — has `codal_reports` table (append-only, immutable triggers! **no UPDATE/DELETE allowed**, dedup by unique `source_url`): columns `id, symbol, company_name, report_kind (default 'other'), period_end (date), title, source_url (unique), published_at, data (jsonb), raw (jsonb), captured_at`.
  - NOTE: `period_end` is a Postgres `date`; Jalali date like 1404-12-29 is NOT a valid Gregorian date (Feb 29 issue) — safer to keep period_end null or convert Jalali→Gregorian before insert; `data.period_end` stays Jalali string per contract.
- Next.js fundamentals contract: `lib/fundamental/types.ts` — `SymbolFundamentals { symbol, n10: {data: CodalN10Data, source: ReportSource}|null, n30: {data: CodalN30Data[], source}|null }`. `CodalN10Data` requires standalone IncomeStatement (revenue, cogs, gross_profit, operating_profit, net_profit, eps_rial etc), period_end Jalali string, period_months, audited, capital... `CodalN30Data { symbol, report_kind:"ن-۳۰", period_end, fiscal_year, products: N30ProductRow[], period_total_amount, fy_cumulative_amount }`.
- `lib/fundamental/registry.ts`: static registry, only فملی (from `data/fameli-1404.ts`). Comment says: when codal_reports fills, switch to reading Supabase without UI change.
- Symbol page: `app/symbol/[symbol]/page.tsx` (152 lines) calls `getFundamentals(sym)` and renders `<FundamentalCharts fundamentals={...}>` (components/symbol/FundamentalCharts.tsx, recharts; renders TrendChart, MarginsChart, NetProfitChart from n10; narratives auto-generated).
- Main site Supabase env vars in Next.js (check lib/market-ir.ts pattern): reads `ir_market_snapshots` via anon/service key envs on Vercel. Production URL: https://portfolio-platform-fawn.vercel.app
- Score card (کارت امتیاز سه‌محوره) is WP5 — still "به‌زودی" placeholder; NOT in current scope unless quick.

## Excel parsing challenge
- Codal Excel (GetAll) is actually an HTML-tables-in-xls or OOXML with multiple sheets; parsing income statement from Excel requires locating sheet 'صورت سود و زیان'. Relay is Node.js; parsing xlsx in relay would need a library (e.g., `xlsx` npm). Liara deploy includes package.json in relay/ — currently no deps (plain node). Adding `xlsx` package is acceptable.
- Alternative pragmatic approach (recommended v1): relay only fetches announcement list + downloads excel binary and stores announcement metadata + excel in Supabase Storage OR parses on relay with xlsx lib.
- Monthly activity (ن-۳۰) excel structure: products table with production/sales qty/rate/amount columns.

## Decided v1 scope (fastest path to filling UI)
1. Relay: new module codal.mjs or inline — daily job (every 6h): for a configurable symbol list (start: وبملت، شبندر، فملی، فولاد، شپنا و ~10 پرتراکنش), fetch announcements page 1 via l18, classify by title (ن-۱۰: 'صورت‌های مالی' + سال/میاندوره‌ای; ن-۳۰: 'گزارش فعالیت ماهانه'), download excel from excel.codal.ir (works from Liara), parse with xlsx npm lib, normalize to CodalN10Data/CodalN30Data shape, POST to Supabase codal_reports (dedup on source_url via `Prefer: resolution=ignore-duplicates` + on_conflict=source_url).
2. Next.js: registry switches to async Supabase read with static fallback (فملی), so symbol pages show charts once rows exist.
3. Deploy relay + merge PR to main (Vercel auto-deploy).

## Liara deploy token
LIARA_TOKEN was exported in shell session 'default' earlier; if lost, check `liara account ls` or ask user. Logs cmd: `liara logs -a arsadata --api-token "$LIARA_TOKEN" --since 10m`.

## Test URLs
- Announcements وبملت: `https://Api.BrsApi.ir/Codal/Announcement.php?key=KEY&l18=وبملت` (URL-encode)
- Saved sample: /tmp/codal_webmellat.json (page without l18), probe script /home/ubuntu/codal_probe.py

## Confirmed Codal API params (official docs)
`Announcement.php?key&l18&category&period&audited&unaudited&only_main_company&only_subsidiaries&date_start&date_end&page`
- category: 1=صورت مالی سالانه, 3=گزارش عملکرد ماهانه. `code` field (e.g. ن-۱۰) exists in docs sample but observed null sometimes — classify by title as fallback.
- 20 items/page. date_start/date_end Jalali YYYY-MM-DD.
- BrsApi provides only announcement metadata + links; NO parsed financial JSON. Excel parsing is on us.

## Progress log (Jul 16 ~13:10 UTC)
Implemented `relay/codal.mjs` (announcement fetch category 1&3, HTML-table excel parser with no deps, normalizeN10/N30, insert into codal_reports with on_conflict=source_url + ignore-duplicates) + wired into `relay/server.mjs` (runs 90s after boot, then every CODAL_INTERVAL_MS=3h; status in /debug under `codal`; live test endpoint `/codal-test?symbol=X` protected by RELAY_TOKEN). Unit tests in relay/codal.test.mjs pass (`node codal.test.mjs`).

Deployed to Liara arsadata OK. First job run results (logs): فملی processed=7 inserted=6 parseFailed=5 (excel timeouts!), فولاد inserted=6 parseFailed=6, شبندر inserted=6 parseFailed=1. 18 rows in codal_reports now. Issues to fix:
1. **excel.codal.ir timeouts from Liara** — 45s timeout may be too short or need retry; many parseFailed rows inserted with data=null. Since table is append-only (no UPDATE), rows with data=null CANNOT be re-parsed later under same source_url! Need fix: only insert row when parse succeeded OR delete-not-possible → better: skip insert on parse failure so next cycle retries.
2. Consolidated titles like «(شرکت تامین و تولید مواد معدنی مهام پارسیان)» — subsidiary reports for فولاد included; should filter only_main_company=true in announcement fetch.
3. RELAY_TOKEN=[REDACTED — RELAY_TOKEN روی Liara]; /codal-test requires Authorization: Bearer <token>.
4. Liara edge flaky from sandbox (HTTP 000 often); verify via Supabase REST directly: service key via `liara env ls -a arsadata --api-token $LIARA_TOKEN` (SUPABASE_URL=https://uooeygybrniptzdxuzhj.supabase.co).
5. codal_reports has immutable trigger (no update/delete) — rows with data=null are stuck; consider new source_url variant impossible → must avoid inserting null-data rows. Existing 18 rows: some have data=null; UI reader should filter data not null.

Next steps: fix codal.mjs (skip insert on parse fail, add only_main_company=true, retry excel download w/ longer timeout), redeploy, verify parse succeeds, then Next.js registry switch to Supabase read (lib/fundamental/registry.ts) + admin/env vars on Vercel for service key read of codal_reports (site already has envs for ir_market_snapshots read — reuse same client in lib/market-ir.ts pattern).

## Progress log 2 (Jul 16 ~13:45 UTC)
- User confirmed docs: Announcement.php supports `only_subsidiaries=false` (MUST add to avoid subsidiary reports like «شرکت بهساز مشارکتهای ملت»), `period` param (months), category 1=annual FS, 3=monthly.
- Sandbox → arsadata.liara.run edge = HTTP 000 (Liara international outage). All verification must go through Supabase REST (works both ways).
- ir_market_snapshots columns: key, payload, updated_at (NOT data). codal_reports is append-only (no update/delete, trigger P0001).
- First real N-10 parse was WRONG (revenue from wrong table, net_profit=0): must rewrite findRow to select the income-statement table properly. Real parse verified via codal_reports rows id 14,18 (شبندر): revenue=1443054 (wrong), cogs=780168572 (wrong scale) etc.
- Added: `/codal-raw?url=` and `/codal-test?symbol=` endpoints (Bearer RELAY_TOKEN=[REDACTED — RELAY_TOKEN روی Liara]), codalDebugDump() on boot when env CODAL_DEBUG_EXCEL_URL set → writes table structure dump to ir_market_snapshots key='codal_debug' (payload column). Excel download now 3 retries with 30/60/90s timeouts.
- CODAL_ENABLED env gate: auto job OFF until parser verified. Liara env currently has CODAL_DEBUG_EXCEL_URL=https://excel.codal.ir/service/Excel/GetAll/CNqCMsB2z7xi4xk6oKwNZw%3d%3d/0 (شبندر annual audited N-10).
- Verify flow: redeploy → wait ~60s → `python3 /home/ubuntu/pull_codal_debug.py` (pulls codal_debug payload от Supabase; NOTE script queries `select=data` — must change to `select=payload`).
- Existing bad rows in codal_reports (ids 1-18): some have wrong data / null; table append-only so cannot fix; UI must read only latest good rows; consider a `codal_reports_v2`-style validity flag later or filter by captured_at > date of parser fix.
- Next after structure dump: rewrite normalizeN10 table selection (find table containing both «درآمدهای عملیاتی» and «سود (زيان) خالص» rows = income statement), scale checks (revenue>0, gross=revenue-cogs ±1%), skip insert when validation fails, add only_subsidiaries=false, redeploy, run /codal-test via... (edge blocked; instead enable CODAL_ENABLED and inspect inserted rows via Supabase).

## REAL N-10 quarterly FS structure (شبندر 3-month 1404/03/31, 49 tables, verified Jul 16)
Income statement = the table containing BOTH «درآمدهاي عملياتي» AND «سود(زيان) خالص» rows (table 0 here). Structure: col0=شرح, col1=current period, col2=restated prior period (same quarter last year), col3=restated prior full year, col4=% change. Second header row: audited status per column.
Correct شبندر Q1 1404 values: revenue=1,442,603,668; cogs=(1,227,397,734); gross=215,205,934; operating=205,819,524; net=169,688,569; EPS ناشي از عمليات در حال تداوم=1,263 rial. Numbers are Persian digits with commas; parens = negative. Unit = million rial.
Other useful tables: table 4 = balance sheet («دارايي‌ها»...جمع دارايي), table 6 = cash flow («نقد حاصل از عمليات»), table 10 = 5-year sales/cogs history (GOLD for trend charts: سال مالی ۱۳۹۹..۱۴۰۳ مبلغ فروش/بهای تمام شده), table 9 = production/sales by product, table 13 = cost breakdown, table 24 = overhead/admin costs.
Balance sheet rows: جمع دارايي‌هاي غيرجاري etc. EPS row label: «ناشي از عمليات در حال تداوم» (rial). Capital in table 5 col «سرمايه» مانده rows.

## REAL N-30 monthly structure (شبندر 1405/03, 5 tables)
Table 0 = products: header row0 = period columns (cumulative prev, adjustments, cumulative revised, current month, cumulative now), header row1 = نام محصول/واحد/تعداد تولید/تعداد فروش/نرخ فروش (ریال)/مبلغ فروش (میلیون ریال); data rows per product with فروش داخلی:/صادراتی: section markers. NOTE: 26 cols wide = repeating 4-col groups per period; sample only shows first 6 cols. Need column-group math: each period block = (تولید، فروش، نرخ، مبلغ). Table 1 = raw material purchases, 2 = energy, 3 = FX, 4 = comments.
Parser fix plan: findIncomeTable(tables) = table with revenue+net rows; parse col1 as current; validate gross≈revenue-|cogs| (sign-aware, ±2%); reject if fail. EPS from «ناشي از عمليات در حال تداوم» or «سود(زيان) پايه هر سهم» sub-rows. Monthly: find product table by «نام محصول» header; current-month block = column group whose header contains «دوره یک ماهه»; cumulative = «از ابتدای سال مالی تا تاریخ» latest.

## Progress log 3 (Jul 16 ~14:00 UTC) — parser rewrite done in codal.mjs
- normalizeN10 REWRITTEN: findIncomeTable (needs revenue+net+gross rows in same table), rowIn(table,labels) uses col1=current col2=prior, normLabel normalization (strip spaces/ZWNJ, ي→ی ك→ک, remove parens), accounting validation gross≈revenue+cogs (cogs negative, ±2% tol) else return null. EPS row «ناشی از عملیات در حال تداوم». Capital from equity-changes table (column سرمایه, row مانده). net = exact label «سود(زیان) خالص».
- normalizeN30 still OLD (needs product column-group logic; header rows: row0=period blocks, row1=نام محصول/واحد/تعداد تولید/تعداد فروش/نرخ فروش/مبلغ فروش; 26-col wide, current month block header contains «دوره یک ماهه» — but sample cells suggest col layout for first block starts col2: تعداد تولید,تعداد فروش,نرخ,مبلغ. TODO verify with full-width dump if needed. Table 0 of N-30 dump showed 6 visible cols matching first block, values plausible (گازمايع 57,073 تولید / 56,399 فروش / نرخ 410,153,035 / مبلغ 23,132,221).
- fetchAnnouncements now sends only_main_company=true & only_subsidiaries=false.
- unit tests: relay/codal.test.mjs — must update synthetic sample to match new structure (income table needs gross row + net exact label). Run: node codal.test.mjs.
- After parser done: deploy, set CODAL_ENABLED=1 via liara env set, wait cycle (job runs 90s after boot, 3 symbols/cycle), verify via Supabase codal_reports rows with data non-null and correct values (شبندر Q1 1404: revenue=1,442,603,668 net=169,688,569 eps=1263).
- Old bad rows ids 1-18 in codal_reports: append-only, can't delete. Web app must prefer latest rows / rows with valid data. Check how lib reads codal_reports (app/symbol/[symbol]/page.tsx + lib/fundamental/*) before UI phase.
- pull_codal_debug.py + view_dump.py helper scripts in /home/ubuntu. Debug dump env: CODAL_DEBUG_EXCEL_URL currently It0ukVIOOObOOOBo6wcaeOT8YAKw (شبندر Q1). Remember to UNSET after done: liara env unset CODAL_DEBUG_EXCEL_URL -a arsadata.

## Progress log 4 (Jul 16 ~14:20 UTC) — PARSER DONE, ALL TESTS PASS
- normalizeN10 + normalizeN30 rewritten and verified: `cd /home/ubuntu/portfolio-platform/relay && node codal.test.mjs` → ALL TESTS PASSED (23 checks incl. real شبندر values).
- N-30 column map (26-col): month block cols 13-16 (تولید/فروش/نرخ/مبلغ), cumulative block 17-20; validation amount≈qty*rate/1e6 ±5%; section rows end with ":"; جمع rows give periodTotal (col16) and fyCumulative (col20).
- EPS fix: iterate rows, label startsWith «ناشی از عملیات در حال تداوم» OR includes «پایه هر سهم»/«خالص هر سهم», take first with numeric col1.
- Old bad rows ids≤18 CANNOT be deleted (append-only trigger, P0001). App must filter: only use rows where data is not null AND id>18, or add data->quality check. Decide in UI phase: symbol page reads via lib/fundamental/registry.ts (currently static fameli-1404.ts). Files: lib/fundamental/{types.ts,registry.ts,data/fameli-1404.ts}, app/symbol/[symbol]/page.tsx, components/fundamental/FundamentalCharts.tsx (check exact name).
- NEXT STEPS: 1) redeploy relay with CODAL_ENABLED to re-run job & insert good rows (job auto-runs 90s after boot; ensure codal job re-enabled — check server.mjs whether CODAL_DISABLED/enabled flag was set when I disabled auto job earlier!) 2) unset CODAL_DEBUG_EXCEL_URL 3) verify new rows in Supabase have correct data (شبندر Q1 1404 revenue=1,442,603,668 net=169,688,569 eps=1263) 4) wire Next.js symbol page to read codal_reports from Supabase (registry fallback static) 5) push to GitHub via PR (branch, gh pr create, merge) — relay deploy is manual via liara CLI from relay/ dir: `liara deploy --app arsadata --platform node --port 3000 --api-token "$LIARA_TOKEN" --no-app-logs --path .`
- Liara env names: BRSAPI_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (read via `liara env ls -a arsadata --api-token "$LIARA_TOKEN"`).
- Vercel site: portfolio-platform-fawn.vercel.app; repo safariarash7777-source/portfolio-platform; relay app name: arsadata.

## VERIFIED 2026-07-16 14:45 UTC (pv2 parser)
- v25 deployed, codal=on log, job runs fine. pv2 rows 19-34 inserted.
- شبندر #34 Q1 1404: rev=1,442,603,668 net=169,688,569 eps=1263 → EXACT match with ground truth.
- شبندر annual 1404 eps=2127 ≈ market feed EPS 2126 (rounding) → consistent.
- فملی annual 1404: rev=3.2T net=1.46T eps=1430 cap=1050B. All plausible.
- Note: duplicate rows for same period from different announcements (اصلاحیه/حسابرسی‌شده vs نشده) — reader must dedupe by (symbol, period_end, period_months) preferring audited & latest id.
- N30 monthly: no rows yet for these 3 symbols in this cycle? (all rows N10 so far — monthly excel links maybe among parseFailed or beyond MAX_DL=6 cap). Check later cycles.
- NEXT: wire Next.js lib/market-ir.ts or new lib/codal.ts to read codal_reports (env NEXT_PUBLIC vs server SUPABASE URL — site reads relay supabase project uooeygybrniptzdxuzhj via env in Vercel: check names), render FundamentalCharts from data JSON, fallback to registry static (fameli sample). Deploy Vercel, verify شبندر/وبملت pages.
- REMEMBER user wants the master-plan presentation delivered after this work (project /home/ubuntu/master-plan-presentation, content /home/ubuntu/slide_content.md, slides 1-3 done, 4-8 written via file_write pending slide_edit registration? state unclear — check slide_state.json).

## STATE 2026-07-16 ~15:00 UTC (phase 3: wiring site)
- codal_reports has RLS "public read" policy (sql/terminal_t0.sql:245) → site anon key reads fine; no new envs needed.
- Created lib/fundamental/supabase.ts: getFundamentalsFromSupabase(symbol) — dedupe by parser_version (#pvN in source_url; raw.parser_version), per-period audited>latest, builds sales_trend_5y from annuals, 10-min in-memory cache.
- NEXT: 1) registry.ts async: supabase first, fallback static REGISTRY (فملی). Page awaits getFundamentals at app/symbol/[symbol]/page.tsx:60. 2) pnpm build. 3) commit+PR merge. 4) verify شبندر/فملی/فولاد prod pages. وبملت has no rows yet.
- Relay v25 live: codal=on, pv2 rows 19-34 verified correct (شبندر Q1: rev=1,442,603,668 net=169,688,569 eps=1263 exact).
- PRESENTATION pending after site work: /home/ubuntu/master-plan-presentation, content /home/ubuntu/slide_content.md (check slide_state.json which slides pending).

## 2026-07-16 ~15:35 UTC — session state (post-compaction)

- PDF review DONE → full notes in `/home/ubuntu/final-project-doc-notes.md` (all 10 pages, incl. Q4-Q8 locks, advisory pivot "هرگز تیکت سفارش", Appendix B checklist).
- Production verified: شبندر/فولاد/فملی symbol pages LIVE with real Codal fundamentals. وبملت not yet processed.
- PR #33 (symbol page wiring) + PR #34 (Persian digit fix) merged.
- Liara env: CODAL_ENABLED=1, CODAL_PER_CYCLE=6. Service key: [REDACTED — روی Liara env تنظیم است]
- v26 codal cycle started 15:15:31; no per-symbol completion log by 15:30. Worst-case timing analysis: فملی has 1 parseFailed announcement retried each cycle → 3 download attempts (30/60/90s) ×6 MAX_DL ≈ up to ~20 min per symbol. So probably slow, not hung. Re-check logs around 15:50.
- codal_reports latest id=34. فملی(5) فولاد(6) شبندر(5) pv2 rows verified correct.
- FINAL DELIVERABLE (user's latest instruction): ONE comprehensive plain execution document (MD) merging FINAL-PROJECT-DOCUMENT.pdf + 9-layer critique architecture + new data reality (20yr history API + live codal ingestion) — "نمیخوام پیچیده یا خیلی خوشگل فقط یک فایل جامع". This supersedes the fancy presentation for now.
- Prior analysis docs available: /home/ubuntu/quant-critique-analysis.md, /home/ubuntu/quant-dashboard-plan.md, /home/ubuntu/roadmap-response.md, /home/ubuntu/slide_content.md
