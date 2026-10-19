# Capitalization precision candidate — 2026-10-20

## Evidence and bounded scope

- `relay/package.json` supports Node >=18 and declares no dependencies. No existing lossless JSON parser was found in the root lockfile or relay package. No relay Dockerfile is present in this checkout. A read-only host version query returned Node v18.19.1; that alone does not identify a separately hosted relay runtime. No parser or collector was run on the server.
- Precision is lost at `relay/brsapi-client.mjs` successful-response `res.json()` and the legacy `server.mjs` / `symbol-detail.mjs` paths. Later conversion in server's `equityNumber` / `marketValue` cannot restore the original token.
- The current ECMAScript [JSON.parse specification](https://tc39.es/ecma262/multipage/structured-data.html#sec-json.parse) includes source-aware reviver behavior. This candidate does not require it because the supported Node baseline is older. [Node 18 release reference](https://nodejs.org/en/blog/release/v18.20.8). No new dependency or engine upgrade is proposed.

## Pure candidate contract

`relay/capitalization-json.mjs` takes untouched response text. Native JSON.parse first checks the entire JSON grammar. A string-aware lexical pass quotes only numeric values belonging to decoded property names `mv` or `marketValue`; a final native parse canonicalizes those fields to exact decimal strings or null. Other properties keep existing JSON.parse behavior. This is not a general lossless JSON parser.

The conversion uses decimal character operations, not floating-point arithmetic on the monetary token. Scientific notation and decimal notation are accepted only if their exact value is a nonnegative integer. Zero remains `"0"`; universe eligibility still rejects zero capitalization. Negative values, fractional results, objects, arrays, booleans and unit-bearing text become null. Unit is never guessed: callers still need reviewed IRR / issuer-total-equity evidence. JSON duplicate names retain native last-key-wins semantics; parser does not claim that duplicates prove data quality.

Limits: input 8 MiB UTF-8; amount token 128 characters; exponent magnitude 64 with at most three exponent digits; canonical integer 64 digits. Unsupported magnitudes abstain (null); invalid JSON and oversized text throw sanitized constant errors without response excerpts. No blanket regexp replacement inside strings. Escaped property names, arrays and nested objects are tested.

## Integration next, coordinated with data owner

Do not parse JSON.stringify of a previously parsed response: precision has already been lost. Do not globally replace the generic budget client's JSON semantics for all endpoints.

1. Add a reviewed opt-in response parsing mode only for the existing AllSymbols / Symbol natural requests. Both budget-client and legacy fallback must use the same parser on `await res.text()`; retain existing timeout, pacing, deduplication, endpoint allowlist and request budgets. No additional provider request.
2. Preserve an additive exact-cap field in the normalized snapshot while maintaining old display numeric fields until consumers migrate. Detail JSON retains exact mv string; normalizer must not immediately call Number on the exact field. New field names and deployment ownership are to be coordinated, not silently invented in this candidate.
3. Readiness consumes the exact field only with definition/unit/identity evidence. Existing JSONB rows that already contain rounded numbers are not repaired; accuracy begins with subsequent natural receipts.
4. SourceDate stays independently missing if provider omits it. Receipt time cannot close the source-clock blocker. ISIN still does not imply verified issuer mapping.
5. Acceptance: same natural request count and quota behavior; hostile/malformed text bounded; exact original token survives response → mapper → stored JSONB → readiness; old field/API consumers unchanged; isolated synthetic fixtures first, then inspect one natural receipt without starting collection.

Files owned by candidate: capitalization-json.mjs, its test, this document. Existing server/client/transport/collector files are untouched. This pure parser is not deployed or wired; it removes the local parsing limitation only once the next scoped integration is accepted.
