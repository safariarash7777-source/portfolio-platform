# M1 revision 2: image identity correction only

R1 remains immutable and was not adopted. b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24 is the OCI INDEX, not the image config ID; R1 wording was incorrect.

Reviewed repository docker.io/library/postgres; linux/amd64 manifest sha256:aa90e97ee862e558111d34cfb8b2c4bec768c2b039fb791341686928560263b3; config ID sha256:79bd7c99e923138f136f8009d6bffa66e21e9d4fda5c0c561b00fc9c90cfe537. Root receipt first retained mapping UNKNOWN following HTTP307; subsequent config-readback.json verified the 8728-byte config and platform. Neither evidence ran Docker: runtimeInspect and preload NOT_RUN.

M1 recipe now distinguishes repository/index/manifest/config/platform. Every owned-container inspect also verifies local image Id, exact postgres RepoDigest and Os/Architecture before operations. Create keeps --pull never. Existing R5/Windows/primary image constants remain unchanged. Adapter hash is repinned in controller. 11 mock tests PASS, including rejection of index-as-config, missing manifest provenance, arm64/windows, and changed contract before transport. Full three-file patch reconstructs exact proposed UTF-8 bytes.

Optional preload proposal for root review in SAME isolated Linux job, prior to prepare/execute (NOT executed, NOT adopted):
    docker pull --platform linux/amd64 postgres@sha256:aa90e97ee862e558111d34cfb8b2c4bec768c2b039fb791341686928560263b3
    docker image inspect postgres@sha256:aa90e97ee862e558111d34cfb8b2c4bec768c2b039fb791341686928560263b3
The inspect must yield exact Id79bd, RepoDigests containing postgres@aa90 and Os=linux Architecture=amd64. Stop on mismatch; no fallback to index, tag, another architecture or implicit pull. R1 OPTIONAL-workflow-wiring.patch remains a separate unadopted proposal; this text adds the explicit preload requirement, not a new workflow.

All other R1 source/test limitations remain: no actual PostgreSQL semantics, restore/rollback acceptance, native execution, production authority or full consumer acceptance. fullConsumer NOT_WIRED; root owns review, integration, preload and any future fresh allocation/dispatch.
