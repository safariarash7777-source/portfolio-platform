# Findings — P2-MEGA-001 Gate 0 Audit

**Date:** 2026-07-28
**Baseline SHA:** `def602f5f596c42b1499106e21655cb979075232`
**Auditor:** MANUS

---

## A. Route Inventory

### Public Pages (No Auth)

| Route | Description | Status |
|---|---|---|
| `/` | Landing page | ✅ Live — real data from DB |
| `/market` | Market overview | ✅ Live |
| `/market/stocks` | Stock list | ✅ Live |
| `/market/funds` | Fund list | ✅ Live |
| `/market/options` | Options | ✅ Live |
| `/market/map` | Market map | ✅ Live |
| `/symbol/[symbol]` | Symbol detail | ✅ Live |
| `/codal` | Codal filings | ✅ Live |
| `/analyses` | Track record (hash-chain) | ✅ Live — append-only, empty if no data |
| `/insights` | Content hub (Telegram/Instagram) | ✅ Live — hides if empty |
| `/learn` | Learning hub | ⚠️ Placeholder — lessons not published |
| `/learn/[slug]` | Lesson detail | ⚠️ Placeholder |
| `/learn/glossary` | Glossary | ✅ Live |
| `/notes` | Market notes | ✅ Live |
| `/webinars` | Webinar listing | ✅ Live |
| `/legal/disclaimer` | Disclaimer | ✅ |
| `/legal/privacy` | Privacy | ✅ |
| `/legal/terms` | Terms | ✅ |
| `/payment/result` | Payment result | ✅ |

### Auth Pages

| Route | Description |
|---|---|
| `/(auth)/login` | Login |
| `/(auth)/register` | Register |
| `/(auth)/forgot-password` | Forgot password |
| `/(auth)/reset-password` | Reset password |

### Protected Pages

| Route | Description | Status |
|---|---|---|
| `/(protected)/dashboard` | User dashboard | ✅ |
| `/(protected)/terminal` | Analysis terminal | ✅ |
| `/(protected)/terminal/[symbol]` | Symbol terminal | ✅ |
| `/(protected)/terminal/allocation` | Allocation tool | ✅ |
| `/(protected)/terminal/watchlist` | Watchlist | ✅ |
| `/(protected)/admin` | Admin panel | ✅ |
| `/(protected)/admin/analyses` | Analysis management | ✅ |
| `/(protected)/admin/content` | Content hub management | ✅ |
| `/(protected)/admin/notes` | Notes management | ✅ |
| `/(protected)/admin/users` | User management | ✅ |
| `/(protected)/admin/webinars` | Webinar management | ✅ |
| `/(protected)/admin/announcements` | Announcements | ✅ |
| `/(protected)/admin/fx` | FX seeds | ✅ |
| `/(protected)/admin/manage` | General manage | ✅ |
| `/(protected)/admin/radar` | Market radar | ✅ |

### API Routes

| Route | Auth | Description |
|---|---|---|
| `/api/cron/alerts` | CRON_SECRET | Price alert evaluation (Vercel cron: daily 06:00) |
| `/api/cron/telegram-sync` | CRON_SECRET | Telegram feed sync (Vercel cron: daily 03:00) |
| `/api/payment/callback` | ZarinPal verify | Main payment callback |
| `/api/payment/request` | User session | Payment initiation |
| `/api/webinars/payment/callback` | ZarinPal verify | Webinar payment callback |
| `/api/webinars/payment` | User session | Webinar payment initiation |
| `/api/webinars/register` | User session | Webinar registration |
| `/api/leads/webhook` | Secret header | Lead ingestion |
| `/api/telegram/webhook` | Telegram verify | Telegram bot webhook |
| `/api/market` | None | Market data |
| `/api/market/ohlc` | None | OHLC data |
| `/api/symbol-detail` | None | Symbol detail |
| `/api/codal-list` | None | Codal list |
| `/api/admin/*` | Admin role | Admin operations |
| `/api/waitlist` | None | Waitlist signup |

---

## B. Data Sources

### Relay (External Data Ingestion)

| Source | File | Status |
|---|---|---|
| TSETMC (market data) | `relay/server.mjs` | ✅ Active |
| Codal filings | `relay/codal.mjs`, `relay/codal-engine.mjs` | ✅ Active |
| Market breadth | `relay/breadth.mjs` | ✅ Active |
| IME (commodity) | `relay/ime.mjs` | ✅ Active |
| Candle backfill | `relay/candle-backfill.mjs` | ✅ Active |
| Symbol detail | `relay/symbol-detail.mjs` | ✅ Active |
| Options | `relay/options.mjs` | ✅ Active |
| Commodity | `relay/commodity.mjs` | ✅ Active |

