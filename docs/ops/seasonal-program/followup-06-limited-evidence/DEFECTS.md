# Findings from the limited independent integration review

Owner: PR180/Auth. Separate reviewer actual UI-issued session on application `d941b0b47520449e097dcdb0f31eef77e93cdd3c`, 2026-10-01T19:23:05Z–19:23:09Z; exclusively synthetic native sandbox. Evidence: independent-profile-fault.json. Root will apply the narrow classification repair in its own integration PR186; owner branches and providers remain untouched.

| ID | Reproduction and observed effect | Required behavior |
|---|---|---|
| F06-LIM-IDENTITY-01 | Actual A login/nativeUser200; identityGET200. Owned gateway Auth transport returns503; identityGET instead401; restored identity200. Member adapter maps401 to sign_in_required (source inference), concealing service failure as login loss. | Missing/rejected session401; actual upstream/network failure503; no profile reads or writer calls on failed Auth. |
| F06-LIM-IDENTITY-02 | Same issued session/statusGET200 authenticatedtrue. Actual Auth503; statusGET instead200 authenticatedfalse; restore200 authenticatedtrue. | Honest503 network_or_configuration_error, no role query; guest stays200 authenticatedfalse. |

Identity POST uses the same misleading error classification; its affected failure path must be covered by behavioral HTTP regression and independent fault retest. Successful phone-proof identity writes remain OPEN. No session/phone proof is fabricated to make tests pass.

Separate environment defects, already repaired without application changes: Auth initial startup preceded PostgreSQL readiness (SQLSTATE57P03); PostgREST schema cache preceded additive identity installation (RPC404 despite catalog function present). Attempt evidence retained. These do not establish an Auth/identity source defect by themselves.

Final independent affected recheck: a49e37cecc7922d6d80c174910301e24a1841aee at2026-10-01T19:29:51Z–19:29:58Z. Both findings CLOSED within limited scope: GET/POST identity and Authstatus503 during nativeAuth503; recovery and legacy phone prerequisite preserved; real member adapter distinguishes unavailable. See independent-profile-fault.json/independent.md; initial failures retained in attempt evidence.
