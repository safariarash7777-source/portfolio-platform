# Task Plan — Arash Safari Market Intelligence Platform
## From Product Rebaseline to Controlled Public Launch

**Mission Start:** 2026-07-28
**Current baseline SHA:** `7ad084eb54f4e2d5c274d4df2bdbe571d2b09b8c`
**Repository:** `safariarash7777-source/portfolio-platform`
**Last updated:** 2026-07-29 (mission `P2-G1-002`)

> **Only one gate may be `IN_PROGRESS` at a time.**
> Plan lives here · evidence in `findings.md` · criteria in `acceptance_criteria.md` ·
> running log in `progress.md`.

---

## Product direction (rebaselined 2026-07-28)

Portfolio Platform is **not** a general-purpose public tool site. It is the
**Arash Safari market-intelligence and investment-guidance system**: it watches news,
macro, politics, geopolitics, companies and markets, and turns them into **analysis,
scenarios and probable effect on assets** — in Arash's voice and under his judgment.

Existing market/symbol/fund/codal pages and quant engines are **retained** as data,
SEO and acquisition assets, reclassified under the new architecture — not discarded.

Full definition: [`docs/PRODUCT-BLUEPRINT.md`](../../docs/PRODUCT-BLUEPRINT.md).

## Arash Intelligence Desk (ratified `DD-024`, 2026-07-29)

The internal command layer **above** existing dashboards — radar, FX, terminal, codal,
portfolio, analyses and content remain as the specialist engines beneath it. Five
internal areas: Today · Market Intelligence · Decisions & Scenarios · Clients &
Products · Operations & System Health. **No dashboard is removed, and no island
dashboard is ever built.** Structure and per-surface mapping: `PRODUCT-BLUEPRINT` §11.

Ratification covers **architecture and development order only** — not pricing, news
sources, LLM provider or access duration (`D-021`…`D-024` remain open).

## Architecture — one brain, several interfaces

```
Sources              Intelligence engine      Editorial gate        Interfaces
───────              ───────────────────      ──────────────        ──────────
market (relay ✓)  →  lib/core/ ✓           →  Arash approval    →  Arash Desk (raw)
codal  (relay ✓)     + enrichment             low-risk: auto       Public (qualitative)
news   (ABSENT)      + linking                sensitive: manual    Members (deep)
Arash archive (½)    + scenarios
```

---

## Gate map

| Gate | Title | Status |
|---|---|---|
| **0** | Baseline Stabilization & Merge Docs | ✅ COMPLETE (`def602f`, then `7ad084e`) |
| **1** | Product Rebaseline | 🔵 **IN_REVIEW** — this PR |
| **2** | Operational Foundation | ⚪ NOT_STARTED |
| **3** | Manual Intelligence Workflow | ⚪ NOT_STARTED |
| **4** | Assisted Intelligence | ⚪ NOT_STARTED |
| **5** | Public Intelligence Experience | ⚪ NOT_STARTED |
| **6** | Compliance, Security & Reliability | ⚪ NOT_STARTED |
| **7** | Controlled Public Launch | ⚪ NOT_STARTED |

Mini App gates (`G-003`, `G-005`, `G-006`) now run on an **independent track** and are
**no longer prerequisites** for any gate above (`DD-021` / `SD-008`). Previously
`G-007` was blocked by all three, each of which is `OWNER_UNASSIGNED` — meaning the
main product's definition was locked behind a migration nobody owns.

---

## Execution order

| # | Work | WP | Gate | Blocking decision |
|---|---|---|---|---|
| 1 | Package manager normalization (npm) | `G2-001` | 2 | `D-018` ✅ decided, execution pending |
| 2 | Production environment repair (service-role) | `G2-002` | 2 | — (`B-024`) |
| 3 | System health view + last successful runs | `G2-003` | 2 | — (`B-009`, `B-010`) |
| 4 | Fresh review of PR #75 / webinar payment security | `G2-004` | 2 | **`D-009`** (Arash) |
| 5 | Payment → Entitlement design and tests | `G2-005` | 2 | **`D-024`** (Arash) |
| 6 | Lead migration, staging, end-to-end | `G2-006` | 2 | **`D-001`** (Arash) |
| 7 | Cron schedule vs. public claims | `G2-007` | 2 | — |
| 8 | Unprovable claims and placeholders | `G2-008` | 2 | `B-028` needs Arash on content |
| 9 | Branch Protection and Release Gate | `G2-009` | 2 | — (`B-015`, Arash console action) |
| 10 | Intelligence data model | `G3-001` | 3 | — |
| 11 | Arash Desk MVP | `G3-002` | 3 | ⚠️ **gated on Gate 2 exit** |
| 12 | Manual Daily Brief | `G3-003` | 3 | — |
| 13 | Scenario Board | `G3-004` | 3 | — |
| 14 | Approval Inbox | `G3-005` | 3 | — |
| 15 | Reference portfolio ↔ events/scenarios | `G3-006` | 3 | — |
| 16 | Private rehearsal — **≥10 real working days** | `G3-007` | 3 | — (`DD-022`) |
| 17 | `Research & Market Monitoring Agent` (one agent only) | — | 4 | **`D-022`, `D-023`** (Arash) |
| 18 | Public homepage | — | 5 | **`D-019`, `D-020`, `D-021`** (Arash) |
| 19 | Launch hardening | — | 6 | — |
| 20 | Controlled release | — | 7 | Arash cutover approval |

> ⚠️ **Arash Desk (`G3-002`) is architecturally approved (`DD-024`) but does not enter
> execution before Gate 2 risks are cleared.** A command desk built on a base where
> payment grants no access, the service role errors, and leads are never stored is a
> pretty view over data nobody can trust.

## PR strategy

One PR per row above. No auto-merge. No self-merge. Each requires Command Center
review, and every gate transition requires an explicit approval.

---

## Hard rules

- "code merged" ≠ "deployed" ≠ "operational" ≠ "proven"
- No result reported PASS without a real execution
- **No gate declared PASS with fabricated or sample data**
- Sensitive analysis is never published without Arash's approval (`DD-023`)
- An agent never closes a decision whose `Authority` is `ARASH`
- No commercial, legal, pricing or Production decision is made by the execution arm

## Roles

- **Arash Safari** — founder, product owner, final decision maker
- **Command Center** — system architect, gate authority
- **Execution arm (agent)** — documentation and implementation only; **no authority**
  over product, legal, pricing or Production decisions
