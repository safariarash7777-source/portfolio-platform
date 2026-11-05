# Member journey v0.4 — entry and trustworthy next step

## Problem, audience and ownership

Member flow: login → existing member home → versioned financial file → service-right/consent boundary → published consultation → follow-up. Existing pages and contracts already cover these areas; this slice does not introduce another dashboard/menu, a parallel financial store, a guessed API or a business policy. The audience is the member and Arash reviewing the walkthrough.

Existing START-B (`01a17cdc…/local`) owns this scoped member-route work and later consumer verification. The integration coordinator (`01a187f6…/local`) owns shared references and allocates shared files. Consultation/admin/backend changes remain with their existing owners. The coordinator explicitly allocated `app/(protected)/layout.tsx`, DashboardPage and AccessStatusCard to START-B before editing; root/C/A will not write those files concurrently. No unallocated shared edit is permitted.

The clean historical `member-journey-20261019` checkout was reused on `codex/member-journey-v04-20261030`. Fresh direct Git read/fetch confirmed main `f93dbdce73ef9e57b8e5eb84af13c4a20034d5bc`. PR330 and PR337 remain separate/unmerged and are not included. Existing dependencies are reused only after matching package-lock SHA; no package/provider/runtime upgrade is part of this slice.

## Reuse inventory and contracts

| Step | Existing route/components | Authority and limits |
|---|---|---|
| Entry | `(auth)/login`, middleware, `authSessionFailure`, `accountEntryHref`/`normalizeReturnPath` | SDK/session result and existing error classification; safe local return target. No real-account creation or guessed Auth flow |
| Home | `(protected)/dashboard/page.tsx`, `DashboardClient` and its PersonalFinance section | Existing authenticated, owner-filtered reads; version/count/date/error summaries, not a complete wealth-value assertion |
| Financial file | `/dashboard/holdings`, cashflow, goals and existing editors | Canonical versioned financial APIs; unknown writes retain exact intent/readback boundaries, missing data is not zero |
| Rights and consent | `getAccess`/`AccessInfo`, `AccessStatusCard`, consultation relationship form | Broad access tier is not service-specific entitlement or file consent. Purchasing-to-service linkage remains NOT_CONNECTED. Unknown is not never/expired; no prices, duration or policy introduced |
| Consultation | `/dashboard/consultation`, `ConsultationWorkspace`, `ConsultationPanel`, `load_consultation`/`command_consultation` | Existing server-bound actor, relationship and explicit consent/revocation; member sees published/withdrawn history, not advisor drafts/private notes |
| Follow-up | Existing published session cards/questions/actions | Exact published session/version binding; a member report is not proof of a trade or an automatic holdings mutation |

Prior prototypes were read, not blindly ported. `arash-design-lab` already has a labeled account/portfolio visual sample; the older p03 `MemberHome` has cohort/module APIs and a separate preview switch that are not the current main contract. Its shell, APIs and fixture flag must not become a parallel product. The existing START-A Preview (PR335/`8af4776`) is another bounded synthetic reference, not current Auth/native acceptance.

## Smallest observed connection gap

The main protected layout and member home ignore `getUser().error`: null may redirect as if the user signed out, and a response with both user and error could be treated as authenticated. The consultation route already reuses `authSessionFailure` and a bounded read. The layout is upstream of dashboard, so a page-only correction cannot establish the full boundary. Middleware's existing unavailable marker and safe return path must be preserved, not replaced by another auth policy.

`AccessInfo` already distinguishes active, expired, revoked, scheduled, never and unknown standing, but the existing home access card renders every non-full state as the same registered/upgrade view. Any allocated correction must display the existing evidence and next step without claiming a purchased consultation right. Basic financial-file routes stay independent of advanced-service expiry.

## Tasks and completion criteria

1. Confirm shared-file allocation with the coordinator. Reuse the current auth/session/deadline/return-path contracts; distinguish rejected/expired session from unavailable/unknown verification. Unknown must not disclose protected children or be treated as a proven new/anonymous account. Preserve existing ACL and role checks.
2. Add behavioral tests against actual affected routes/components before implementation, including user+error, rejected session, network/timeout, unknown/expired/revoked access, safe next path and no protected read/disclosure on unverified identity. No new Auth/backend method or service-right inference.
3. Preserve the existing financial editors and consultation draft/error/version/readback behavior. Reuse their actual tests/contracts rather than adding another writer. A recommendation/private note must never be exposed in an ordinary-member walkthrough.
4. Deliver a versioned, openable walkthrough of the existing six-step journey. Reuse existing UI/prototypes where correct; if a labeled synthetic Preview is needed, keep it independent of the product branch/runtime, with no fake product API and no claim of real login or native acceptance. Show unknown/expired/error recovery, draft retention, meaningful next actions and the NOT_CONNECTED service-right boundary on mobile and desktop.
5. Run focused checks and the repository's required checks for the actual delta, then exact-head CI/Preview. Design/code/tests/merge/deployment/live destination/Arash acceptance remain distinct. No main publication, primary/env/credential/provider/model/paid-service change or installation gate bypass.

The deliverable is URL/SHA, actual route walkthrough, changed commitments and remaining blockers/owners. Shared project status stays in COMMAND-CENTER. Official [Supabase SSR guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs) and current changelog were consulted; existing verified-user/session-bound clients remain the implementation boundary, with no SDK/version or credential migration.
