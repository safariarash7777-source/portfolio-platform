# P09 workbook-f3 R1 independent source peer

Date: 2026-11-04. Verdict: **P2_OPEN — server-side mutation path bypasses the claimed global presend/GET-only boundary**. This is a source finding; no actual extra POST or runtime incident was observed. R1 remains unchanged.

## Finding and trigger

Sealed helper `scripts/isolated-e2e/native-auth-runtime.mjs:112` guards the native/scenario transport and line 158 supplies that transport to the scenario's Supabase SDK client. The browser shares this admission object at workbook-browser.mjs:162 and enters read-only mode at line 192.

However, native-auth-runtime.mjs:148 starts the actual Next gateway in a separate process. Sealed native-auth-gateway.mjs:36–38 forwards every /auth/v1/ and /rest/v1/ request with its original HTTP method directly to port 32190. That forwarding path has no presend admission, bound intent, budget count, poison signal or read-only gate.

The exact app f3 uses direct fetch in middleware.ts:16 and calls supabase.auth.getUser at line 41. Its comment at line 31 explicitly describes cookie refresh during getUser. lib/supabase/server.ts also constructs its server SDK client without the scenario admission transport.

Concrete trigger condition: a GET of the real protected page during the declared GET-only window causes the separate server SDK to issue an Auth refresh POST. CDP sees the initiating page GET, not this server-to-Auth POST; the scenario SDK wrapper is not on that process's path. The gateway forwards the POST without recording or rejecting it. Consequently the admission object can retain its 24 counts/readOnly proof without covering this additional mutation. Fresh sessions may avoid refresh on the happy path; that does not provide the promised fail-closed protection against an unexpected server-side mutation.

Required correction before future activation: bind presend/unknown/read-only enforcement to the actual private helper/gateway boundary that forwards server Auth mutations, preserving the exact application. Do not fix this by raising the 24 caps or by double-counting legitimate internal REST RPC work beneath an already admitted product POST. Offline regression should exercise the actual forwarding boundary, including an otherwise GET-only browser flow producing an attempted server-side non-GET, before any native acceptance claim.

## Other bounded source conclusions

- The 24 admitted outer mutations are derived from the actual scenarios: 3 Auth creations, 7 password logins, 4 prepare, 7 save, 1 decide and 2 denied PATCH calls. Node/scenario and browser writes use the same in-process admission object, with exclusive intent before forward, bound status results and poison/no-retry after unknown transport outcome. This does not cure the separate server path above.
- Known-outcome explicit replay scenarios are distinct from automatic replay after an unknown write. The source rejects poisoned/pending proof and has a closed typed public projector. Public receipt projection contains fixed outcomes/counts and the exact app identity; private bodies/JWT/SQL/raw stderr are not copied into that projection.
- Resource creation records intent and observed full IDs. Dedicated cleanup loops continue across independently known resources after a failure; missing IDs or unknown creation cannot produce PASS. Short-temp identity is allocation/owner/device/inode bound, with the original Chrome path/driver limits retained. This is source assessment, not actual cleanup acceptance.
- R1's Auth/REST/Node image mappings are null. Both preload and prepare fail closed before allocation/native work. The new registry metadata reported by root is input for a later revision only; it is not part of this R1 verdict. Runtime creation retains pull-never; the same-job preload proposal is unadopted.
- All 88 historical test methods are source-text exact; five methods are added. The changed tree paths are exactly the six receipt paths. M1 adapter, old capsules, source resources and historical fixtures have no tree delta to base499. Root owns compatibility with later M1 changes.

No additional P1/P2 was established in this bounded review. The author's reported 93 offline and five targeted PASS were not rerun and do not establish Auth/browser/SQL/cleanup runtime acceptance.

## Independently checked identity and evidence

- Controller base: `499166f81d1074ec7c906bac49706507b253fee1`.
- Proposed tree: `3af01c7a843ce6ec0eac356cf5bcffcf9dccd0eb`.
- Application: `f3aa9bd51d06e308b08b56651cac4733ea49af8e`; tree `b576021a2248f6887319f4ee226df79e906dbe45`.
- Helper source: `67aeda9ff84fb1d3e936fc39564c0e551b3ff17e`.
- Packet receipt SHA256: `bbb10ebbf6dd9395dd513a706c77b7dec8db6ea11fd594ceac3b93f55b464819`.
- Patch SHA256: `f7237f9603deda1760a9bd7845b5253d6090927c8d2b4f6fa13cd79970cf7268`.
- Manifest SHA256: `121a784135d9f912423a567fbbbdc5c4ce513c19aca381f45767edafde173a14`.
- Four-helper tar SHA256: `c439ec1163865b2353eb64e713632ff94406a2f94c46fd0c9bda45006402b52d`.

The six raw base/proposed source pins, eight app f3 pins and four original helper67 pins were independently compared to immutable local Git objects. The tar was read in memory without extraction/execution: exactly four unique regular members, each matching its declared bytes/hash. All six blobs in the author's proposed private Git tree equal the proposed file bytes. The peer did not independently rerun cached apply because this task prohibited index/source writes.

| Reviewed sealed helper | SHA256 |
| --- | --- |
| native-auth-gateway.mjs (unchanged from helper67) | `d4b971d7f1770bd7e4d415d44a45f51a6e01f60a4b4737383040f1590b530867` |
| native-auth-runtime.mjs | `583caef187fd7f12d31bc3f1d7cbc96ba3c5802c89dee91fcdde97655090289a` |
| workbook-browser.mjs | `05a54200631c4e2818d0f354f8fe62131fdcd526afbad3dac837fde8146a4735` |
| workbook-native-auth.mjs | `d862b3a90f7daecdc2fd6c1851f7e3dac324a0c49d0658960f65a332f9983062` |

App f3 middleware.ts: Git blob `c81b575cc7d947d2026036a46330db098273a263`, raw SHA256 `c8fba36a5c59f6fdd39d36498f697466735880e5932e5aaddb829a91695313c2`. lib/supabase/server.ts: Git blob `3b3f57562e03d094198bbb9b22c1edde70becec6`, raw SHA256 `f002294c8adc8e724531de7cddc369e3b127c661021fa9f48e5980323d9535ae`.

Review method: local source/Git-object reads, hashes and in-memory archive inspection only. No tests, candidate imports, network, Docker/pull, SQL, native/dispatch operation, shared source/index/ref change or new agent. Only this authorized sibling peer report was written. Root remains the sole adopter and execution owner.
