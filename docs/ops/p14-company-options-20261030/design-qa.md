# Design QA — P14 company options

**Final result: passed for standalone educational prototype review.** Not approved by Arash, not financial/data acceptance, and NOT FOR MERGE.

Source implementation: `3291413ef8245c384271c37d0affbeac4268650b`. Scope: five static prototype files, existing brand assets, one immutable educational dataset. No product API, auth, database or financial engine is involved.

## Comparison target and intentional differences

Opened the existing Arash design-lab reference `design-2-final.jpg` and the new viewport captures; then inspected each reference/prototype side by side in `compare-reference-decision.png` and `compare-reference-dossier.png`. The reference is a general analysis desk; it is the target for brand, typography and layered surfaces, not a company-page pixel clone. Company content and the two different information architectures are intentional changes requested for P14. The source is 1425×891; new desktop captures are 1425×1000. Comparison canvases preserve the pixels and pad the missing height; no stretch or claimed pixel equivalence.

## Findings and fixes

- **P2, first mobile A pass:** the long introduction delayed the summary figures. Moved the reporting-period label beside the identity and omitted the repeated side explanation on narrow screens. All substantive limitations remain in the shared figures/source/ambiguity sections. Recaptured A at 320/390 and desktop after the fix; period remains visible and the first metric is reached sooner.
- **Evidence correction:** the viewport override initially affected the active tab, leaving two A captures at desktop width despite mobile filenames. Those captures remain in outputs and were rejected. Final captures use a single active tab, assert the actual variant and width, and retain six valid observations. A receipt-array reference was subsequently corrected from the retained observations without replaying tests; the initial receipt remains in outputs.
- No remaining observed P0/P1/P2 layout or interaction defects in the inspected states. This is a bounded review, not exhaustive assistive-technology certification.

## Required fidelity surfaces

| Surface | Observation |
|---|---|
| Fonts/typography | Actual local Vazirmatn loaded in all six viewport observations; navy heading hierarchy, readable Persian labels and tabular numbers. No substituted image text. |
| Spacing/layout | Existing rounded, layered card vocabulary retained. A opens with identity/summary and a study path; B opens with the source ledger and a document rail. At 320/390, page scrollWidth equals clientWidth; wide tables scroll inside the labelled region. |
| Colors/tokens | Existing navy/gold/cream tokens and quiet borders/shadows are reused. Unknown values have text and a reason, not only color. No live/success badges on educational data. |
| Image quality | Real `public/brand/mark.png`, proportionally sized, loaded in the initial desktop observations. No generated/recreated logo, decorative substitute or fake official document. |
| Copy/content | Same educational label, six rows, four months and eleven source fields in both layouts. Real source time, collected time, official report ID, official URL and revision remain null with reasons. Cost/profit/margin are not inferred from sales. |

## Behavioral evidence

- Ready views: both variants at requested 1440×1000, 390×844 and 320×844. Measured widths: 1425, 375, 305 including the scrollbar difference. No document-level horizontal overflow in these observations.
- Exact browser parity: data hash `ce410f885eb622fbabfdc0594c8850fad9a27c87ab34a69a35849a16d7915357`, six table rows, four month values and eleven metadata entries match. `browser-local.json` retains the actual rendered text.
- Empty/error: both variants at 390, explicit educational headings, zero financial figure nodes, no numeric-zero substitution and no success claim. Returning to ready restores the same six rows/hash; it is only a display change.
- Keyboard: skip link focuses main; native details open/close with Space; Tab and Shift+Tab connect the state select and reduced-motion checkbox; visible focus outline observed. Quantity/profit searches narrow the actual table and clearing restores it. ArrowLeft moves the wide table within its region while document width stays fixed.
- Reduced motion: keyboard-operated checkbox yields computed `0s` transitions in both layouts. CSS also contains `prefers-reduced-motion: reduce`. The OS media query was not emulated and no system setting was changed. Financial numbers do not animate.
- No console error entries were returned by the inspected browser tab. No API, persistence, model, provider refresh or financial write is implemented.

## Recommendation

Use A as the initial company view for members and quick advisor review, with a clear transition to B for source inspection and deeper research. A brings the known figures and missing profit evidence forward; B keeps the document/period/unit/version context visible before interpretation. Share the underlying data and source ledger, rather than maintaining two versions of company facts.

This is a design recommendation, not Arash's selection or a new product decision. Member observation and real-report acceptance remain separate work.

## Follow-up polish

- P3: after choosing a structure, consider a collapsible mobile document index in B; its explicit index currently uses more of the first viewport.
- Future real-data integration must preserve report selection, source clocks, unit/period and revision contracts. These prototypes do not resolve the existing live-widget blocker.

Implementation checklist: source/brand reconciled; brief recorded before code; two structures built; same-data parity checked; six viewport captures checked; keyboard/state/reduced-motion controls checked; mobile P2 fixed and recaptured. Online Preview/source receipts are recorded separately by exact deployment SHA.
