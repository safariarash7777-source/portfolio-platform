# Public home and market design transfer — QA receipt

Date: 2026-10-17. PR: https://github.com/safariarash7777-source/portfolio-platform/pull/261

Release hold: coordinator relayed Arash's new product direction after these checks. Do not merge/publish this revision as accepted home content. Home must be reorganized as Arash introduction → real media hub → public market overview → services/investment path. Existing SHA/evidence are retained; no further product code changed at this receipt update. Proposed structure/copy was sent to the coordinator before broad implementation.

Coordinator subsequently authorized implementing that four-part structure on the same PR without another owner approval round. Revision `eba88869d7c03facae1d1935b331645a9e147b15` implements it; exact Preview READY, browser checks and CI39062578255 passed. Independent review then found two media-link P2s, fixed in `e88e76809cfa7e118a61050e5413b0e7fa995964`; final Preview/sanity, CI39062935042 and helper-delta independent review all PASS. Coordinator accepted the delivery and merged PR261 as `9b290be1a28c47c3a684a02ee73272af5e1f0f3e`. Production deployment READY and public smoke PASS below. This is not member/admin/global-setting acceptance. Market/frame deeper interactions remain tied to their actual earlier evidence. Global administrator setting is still open and coordinator-owned.

Scope: approved three visual families transferred to `/` and `/market`, Persian RTL, existing brand tokens/logo/fonts and existing financial calculations/readers. This is not acceptance of a whole-site redesign or an administrator-wide appearance setting. URL selection is presentation-only; there is no global persistence in this PR. Coordinator owns merge, deployment and global-setting integration.

## Revisions and checks

| Revision | Evidence / outcome |
| --- | --- |
| `82a08c0fe17d4b916480749a2b03e6e3671d502c` | Initial transfer. Typecheck, scoped lint, contracts and Next build passed. Preview data read was blocked (`ir=null`, HTTP401 upstream); not accepted as live-data proof. |
| `c60410a59d8b8229950c3fec2e725d4b62efdd98` | Independent review corrections: scoped mobile header height, stale board-state guard, actual frame test, honest missing-source text. Typecheck, lint, 6 contracts, 2 registry checks, 4 public-env tests and full 40-route build passed. Preview public API/SSR read real data: stocks776, funds337, 57 historical index points, public Codal metadata. Freshness correctly labelled stale/old-receipt. Report search/detail/close retained filter and page position (892.8px). Actual browser exposed native-history integration bug despite mock contracts. |
| `3647fa717b130eefcb48118c2107dbffa76dc35e` | Native `replaceState(null,...)` bridge fixed. CI39061361084 success. Actual Next browser PASS: 1→2→3 updates URL and rendered layout; KPI text and report filter identical; same-route nav resets to1; Back restores3 and Forward restores1. Independent reviewer has no open findings. |
| `cb64dc214fe3d3b0919374f3e0a74517f5c316cf` | One CSS line constrains home legacy grid to `minmax(0,1fr)`, following actual mobile ticker overflow. No blanket overflow hiding and no shared ticker/global CSS mutation. Coordinator reviewed exact delta PASS. Browser PASS; CI39061834944 completed/success. Release held for new home content direction, not a technical-check failure. |
| `eba88869d7c03facae1d1935b331645a9e147b15` | Home reordered: factual Arash introduction, real media section, public market overview, existing services/method/record. Removes new slogan and trading-oriented journey cards. Reuses published `content_hub` projection/session/RLS, public URL dedupe and PR254 editorial artwork, labelled as not source media. Keeps error/empty section, original links, dates labelled recorded and sync/publication unknown. Typecheck/scoped lint and8 actual reader/component contracts passed, including2 meaningful new failure/privacy/date tests. Preview/browser and CI39062578255 PASS. |
| `e88e76809cfa7e118a61050e5413b0e7fa995964` | Coordinator authorized a narrow shared presentation-helper correction after review: Telegram duplicate key normalizes username case/trailing slash; other services' post-ID case is retained. Public Twitter/www aliases normalize safely to X; private Telegram and spoofed hosts remain rejected. No visual/market/frame change. Typecheck, scoped lint and20 media/admin/public contracts PASS, including synthetic duplicate/case/alias/private regressions. Preview/sanity and CI39062935042 PASS. |

## Browser receipts on 3647

Preview: https://portfolio-platform-qcavcbfpv-safariarash7777-4463s-projects.vercel.app

- Desktop: all three home and market views visually inspected; navy rail, cream background, soft cards, gold accents and RTL typography match approved design families. Financial layout uses existing market panels, not sales columns. Real values replace prototype synthetic values; no invented scenario, alert or report body.
- Mobile market: verified DOM `innerWidth=390`, `documentElement.scrollWidth=375` in all three views. Captures are375×811 due browser compositor/scrollbar; desktop market captures1265×712, home1419×892. No claim of pixel-exact viewport equivalence.
- Mobile open menu: measured516px height, client515, scroll515; all existing links exposed and menu closes. Scoped `:first-child` header selector prevents clipping the menu.
- Mobile report details: visible native dialog bounds left19/right356.2 at width390; close works. Original public Codal source link retained. Source publication time, platform recorded time and page read time remain separate.
- Browser warning/error log empty in tested market session. Controls were tested after client hydration; an immediate pre-hydration click had no effect and is not counted as a completed interaction.

## Evidence files

### Production public smoke on merge9b290

Coordinator confirmed READY deployment `dpl_D7Ae6sfdJ3p7bx236mkvjFfYcJxN`, exact merge SHA9b290be1a28c47c3a684a02ee73272af5e1f0f3e and primary alias `portfolio-platform-fawn.vercel.app`. This lane also read the deployment metadata before browsing; no additional deployment was initiated.

