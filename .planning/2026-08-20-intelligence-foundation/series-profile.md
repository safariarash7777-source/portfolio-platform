# Part B — series quality profile (live Production, read-only)

Source: `public.symbol_history` on `uooeygybrniptzdxuzhj`, read `2026-08-20`.
Exact `count(*)`, never `reltuples`.

## Correction to my earlier claim

In the Wave B inventory I wrote that gold had **no persisted series** and that
Wave C was blocked on ingest. **That was wrong.** I traced the *commodity relay*
(spot metal prices, held in memory) and stopped there, without checking whether
gold was already covered as an **ETF** inside `symbol_history`. It is, with years
of history. Nothing about Wave C is blocked by missing gold or fixed-income data.

## Core candidates

| symbol | rows | distinct dates | first | last | lag | dup dates | bad close | daily sd | daily avg | \|move\|>10% | median \|move\| |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `اعتماد` | 2754 | 2754 | 2015-03-14 | 2026-08-19 | 1d | 0 | 0 | 0.114% | +0.0949% | 0 | 0.089% |
| `طلا` | 2211 | 2211 | 2017-06-10 | 2026-08-19 | 1d | 0 | 0 | 2.452% | +0.2531% | 4 | 1.119% |
| `عیار` | 1973 | 1973 | 2018-06-02 | 2026-08-19 | 1d | 0 | 0 | 2.604% | +0.2361% | 5 | 1.196% |

No duplicate dates, no null/non-positive closes, all current to the previous
trading day. No return exceeds ±25%; the extremes are −14.4%/+13.4% on the gold
funds, consistent with real market moves rather than data faults.

## Intersection coverage

| pair | common days | first | last |
|---|---|---|---|
| `طلا` + `اعتماد` | 2210 | 2017-06 | 2026-08-19 |
| `عیار` + `اعتماد` | 1972 | 2018-06 | 2026-08-19 |
| all three | 1972 | 2018-06-02 | 2026-08-19 |

`corr(طلا, عیار)` on daily returns = **0.9301** — close, but not
interchangeable; ~7% of joint variance is idiosyncratic.

## Equity leg (already used by the allocation page)

| symbol | rows | first | last | bad close |
|---|---|---|---|---|
| `فولاد` | 4607 | 2007-03-11 | 2026-08-19 | 0 |
| `فملی` | 4630 | 2007-02-04 | 2026-08-19 | 0 |
| `شپنا` | 4327 | 2008-06-29 | 2026-08-19 | 0 |

## Can the existing allocation page compute its presets?

**Yes, all three.** `app/(protected)/terminal/allocation/page.tsx` already reads
`getSymbolHistory()` from `symbol_history` for exactly these six symbols and runs
`runAllocation()`. Every symbol it names has continuous, current history. No new
persistence path is needed to compute the presets.

## Fixed-income candidates from the same feed

Screened by evidence, not brand: >400 return days, current within 10 days, daily
sd < 0.5%.

| symbol | days | sd | avg daily | days < −2% | avg value traded |
|---|---|---|---|---|---|
| `اعتماد` | 2753 | 0.114% | +0.0949% | 0 | 2.38e12 |
| `آکورد` | 2489 | 0.142% | +0.1003% | 0 | 4.62e12 |
| `کیان` | 2313 | 0.173% | +0.1033% | 0 | 1.56e13 |
| `یاقوت` | 1510 | 0.160% | +0.1007% | 0 | **2.54e13** |
| `فردا` | 1314 | 0.071% | +0.1080% | 0 | 5.34e12 |
| `ثبات` | 1153 | 0.077% | +0.1123% | 0 | 5.89e12 |

### A trap that brand preference would have walked into

`کمند`, `امین یکم`, `ارمغان` and `همای` are popular fixed-income ETFs, and all
four are **unusable as total-return proxies from price alone**:

| symbol | avg daily return | days < −2% |
|---|---|---|
| `کمند` | +0.0014% | 28 |
| `امین یکم` | +0.0020% | 21 |
| `ارمغان` | +0.0006% | 26 |
| `همای` | +0.0033% | 25 |

Their price is pinned near a fixed value and the return is paid out as
distributions, so a price-only series shows a fixed-income sleeve earning
**roughly zero** over eight years. The recurring sharp negative days are
ex-distribution drops, not losses. Any backtest using them would understate the
sleeve badly and look plausible while doing it.

The accumulating funds above do not have this problem: ~0.10%/day ≈ 25–30%/yr,
which is the shape a fixed-income sleeve should have.

## Recommendation (provisional, evidence-based)

- **Gold sleeve → `طلا`.** Longer history (+238 common days against the
  fixed-income leg), marginally lower volatility (2.45% vs 2.60%), fewer extreme
  moves (4 vs 5). `عیار` is a reasonable second and correlates 0.93.
- **Fixed-income sleeve → `اعتماد`.** Longest series by a wide margin (2754
  days), lowest volatility among accumulating funds, zero days below −2%,
  adequate liquidity, and it is already wired into the allocation page.
  - If liquidity is weighted above history, **`یاقوت`** (10× the traded value)
    or **`کیان`** are the alternatives, at the cost of ~1240 and ~440 days.

Backtest window with `طلا` + `اعتماد` + the equity leg: **2210 trading days
from 2017-06**, roughly nine years.

## Still the owner's decision

Which gold instrument represents the sleeve is a **product** question, not a
statistical one — `طلا` and `عیار` are both gold ETFs but track different funds.
The evidence above ranks them; it does not decide.

## Not done

No new persistence path was built, per instruction — this profile stands for
Command Center review first.
