# M1 phase-evidence filename fix — source-only candidate

Base: raw Git `499166f81d1074ec7c906bac49706507b253fee1`, tree `c4d4046e8e15ad4539975a173bd57eb2c27b6459`. This packet is not adopted and authorizes no native operation or replay.

## Source cause and public-receipt limit

At base run.py:540–542 the first observe_phase constructs `m1-phase-controller_binding.json`. The unchanged adapter's OwnedPrivateStore.name at lines 692–694 accepts only `[a-z][a-z0-9.-]{0,90}`; underscore is forbidden. With this exact source and adapter, the first phase write therefore raises `m1_evidence_name` before authority reading, capacity, lock or allocation. That code is outside the public whitelist, so the projected code is null while phase remains controller_binding. This is a deterministic source incompatibility, rather than a cause inferred solely from the public receipt.

The public run 41838229728 receipt is consistent with it, but contains no capacity measurement or lock evidence. Low disk space, lock failure and a binding mismatch are not established by that receipt. No private log was read and no run was replayed.

## Minimal change and effect

Only run.py and test_run.py are patched. M1_PHASES is byte-for-byte unchanged. A closed mapping derives evidence names for those phases by replacing underscores with dashes; observe_phase looks up that mapping. The recorded enum value stays controller_binding, initial_roles, etc. Unknown keys have no fallback or alias.

OwnedPrivateStore.name and adapter hash `88da3b8b1699e0bfb0655d0fbba49bac0220aa8069abea0a654faa074788f353` are unchanged. No profile, whitelist, SQL, image, capsule, workflow, resource budget, authority or replay policy changes. The effect is to remove the first filename rejection so execution can reach its existing binding/capacity/allocation gates. It does not establish that those later gates or actual operations will succeed.

## Offline verification actually run

Three targeted tests PASS, zero skipped/failed, using the existing Python runtime:

1. All eleven phase names pass the actual unchanged OwnedPrivateStore.name on an instance created through __new__, without calling its filesystem constructor. The original first filename really raises m1_evidence_name. The map has exact enum coverage, unique names and rejects unknown/alias keys.
2. The actual m1_execute function uses that validator through an in-memory store, reaches the allocation mock exactly once, and preserves underscore enum values in records. A synthetic m1_deadline then verifies bounded failure projection before close; no Docker/allocation is performed.
3. The existing execute first-failure ordering test remains PASS.

offline-check.py denies socket/subprocess boundaries and filesystem mutations/writes during the targeted tests. It observed zero such attempts. This is a targeted guard, not a universal sandbox or Linux filesystem proof. The initial test-text assembly SyntaxError occurred before any test ran; targeted-tests.log preserves it. The corrected run is targeted-tests-final.log. No whole-suite result is invented or rerun.

## Raw Git application proof

PROPOSED.patch was generated from raw base bytes in a fresh private bare repository/index, using the shared object store only as a read-only alternate. A second fresh private index was populated by read-tree of the exact base, then `git apply --cached --whitespace=error` succeeded. Both resulting index blobs were read back byte-for-byte against proposed files. Only the two authorized paths differ from the base; all other index paths, including the adapter, remain unchanged.

Applied private tree: `f5f1c9cdb1ca348d01ea0b8c5be6886244bf5f79`. See SOURCE-PINS.json and RAW-GIT-APPLY-PROOF.json for full hashes. No shared source, index, ref or branch was modified.

## Delivery boundary

Source packet only. Root reviews/adopts and owns any fresh allocation/dispatch. No native, Docker, pull, SSH, key, SQL, provider, network or production operation was performed. Previous allocation/private history is not changed. Actual Linux/SQL/restore/consumer acceptance remains unverified; primary NOT_APPLIED and fullConsumer NOT_WIRED remain the existing limits.
