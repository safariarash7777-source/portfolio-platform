# Task Plan — Arash Safari Market Intelligence Platform
## From Product Rebaseline to Controlled Public Launch

**Mission Start:** 2026-07-28
**Current baseline SHA:** `7ad084eb54f4e2d5c274d4df2bdbe571d2b09b8c`
**Repository:** `safariarash7777-source/portfolio-platform`
**Last updated:** 2026-07-28 (mission `P2-G1-001`)

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

| # | Work | Gate | Blocking decision |
|---|---|---|---|
| 1 | Package manager normalization (npm) | 2 | `D-018` ✅ decided, execution pending |
| 2 | Production environment repair (service-role) | 2 | — (`B-024`) |
| 3 | Payment → Entitlement design and tests | 2 | **`D-024`** (Arash) |
| 4 | Lead staging and end-to-end verification | 2 | **`D-001`** (Arash) |
| 5 | Truthfulness cleanup | 2 | `B-028` needs Arash on content |
| 6 | Intelligence data model | 3 | — |
| 7 | Arash Desk MVP | 3 | — |
| 8 | Private rehearsal — **≥10 real working days** | 3 | — (`DD-022`) |
| 9 | Assisted intelligence | 4 | **`D-022`, `D-023`** (Arash) |
| 10 | Public homepage | 5 | **`D-019`, `D-020`, `D-021`** (Arash) |
| 11 | Launch hardening | 6 | — |
| 12 | Controlled release | 7 | Arash cutover approval |

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