### Internal Data Sources

| Source | Table/File | Notes |
|---|---|---|
| Telegram channel | `content_hub` | Forward-only sync (no backfill) |
| Analyses/Track Record | `signals`, `signal_outcomes` | Append-only, hash-chain |
| Weekly Outlook | `weekly_outlooks`, `weekly_outlook_results` | Append-only, hash-chain |
| Market notes | `market_notes` | Admin-created |
| FX rates | `lib/fx` | Relay-fed |

### Missing/Gap

- **No LLM integration** — zero AI/LLM dependencies in `package.json`
- **No news ingestion** — no political/geopolitical/macro news pipeline
- **No Instagram source** — blocked by owner input (Export required)
- **Telegram backfill** — only forward sync; historical analysis memory absent

---

## C. Database Tables

### Tables with a migration FILE in `sql/` — **file exists ≠ applied**

> ⚠️ **Corrected 2026-07-28.** The previous heading read "SQL migrations applied",
> which conflated *a migration file exists* with *it ran in Production*.
> `docs/MIGRATION-LEDGER.md` is the authority. Per its read-only verification
> (2026-07-25, 41 `public` tables listed): **`leads` is missing**,
> **`ime_physical_trades` and `ime_certificate_history` are missing**
> (`phase19` is `NOT_APPLIED / SUPERSEDED`), and `ime_snapshots` exists but is `UNTRACKED`.

| Table | Migration | Purpose |
|---|---|---|
| `profiles` | archive/supabase_schema.sql | User profiles + role |
| `risk_assessments` | archive/supabase_schema.sql | Risk questionnaire results |
| `portfolios` | archive/supabase_schema.sql | User portfolios (admin-created) |
| `waitlist` | archive/supabase_schema.sql | Waitlist signups |
| `payments` | phase5_payments_telegram.sql | Payment records |
| `telegram_links` | phase5_payments_telegram.sql | Telegram account links |
| `telegram_link_codes` | phase5_payments_telegram.sql | One-time link codes |
| `announcements` | phase6_announcements_revalidation.sql | Announcements |
| `announcement_deliveries` | phase6_announcements_revalidation.sql | Delivery tracking |
| `price_alerts` | phase7_watchlist_alerts.sql | Price alert subscriptions |
| `alert_events` | phase7_watchlist_alerts.sql | Alert trigger history |
| `watchlist_items` | phase7_watchlist_alerts.sql | User watchlists |
| `webinars` | phase8_webinars.sql | Webinar catalog |
| `webinar_registrations` | phase8_webinars.sql | Webinar registrations |
| `leads` | phase8b_leads.sql | Lead capture — ❌ **NOT_APPLIED, table absent in Production** (`B-001`) |
| `market_notes` | phase9_market_notes.sql | Market notes |
| `content_hub` | phase10_content_hub.sql | Telegram/social content |
| `entitlements` | phase11_access_tiers.sql | Access control (append-only) |
| `weekly_outlooks` | phase12_weekly_outlook.sql | Weekly market outlook |
| `ir_market_snapshots` | phase13_fx_rates.sql | Market snapshots |
| `ime_physical_trades` | phase19_ime_tables.sql | ❌ **NOT_APPLIED** — absent |
| `ime_certificate_history` | phase19_ime_tables.sql | ❌ **NOT_APPLIED / SUPERSEDED** — absent; `ime_snapshots` (different schema) exists but is UNTRACKED |

### Tables Referenced in Code but NOT in Local SQL

| Table | Referenced In | Notes |
|---|---|---|
| `signals` | `lib/track/analyses.ts`, `app/api/admin/analyses/route.ts` | Must exist in Supabase (created via Supabase dashboard or missing migration) |
| `signal_outcomes` | `lib/track/analyses.ts` | Same |
| `weekly_outlook_results` | `lib/track/analyses.ts` | Same |
| `portfolio_versions` | `lib/` | Archive SQL has versioning |
| `audit_log` | Multiple routes | Likely created via Supabase dashboard |
| `risk_revalidations` | phase15_security.sql | Security-related |

---

## D. Cron Health

