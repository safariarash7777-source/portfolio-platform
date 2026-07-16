# Codal Announcement Engine — Design (Jul 17, 2026)

## Goal
Extend fundamental coverage from ~6 processed symbols to the whole market (~700 listed companies with Codal reports), quota-aware, robust, append-only-safe. Feed: symbol pages fundamental charts + terminal three-axis engine + future screener.

## Current state (verified)
- codal_reports: 106 rows, only 6 symbols have data (فولاد فملی شبندر خودرو شپنا شستا)
- Relay live on Liara (arsadata), CODAL_ENABLED=1, PER_CYCLE=6, interval 3h, CODAL_SYMBOLS=27 names (static env list)
- Bottlenecks with current design:
  1. Static symbol list (27) — the market has ~1040 stocks in snapshot; env list doesn't scale
  2. Round-robin cursor resets on redeploy (in-memory) → symbols starve
  3. Each symbol every cycle re-fetches 2 announcement pages even when nothing new (wastes quota)
  4. MAX_DL=6 per symbol per cycle + excel timeouts → slow convergence
  5. No priority: a fund or illiquid stock treated same as فملی
  6. Banks/insurance parse fails (different FS structure) → wasted downloads every cycle

## Key design decisions (ideation → choice)

### D1: Symbol universe source
Options: (a) keep env list; (b) derive from ir_market_snapshots stocks sorted by trade value; (c) full Codal crawl without l18 filter (paginated global feed).
**Choice: (c) primary + (b) for prioritization.** Announcement.php WITHOUT l18 returns the global announcement feed (newest first, 20/page). Polling the global feed pages 1..N each cycle discovers ALL new reports across the whole market with ~5-10 API calls, instead of 2 calls × 700 symbols. This is the classic "firehose" pattern: incremental, quota-cheap, complete.
- Backfill (historical reports per symbol) remains per-symbol via l18, driven by a priority queue (top trade-value stocks first) — runs slowly in background.

### D2: State persistence (cursor, seen URLs, failure counts)
In-memory state dies on redeploy. **Choice:** persist engine state in ir_market_snapshots (key='codal_engine_state', payload jsonb) — reuse existing table + service key, no DDL needed. State: last global feed date_send seen, backfill cursor index, per-announcement failure counts (skip after 3 fails → blocklist with reason).

### D3: Failure handling for unparseable reports (banks/insurance)
Current: retried every cycle forever. **Choice:** failure count in state; after 3 failed parse attempts mark blocked:"parse" and stop downloading. When bank parser lands later, clear blocklist. Also classify() marked bank/insurance symbols can be skipped for N-10 (keep collecting metadata rows? No—append-only risk; just skip).

### D4: Metadata-only rows for unparsed announcements?
Tempting (announcement feed browsing), but append-only table + data=null rows already caused pain. **Choice: no.** Only insert parsed rows. Announcements metadata can be served live from BrsApi when needed.

### D5: Quota budget
10,000 req/day. Market data polling uses ~2-3k/day. Budget for codal: global feed poll = 6 pages × 8 cycles/day ≈ 50 req/day. Excel downloads don't hit BrsApi (excel.codal.ir direct). Backfill l18 calls: 2/symbol, ~50 symbols/day = 100 req/day. Total codal < 200/day. Safe.

### D6: Scope of parsing
Keep existing normalizeN10/N30 (verified pv2). Global feed items classified same way (title-based). Non-matching kinds ignored. Banks (وبملت وتجارت وبصادر...) — title same but FS table structure differs → parse returns null → after 3 fails blocklisted. Bank parser = separate future task.

## Architecture (v3 engine in relay/codal.mjs)
1. `pollGlobalFeed()` — every cycle: fetch Announcement.php pages (no l18), newest-first, stop when reaching last-seen (date_send+link watermark) or MAX_FEED_PAGES=6. Classify → for each parseable kind with excel link → enqueue download (respect MAX_DL_PER_CYCLE=10 global).
2. `backfillQueue()` — priority list built from snapshot stocks sorted by value (top 200), minus symbols already having ≥8 rows in codal_reports; process 2 symbols/cycle via l18 fetch (both categories) + download up to 6 new.
3. `loadState()/saveState()` — codal_engine_state snapshot row.
4. Failure ledger: `fails[source_url] = n`; skip when n>=3. Ledger capped at 500 entries (oldest dropped).
5. Status in /debug under codal: mode v3, watermark, queue position, per-cycle stats.
6. Keep /codal-test endpoint. Keep CODAL_SYMBOLS env as optional override to prepend priority symbols.

## Testing
- Unit: classify/watermark logic with synthetic feed (codal.test.mjs additions)
- Live: run engine locally (sandbox CAN reach Api.BrsApi.ir; excel.codal.ir blocked from sandbox → excel download tests only via relay after deploy; local test uses feed poll only + mock excel)
- Post-deploy: verify new symbols' rows appear in codal_reports; verify /data + symbol pages render new fundamentals.

## Site-side follow-up (phase 5)
lib/fundamental/supabase.ts already reads any symbol from codal_reports — new symbols get charts automatically. Verify with a newly covered symbol (e.g., کگل or فارس).
