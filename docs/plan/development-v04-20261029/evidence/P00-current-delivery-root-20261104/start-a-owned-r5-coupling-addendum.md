# Coupling map clarification

The root has ALREADY selected purpose `owned-start-a-copy` and authority profile `GHA-owned-copy.v1`. The outstanding work is implementation and review of their wiring, not another purpose/profile decision. The hashed map `coupling-map-ffbb1d2.md` remains unchanged.

“No fresh profile” forbids substituting an unrelated fresh runtime/cohort for continuation on the same owned DB, actors, sessions and history. It does not prohibit the minimum necessary changes to the existing caller and its existing lifecycle to implement the selected purpose.

Acceptance must remain separate:
- SQL-copy acceptance: exact owned resource/backup/restore binding, one reviewed two-SQL payload, unknown-write readback and preserved history. It does not establish application, Auth or Chrome acceptance.
- Same-context consumer acceptance: actual compatible reader and writer behavior, same actors/session/original rows, extended-writer stop, financial/history/SQL rollback checks and fresh GET/DOM continuation within that same owned lifecycle.

Network, marker, name/label and cleanup mismatches remain concrete wiring requirements. Resolve them through explicitly reviewed changes in the same caller/lifecycle; do not relax identity or isolation guards or relabel incompatible evidence. No new runner, unrelated cohort, operational execution, patch or test is authorized by this addendum.