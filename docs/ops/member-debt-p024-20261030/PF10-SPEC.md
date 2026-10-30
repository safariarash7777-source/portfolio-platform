# PF-10 — one money source, versioned installment declaration

This is the short contract for the root-reserved PF-10 implementation, continuing PR344/fa7303f. Shared planning/status remains with root. No new questionnaire or program is introduced. The existing cash-flow audit is preserved outside source at outputs/pf10-20261030/existing-contract-audit.json: planned 10000, two actual expenses 3000+2000, internal transfer excluded, income unknown, correction selects 6000 in the new snapshot without summing old/new versions. Cash-flow v1 rejects extra debt metadata.

## Contract and ownership

An installment declaration **links an existing immutable actual expense** to an owned debt and a known next due date in a financial basis. The member records any new expense in the existing cash-flow editor first. Amount, canonical unit (IRT) and occurrence date are read from that cash-flow entry; the link never creates another expense/income or mutates cash-flow/holdings/debt snapshots. A nullable member reference is unverified. Principal/interest/fee allocation remains null; neither settlement nor remaining loan balance is inferred. Multiple distinct expenses can represent partial declarations; amounts greater than a recorded installment remain visible with provenance, not an automatic paid status.

New metadata table: member_debt_payment_links, append-only, owner-bound, with immutable row UUID, paymentKey, per-payment version, sequence/cursor, client token/hash, financial basis/debt key/due date, immutable cash-flow version/entry key, nullable reference and timestamp. No duplicate money/date copy. Only the actor's latest financial basis and latest selected cash-flow period version may receive a new/corrected link. Historical financial pages and old link versions remain read-only. A correction creates a new link version with CAS; it cannot edit history. One stable cash-flow series (period bounds + entryKey) cannot be the active source of two payment keys. A later cash-flow revision makes the old source stale or removed and requires explicit review; no silent rebasing.

Root reserved lib/portfolio/debtPayments*, components/portfolio/debt-payments/*, the debt-payments route, limited DebtSchedule/holdings-page integration, candidate SQL/RLS/RPC, corresponding tests and exactly two test-path registrations in existing core/native scripts. CF v1 DTO/server/calculator and installed SQL remain read-only. Auth/CSS/Nav and root's shared status are outside scope.

## Reader/DDL gate

Deployable reader first: absent candidate RPC/schema => canonical UNAVAILABLE with writer closed, never empty payments. Other read/identity failures also close writes and preserve honest unknown state. The existing financial page and cash-flow reader remain usable. Candidate SQL is NOT_APPLIED: install only after root separately proves deployed compatible reader, reviewed hashes, identity/capacity, fresh backup/restore and authorization. No target DDL/write, grant/flag installation, bank connection, upload, channel/send, purchase, Hermes or model run belongs to this slice.

The new API uses the existing native session, explicit expected actor, bounded reads, same-origin write guard, strict shapes and private/no-store responses. SQL independently checks owner/basis/debt/due/source, serializes link writes and coordinates with existing financial/cash-flow locks. Exact tokens return the original receipt; changed content/base conflicts. Unknown write retains exact intent; receipt GET is checked independently before any explicit exact retry. Missing receipt is not proof that an in-flight write cannot commit.

## Observable completion

- Existing cash-flow expense remains the only money source; old/new readers and absent schema are tested separately. Reminder stays in DebtSchedule from a known due date, independent of declaration/paid status, without a new channel or scheduler.
- Core and isolated native tests cover two partial expense links, duplicate active source prevention, over-amount provenance without settlement, null split/reference, exact retry/response loss/readback, correction history, historical basis lock, foreign/admin denial, stale/removed CF source, and unchanged financial/CF fingerprints.
- The existing holdings page provides a labeled declaration/history section and a link to the existing cash-flow editor. Preview/source/CI, isolated SQL actor seams, real Auth/destination behavior and Arash acceptance are separate evidence. No main merge or target installation is implied by passing tests.