- https://portfolio-platform-fawn.vercel.app/ shows the corrected Arash introduction and media before market/services. Four real records and all4 artwork assets loaded, original public links and honest old recorded-date warning present. Desktop1280/doc1265 fits.
- One actual layout change1→2 updates both URL`?design=2` and rendered `data-public-layout=2`, retaining the same media titles. The media anchor opens the real media section.
- https://portfolio-platform-fawn.vercel.app/market renders its actual headline/KPIs, chart/pulse, opportunities and public report panels. Existing stale-data label remains.
- Both browser warning/error logs empty. Only public IAB pages were used; no owner Chrome/auth/private session changes. Tabs left as deliverables; viewport override had already been reset.
- `production-home-9b290.png`, `production-media2-9b290.png`, `production-market-9b290.png` are the final Production screenshot receipts, visually inspected. This bounded public smoke does not replace member acceptance, collector freshness proof or the still-open global administrator setting.

### Final helper head sanity on e88e768

Exact final Preview: https://portfolio-platform-95kerp9fb-safariarash7777-4463s-projects.vercel.app (`dpl_ExxoB57PervMtHJ8AM6c7pzUTaCf`, READY, exact e88 SHA verified).

Actual home retains the same4 real titles/source links as eba888 and fits desktop1280/doc1265. Existing `/insights` successfully reads its global layout and actual content, showing26 cards with public original source links. Both browser sessions have empty warning/error logs. New screenshots: `home1-e88-desktop.png`, `media1-e88-desktop.png`, `insights-e88-desktop.png`. Because this delta changes no UI or route composition, earlier all3 mobile/desktop acceptance stays explicitly tied to eba888 rather than being repeated or relabelled.

### Corrected home acceptance on eba888

Exact Preview: https://portfolio-platform-hpqmhtvcl-safariarash7777-4463s-projects.vercel.app (`dpl_AzDUKKncwPbGwUFNm9C2tHb9bS6K`, READY, exact eba888 SHA verified).

- All3 views preserve the same real4 record titles/source URLs:1 Instagram post and3 Telegram posts. Latest recorded date30 Shahrivar1405. UI explicitly labels it older than7days and does not call it a source publication or sync time. All4 reused editorial artwork assets loaded; artwork is linked to the original public post, with the not-source-image caption. No pretend playback control.
- Browser headings preserve introduction → media → public market → services/method. Hero says Arash Safari with existing factual introduction and site domain, without claiming a ready wealth-management service or fabricated outcomes.
- All3 home layouts at mobile `innerWidth390 / scrollWidth375`, loaded ticker width343.2. Desktop `innerWidth1280 / scrollWidth1265`. Moving ticker into its own bounded grid did not reintroduce overflow. Empty browser warning/error log. Viewport override reset.
- `home{1,2,3}-eba-desktop.png`, `media{1,2,3}-eba-desktop.png`, `home{1,2,3}-eba-mobile.png`, `media{1,2,3}-eba-mobile.png` captured through CUA screenshot and visually inspected (home/media examples plus all3 gallery views).
- Returned/thrown reader failure, valid empty response, private Telegram URL exclusion, duplicate public links and unknown independent clocks were tested with synthetic contract inputs. Real Preview showed ready content; error/empty network states were not induced against the real backend. Market browser acceptance remains tied to3647 because no market/frame code changed.
- Helper normalization rationale: [Telegram FAQ on usernames](https://telegram.org/faq#q-what-can-i-use-as-my-username). Only Telegram usernames are case-folded; shortcode/post IDs on other services are preserved and regression-tested.

Final CSS-only head Preview: https://portfolio-platform-30kwz5iaz-safariarash7777-4463s-projects.vercel.app (`dpl_FcLRw8XYjJPbE8mGLR2WBv85Zpfq`, READY, exact cb64 SHA verified). After real ticker loading with12 price items: home views1/2/3 all `innerWidth390 / scrollWidth375 / tickerWidth343.2`. Desktop view3 `innerWidth1280 / scrollWidth1265 / tickerWidth1126.8`. Actual ticker and lower sections reachable and visually inspected. No warning/error log. Temporary viewport override reset. Only home legacy grid changed, so unrelated market/data/modal checks above were not rerun unnecessarily.

- `production-home-before.png`, `production-market-before.png`: original production visual state at base8227008.
- `reference-market1.png` through `reference-market3.png`: approved standalone design lab; visibly synthetic data, not runtime proof.
- `home1-final-desktop.png` through `home3-final-desktop.png`: 3647 home views.
- `market1-final-desktop.png` through `market3-final-desktop.png`: 3647 market views.
- `market1-final-mobile.png` through `market3-final-mobile.png`: actual390px market checks.
- `mobile-menu-final.png`, `report-detail-final-mobile.png`: 3647 mobile interactions.
- `home1-cb64-mobile.png` through `home3-cb64-mobile.png`, `home-ticker-cb64-mobile.png`, `home3-cb64-desktop.png`: final cb64 home acceptance, including loaded ticker and lower content.
- `home1-firsthead.png`, `market1-firsthead-blocked-data.png`: initial iteration, deliberately retained as blocked evidence.

## Limits

- No Production acceptance or independent publish by this lane. Admin/member/media routes and shared auth/DB/schema/schedulers are outside this change.
- All three public views share the same data and loaded components. Their URL chooser is not the requested global admin setting; that remains coordinator-owned work.
- Snapshot is stale. Read success does not establish current market data or successful collector scheduling.
- Company reports are public feed metadata and links, not parsed financial statements. No engagement metrics, private messages or private member content were added.
- Known missing sources remain missing; unavailable timestamps are not replaced with a fresh global clock. No financial engine formula changed.
- No accounts, credentials, private datasets or automatic publishing were connected.