| Cron | Schedule | Auth | Status |
|---|---|---|---|
| `/api/cron/alerts` | Daily 06:00 UTC | CRON_SECRET | ⚠️ Vercel cron — NOT every 5 min as described in ProductFacts |
| `/api/cron/telegram-sync` | Daily 03:00 UTC | CRON_SECRET | ✅ Forward-only |

**Finding D-01:** `ProductFacts` component shows "۵ دقیقه، چرخهٔ پایش قیمت و هشدار" but `vercel.json` shows `"schedule": "0 6 * * *"` (daily, not every 5 minutes). This is a **truthfulness gap** — the displayed number does not match actual cron frequency.

---

## E. Payment → Entitlement Gap

**Finding E-01 (P1):** The main payment callback (`/api/payment/callback`) calls `verify_payment` RPC which marks payment as `paid` and sends Telegram invite link — but does **NOT insert into `entitlements` table**. Entitlements are only created manually via `/api/admin/entitlements`.

**Impact:** A user who pays successfully gets a Telegram channel invite but does NOT get `full` access level in the app. The `lib/access.ts` checks `entitlements` table for `full` access. This means paying users cannot access protected terminal features unless admin manually grants entitlement.

**Webinar payment** (`/api/webinars/payment/callback`) has the same gap — no entitlement insertion after successful payment.

**Decision Required:** What access level and duration should each product (consulting, webinar) grant? This is `OWNER DECISION REQUIRED` per the brief.

---

## F. Placeholder / Truthfulness Issues

| Issue | Location | Severity | Action |
|---|---|---|---|
| `/learn` lessons are placeholder | `app/learn/page.tsx` comment: "placeholder تا تأیید آرش" | Medium | HIDE from public nav until published |
| `ProductFacts` shows "5 دقیقه" but cron is daily | `components/landing/ProductFacts.tsx` | High | Fix to match actual frequency |
| `PortfolioPreviewCard` has demo data | `components/landing/PortfolioPreviewCard.tsx` | ✅ OK | Already labeled "نمونهٔ نمایشی" with explicit badge |
| `InsightsPreview` hides if empty | `components/landing/InsightsPreview.tsx` | ✅ OK | Returns null when no content |
| `/analyses` shows empty state honestly | `app/analyses/page.tsx` | ✅ OK | No fake data |

---

## G. Package Manager

