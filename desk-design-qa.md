# Desk workspace design QA — 2026-10-17

final result: blocked

Blocker: the complete authenticated `/admin/desk` Preview, including the existing AdminShell and real account preference RPC, still needs coordinator browser acceptance. Local component QA is not production acceptance.

## Visual truth and evidence

- Approved sources: `../outputs/desk-design-20261017/option-1.png`, `option-2.png`, `option-3.png` (each 1487 × 1058).
- Implementation: `../outputs/desk-live-20261017/layout{1,2,3}-desktop-final.png`.
- Combined comparison inputs actually opened: `../outputs/desk-live-20261017/comparison-{1,2,3}.jpg`, each containing the corresponding source and implementation together.
- Local browser CSS viewport 1440 × 1024, device density 1. Captured viewport PNGs were 1425 × 894 because the browser compositor cropped the output. Comparisons normalize both images to 745px width; this is composition review, not a pixel-perfect comparison. The bottom of the implementation is outside these viewport captures.
- Mobile: `../outputs/desk-live-20261017/layout{1,2,3}-mobile.png`, `settings-mobile.png`, `error-mobile.png`, `empty-mobile.png`; CSS viewport 390 × 844, content width 375 with scrollbar. All panels remained within content width; no horizontal overflow.
- Focused evidence: `../outputs/desk-live-20261017/report-detail-desktop.png`, `settings-mobile.png`. Opened these states in-browser as well as capturing them.

The test harness lives outside the repository at `../outputs/desk-live-20261017/harness`. It imports the actual workspace/hook/styles/chart, uses the actual project's Tailwind configuration and local Vazirmatn/Pelak fonts, and substitutes only Next navigation and preference transport. Its banner explicitly states that preference storage is temporary. Data came from the site's public API, public Codal metadata for one symbol, and 57 real points in each index series from the public market page. Private research was not read.

## Comparison history

1. [P2, fixed] Tall header and duplicate chart provenance pushed the report region too low. Reduced desk header/market spacing, scoped the duplicated legacy chart caption out of the workspace, made full historical provenance expandable while retaining latest source dates, and added an optional chart height of 220 for the desk. The shared chart default remains 280 for existing public pages.
2. [P2, fixed] After removing fixed grid rows to let hidden panels compact, layout 2 placed data alerts ahead of the observation queue. Explicit desktop presentation order restores observations at the right of the chart; mobile layout 2 prioritizes observations and layout 3 prioritizes data alerts. Both are the same panel tree and data.
3. [P2, fixed] Late preference reads could overwrite a successful save. Synchronous request exclusion, response identity, abort and monotonic receipt revision checks now protect the actual hook. Deferred GET/PUT regression tests passed.

## Required fidelity surfaces

- Typography: actual locally hosted brand fonts and shared format helpers; headings use Pelak, body Vazirmatn. Final authenticated shell/font delivery remains unverified.
- Spacing/layout: broad market ribbon, chart with adjacent priority column, report/observation regions below; soft depth in layouts 1/2 and flatter risk emphasis in layout 3. Lists are bounded and independently scrollable. The operational source clocks add content absent from the approved demo; private-page density needs final Preview review.
- Colors/tokens: existing navy/gold/cream, semantic warnings and dark-aware text tokens; no raw palette or global stylesheet changes.
- Images/assets: no new raster assets are required in these financial panels. Existing AdminShell owns the supplied brand logo; the local component harness deliberately does not approximate that shell or logo.
- Copy/content: only existing real data/calculations; missing values are dashes/explicit states. The original normalized illustrative dual-line graph is replaced with the existing selectable real-value index chart, and fictional scenario/financial-report fields are omitted. Codal cards are announcement metadata; research is explicitly an unapproved stored draft. No live agent is implied.

## Browser interactions checked

- Three layout switches and selected state; identical data across views.
- Hide research, save a validated temporary receipt, reload, confirm chosen layout/hidden panel; reset creates a subsequent receipt.
- Report search reduced the public set to three rows. Opening and closing details retained `صورت‌های مالی` and page scroll 760 before/after, with list offsets unchanged.
- Source time, platform record time and page read time appear as distinct fields; unknown times remain unknown.
- Chart renders real points; series and point-range controls are available; expansion opens the same chart data.
- Explicit error and empty fixtures remain distinct; initial preference loading disables selection controls.
- Mobile settings dialog and all three views fit without horizontal overflow.
- Browser error/warning log was empty in the final normal component run.

## Remaining acceptance checklist

- Compare and capture the complete authenticated Preview, including real chart, Codal categories, actual stored research or honest unavailable state and existing shell.
- Verify actual account save/reset receipts, logout/login persistence, separate admin ownership and ordinary member denial against the installed migration.
- Confirm all three complete-page desktop/mobile views and private-source failure isolation on the deployed candidate.
- Coordinator updates the sole status ledger `docs/COMMAND-CENTER.md`; this file is visual evidence, not a parallel release plan.
