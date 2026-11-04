# M1 revision 3 independent bounded closure

Date: 2026-11-04. Verdict: **SOURCE_PASS_BOUNDED** for R3, including the R2 image-only delta. The stale adapter-pin P2 recorded in sibling revision2 is closed. No remaining P1/P2 was identified in this review scope. This is not operational adoption or native acceptance.

## Closure and byte identity

- Receipt SHA256: `bf2dc429608361223bb50581ebe71ccbb576bfab34881f6d33c2bd4cc0a35399`.
- Full patch SHA256: `deb4fc08822d74c3f9a804ad97fa268ac71621d9c49b774eac315153cbd2a72a`.
- R2-to-R3 delta SHA256: `62c2e16d93fdf148e2fcf9e8bfb90e6c96e860c661f78e38ff0e867ea93de549`.
- Controller SHA256: `d191eab4db73d4c4f8f07bc1e5371abdcd77895a0d3d8a0b7c31b3ccd5ffbbe5`.
- Test SHA256: `aa4e95851447d91abadc3f100df6a29193f0de77110b460c5e1a42a1b62038d5`.
- Adapter SHA256: `714264d29c18601b7ea38559fe706e18efd65bbf8e4cb0f1a5bc679464308c3b`.

Full patch against the pinned base reconstructs all three proposed files byte exactly. The two-file R2-to-R3 delta independently reconstructs controller and test exactly; adapter bytes are unchanged from R2. This was checked in memory, with every context/removal line and hunk count verified.

Controller `run.py:429` now pins the actual packaged adapter hash. An independent read-only comparison confirmed equality. Added test `test_controller_adapter_pin_matches_actual_source` reads the adjacent actual adapter file and compares its SHA256 to the actual controller constant; its relative path resolves from assembled-native-ci/test_run.py to testing/consultation-feedback/install-feedback.py. R3 README explicitly preserves the failed R2 and corrects the earlier repin claim. No guard was weakened to bypass the pin check.

## Image-only source conclusion

R3 retains the reviewed R2 contract: repository docker.io/library/postgres; OCI index `b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`; linux/amd64 manifest RepoDigest `postgres@sha256:aa90e97ee862e558111d34cfb8b2c4bec768c2b039fb791341686928560263b3`; config ID `sha256:79bd7c99e923138f136f8009d6bffa66e21e9d4fda5c0c561b00fc9c90cfe537`.

The R1 report's description of b0f as a config ID is superseded by the root registry evidence and this correction. The initial root receipt's HTTP307/mapping UNKNOWN remains historical; the subsequent config-readback records verified registry descriptors/config only, not runtime inspection.

The caller recipe and all three resources carry the separated contract. Local image checks require fixed config ID, expected manifest RepoDigest membership and linux/amd64 before mutation; changed contract rejects before process transport. Creation remains `--pull never`. Added hostile cases address index-as-config, missing manifest provenance, wrong architecture/OS and changed contract. No additional image-contract source finding remains.

The explicit preload text and original optional workflow patch remain separate unadopted same-job proposals. They introduce no parallel workflow/runner or implicit create pull. Actual preload and Docker image inspection are NOT_RUN. Legacy R5/Windows/primary image constants, prior M1 filesystem/SQL/history/no-replay/cleanup closures and the quiescent-synthetic-snapshot limitation remain unchanged.

## Acceptance boundary

The author's twelve mocked PASS are reported evidence, not a reviewer rerun or actual crypto/Docker/PostgreSQL acceptance. Root must separately adopt exact controller/workflow source, preload and attest the exact manifest/config/platform, issue a fresh allocation, and obtain actual Linux/SQL restore, inverse/history and cleanup evidence. Full consumer/Auth/browser/production acceptance remains absent; fullConsumer is NOT_WIRED. No current production-backup claim is made.

Method: source/metadata reads, SHA256 checks and in-memory patch reconstruction only. No tests, candidate imports, network, pull, Docker, SQL, native operation, credential reads or shared-checkout changes.