**Finding G-01 (B-023):** Repository has **both** `package-lock.json` and `pnpm-lock.yaml`. No `packageManager` field in `package.json`. No `engines` field. This is the confirmed root cause of B-023 (documented in PR #85 / CLAUDE.md).

**Decision D-018:** npm is the proposed official package manager. Requires separate PR.

---

## H. LLM / AI Integration

**Finding H-01:** Zero LLM dependencies in `package.json`. No `openai`, `anthropic`, `@ai-sdk/*`, or similar packages. The "هیچ اتصال واقعی LLM در پروژه وجود ندارد" gap confirmed.

---

## I. Mobile / RTL

**Finding I-01:** ✅ `app/layout.tsx` has `lang="fa" dir="rtl"`. Vazirmatn font is self-hosted (fixed in PR #84). RTL and mobile appear to be properly configured at the layout level.

---

## J. PR #75 Status

**Finding J-01:** PR #75 base is `aaf9974` — **7 commits behind** current main (`def602f`). `mergeable: UNKNOWN` (GitHub hasn't computed it). Scope: webinar registration security fixes. Per brief: do NOT merge directly. Port valid findings to a new PR after fresh analysis.

---

## K. Existing Capabilities (Confirmed Working)

- `lib/core` engines: backtest, allocation, regime, screener, market radar, FX analytics ✅
- Relay: TSETMC, Codal, IME, breadth, candle backfill ✅
- `/analyses` + hash-chain infrastructure ✅
- Telegram forward sync to `content_hub` ✅
- Admin panel (full CRUD for analyses, content, notes, users, webinars) ✅
- Auth, role, entitlement system (structure exists, payment bridge missing) ✅
- CI pipeline (GitHub Actions: typecheck, lint, tests, build, secret scan, SQL validation) ✅
- Language guard (`vocab.test.ts` — scope: `app/` + `components/`) ✅
- Self-hosted Vazirmatn font ✅
- ZarinPal payment integration (request + callback) ✅

---

## L. Missing Capabilities (Confirmed Gaps)

| Gap | Priority | Notes |
|---|---|---|
| Payment → Entitlement bridge | P1 | No auto-grant after payment |
| LLM integration | P2 | None exists |
| News ingestion (political/macro) | P2 | None exists |
| Telegram historical backfill | P2 | Only forward sync |
| Instagram import | BLOCKED | Awaiting owner Export file |
| Intelligence data model | P2 | No `events`, `scenarios` tables |
| Arash Desk MVP | P3 | Not built |
| Public homepage redesign | P3 | Current landing is product-marketing, not intelligence-first |


---

# Findings — Gate 1 (`P2-G1-001`, 2026-07-28)

**Baseline:** `7ad084eb54f4e2d5c274d4df2bdbe571d2b09b8c`

## Corrections to the Gate 0 audit

**C-01 — table status was overstated.** The "Active Tables (SQL migrations applied)"
heading listed `leads`, `ime_physical_trades` and `ime_certificate_history` as applied.
`MIGRATION-LEDGER.md` records all three as **absent from Production**. Heading and rows
corrected above. This is exactly the Built/Deployed/Operational confusion Gate 1 exists
to eliminate.

**C-02 — `PortfolioPreviewCard` is correctly labelled.** An earlier independent review
claimed it showed unlabelled demo data and violated `CLAUDE.md`. **That claim was wrong.**
`components/landing/PortfolioPreviewCard.tsx:5` documents the intent and `:40` renders an
explicit «نمونهٔ نمایشی» badge. The Gate 0 audit was right; the later review was not.
Recorded here so the incorrect claim does not propagate.

**C-03 — `ProductFacts` gap confirmed independently.** `components/landing/ProductFacts.tsx:7`
claims "only real, provable numbers from the product itself", while `:15` renders
`{ value: 5, label: "دقیقه، چرخهٔ پایش قیمت و هشدار" }`. `vercel.json` schedules
`/api/cron/alerts` at `0 6 * * *` — **daily, not every five minutes**. Tracked as `B-027`.

## New findings

**F-11 — `SUPABASE_SERVICE_ROLE_KEY` fails in Production.** Reported operationally in
the `P2-G1-001` brief; breaks webinar paths and Telegram sync, both of which go through
`lib/supabase/admin.ts`. **Root cause not yet read** — reproducing it requires Vercel
access this session does not have. Tracked as `B-024`, the highest active risk.
Status: report VERIFIED · cause UNKNOWN.

**F-12 — webinar payment fails in Production.** Reported operationally. Plausibly the
same root cause as `F-11`, but **that link is unverified and must not be assumed**.
Tracked as `B-026`.

**F-13 — the product-definition gate was locked behind an unowned migration.** `G-007`
listed "all gates above" as blockers, including `G-003`/`G-005`/`G-006`, and all three
carry `OWNER_UNASSIGNED`. The main product's definition was therefore blocked on a
Telegram Mini App server migration nobody owns. Resolved by `DD-021` / `SD-008`.

**F-14 — Language Guard is narrower than `CLAUDE.md` claims.** `lib/core/vocab.test.ts:12`
forbids exactly two words — «توصیه» and «سیگنال» — scanning only `app/` and `components/`.
`CLAUDE.md` line 12 claims «سیگنال/خرید/فروش/توصیه/پیشنهاد» are all banned. The gap
matters more under the new product direction, which explicitly produces scenarios and
asset-effect statements under a licensed advisor's name. Folded into Gate 6 criteria.

**F-15 — no verified LLM access path exists.** Zero LLM dependencies, and no documented
route from this architecture (relay inside Iran, Vercel outside) to any provider under
sanctions and network constraints. This is a **prerequisite for Gate 4**, opened as `D-023`.

**F-16 — the track record is the product's proof, and it is reportedly near-empty.**
Under the rebaselined direction the public track record stops being one section among
many and becomes the evidence the whole product rests on. `PRODUCT-BLUEPRINT` (previous
revision) stated the weekly-outlook table is "ready and empty". **This session did not
query the database**, so the claim is `INFERRED` from project documentation, not
verified. It must be confirmed by one read before it drives any launch decision.

## Unchanged from Gate 0

Route inventory, data sources, cron schedules, payment→entitlement gap (`E-01`),
package-manager root cause (`G-01`), LLM absence (`H-01`), RTL/mobile (`I-01`),
PR #75 staleness (`J-01`), and the confirmed-working capability list (§K) all stand.
