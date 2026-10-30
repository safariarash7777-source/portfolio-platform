# P09 native Auth acceptance adapter

Base: frozen PR349 `37b0c1b9acdd7e38bcd6d39b31d4d847892fd321`, itself on PR330 `87aaa541618a26e4d7ba9756e62114c1279e6939`. START-B owns this bounded adapter; C's projection/panel/read tests, Workbook handlers, writer/store/DTO and the SQL candidate remain unchanged. There is no dependency on C's later unfinished intent-metadata follow-up.

## Actual shared-runtime reuse

Root gated extraction first: PR353 `0c6d6bce0ba3a8e3b2306c2060edf3c45c8ee499`, CI `41064184795`, native job `124091182432`: five jobs successful, nine genuine GoTrue/PostgREST/Next PF10 phases and six owned resources removed. Only the two reviewed helper blobs transfer here: `native-auth-runtime.mjs` Git blob `da913282f2bb8119a553e6f77807ee30f7d1b301`, and `native-auth-gateway.mjs` blob `1f60ca9468a12317301af57ecafa51d2b8c41853`. A guard verifies the exact Git blob identities. No merge/cherry-pick of PR350 or its financial-product ancestry is used.

`workbook-native-auth.mjs` calls the same `runNativeAuthProfile` lifecycle and fixed gateway. Only the compiled `p09` profile is selected: existing Auth/profile bootstrap, phase34 and PR330's intent candidate, two real admins and one member. It reuses pinned images, actual kernel tmpfs checks before every SQL, source tree/lock identity, private synthetic credentials/POST intents, SDK getUser/SSR cookies, fixed loopback transport, real Next API routes, and ownership cleanup. There is no custom remote/SQL/route profile, provider/model, privatePreparation flag, new package, ACL repair or unfreeze. Existing SQL6 tests and their separate sanitized receipt remain required; no gate or previous test registration is replaced.

## Nine required phases

1. Shared runtime identity/isolation attestation.
2. Three fresh GoTrue password sessions verified with installed SDK getUser.
3. Two authorized admins read native canonical v1/review; member denied. Review UUID refers to actual v1 UUID.
4. Actual component commits v2; its 201 is deliberately discarded by the transport. Destroy that hook-host instance, obtain a fresh password session, remount and recover with GET only. V2 remains unapproved.
5. A separately explicit same-intent/body replay returns the existing result without a duplicate v2.
6. Another admin cannot read/replay A's journal, member is denied, service SELECT on journal is denied, native invalid JWT fails. Existing service canonical backup SELECT is preserved.
7. A distinct prepared request has no workbook POST. Remount independently GETs target absence, then an explicit UI retry sends the original JSON bytes/intent/base. No auto retry/rebase.
8. The panel projection consumes the existing recovery GET; compare native persisted UUID/time/review references, preserve unknown actor/worker/read clocks, and add no panel HTTP request or private body.
9. Native mutation denial and independent v1/v2 readback retain original content and review-on-v1 only.

Body content is explicitly synthetic/test data from the existing fixture; it is not real Folad research. Persisted source references mean native row IDs and timestamps, not independently verified financial documents. No privatePreparation field is used. The existing React hook host is reused with real HTTP/Auth/DB behind its WorkbookTransport; this is not DOM/browser acceptance. Deliberately discarding a received 201 is not a TCP disconnect. Logs expose only sanitized synthetic row references; credentials and full request/body stay in memory/private runner temp and are not uploaded.

The adapter loads the panel through the same CommonJS module cache as the existing hook host; an ESM bridge's wrapped default is not that function identity. After unmount, a fresh session runs with the hook host's temporary `window/document` globals suspended and then restored. This preserves the actual Node SDK environment (and avoids its browser BroadcastChannel detection), without changing the shared Auth/session/getUser implementation or options. Offline guards check module identity and restoration on success/error.

The only integration changes are one additive native step in the existing `research-workbook-native.yml` after SQL6/count/receipt verification, and one additive guard path in the existing `test:core` registry. Run `node --import tsx scripts/isolated-e2e/workbook-native-auth.mjs` only inside existing Linux CI. Local guards do not launch infrastructure. All nine phases and six owned resources removed are required; unknown writes stop without replay. Infrastructure/data/model cost amounts remain unmeasured, with no purchase or new model action. Target installation/backup-restore, real target Auth/browser usability and Arash acceptance remain separate and unobserved.
