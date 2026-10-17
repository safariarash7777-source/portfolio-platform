# Media design QA

final result: passed

Scope: three adapted, opt-in media prototypes using existing public content. This is visual/interaction acceptance of the prototype, not production data or account acceptance.

Inspected the three selected image targets and combined them with browser captures in `docs/design/media-20261017/compare-1.jpg`, `compare-2.jpg`, and `compare-3.jpg`. Source frames were uniformly resized to the capture width and cropped to its viewport height, without stretching. Full-page browser stitching was not used. Desktop viewport: 1440×1024; the browser capture records the visible client canvas rather than the full scrollable page. Layout 2 was compared with details open on both sides. Content differs deliberately: actual public captions replace fictional summaries, so matching text lengths is not a fidelity claim.

Preserved: authentic logo/fonts and navy/gold palette; magazine feature and three-column cards; horizontal reading cards with a left detail panel; gallery feature shelf with two small covers and masonry below; rounded white surfaces, restrained soft shadows, clear source links, and network/type distinctions. Shared management and view controls were added because Arash selected all three layouts.

Fixed before final comparison: list-specific absolute positioning leaked into the detail cover; filters briefly reset before client hydration; gallery shelf needed a distinct hierarchy; initial screenshots were captured before the compositor updated the selected layout and were replaced. Removed the decorative play triangle because no direct media file is available. The primary cover action opens details, while the original link opens the network.

Intentional differences: no fictional YouTube item, taxonomy, live freshness, or engagement counts. YouTube and topics remain disabled with reasons. No source cover is claimed to exist; editorial covers are labelled. Portrait images use central cropping of supplied editorial assets. The common detail panel uses a landscape cover and full-width caption for actual long source texts; it retains the chosen reading view's left-panel interaction rather than reproducing the fictional caption/portrait composition pixel for pixel.

Browser checks: network filter showed four Instagram items; reel filter narrowed to two and survived reload; search empty state and reset worked; Escape returned focus to the opener; detail close retained filters and scroll; default layout selected in management persisted across reload; selected content and source-only cover fallback worked. Loading, error, empty, and unavailable fixtures were inspected. All three mobile layouts at 390×844 reported 375px document width with no horizontal overflow. Named mobile management control opened the dialog. No console errors were observed.

Full Next build and targeted ESLint passed; TypeScript passed; three presentation tests passed. Reduced-motion CSS disables transitions and drawer animation; OS preference emulation and a full screen-reader audit were not performed. Auth/admin session and live Supabase retrieval in the opt-in route were not tested locally: the standalone route uses a public snapshot and the local environment has no real credentials.

Remaining integration work is recorded in `docs/design/media-20261017/HANDOFF.md`. No observed blocking visual or interaction defects remain in the inspected prototype states.
