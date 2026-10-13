# Offline provenance validator: review fixes

This local revision fixes the two P2 findings against `a6d20ad57ca96692bb427d3b5ae8900f03b6939a`. The module remains unused by product routes and changes no persisted DTO, store, workflow, permission or migration.

Evidence date extraction now follows runtime timestamp validation. Missing, null and non-string observed timestamps, and missing or non-string published timestamps, produce issues rather than throwing. The existing nullable published timestamp remains representable but cannot match a workbook evidence item requiring a published day. Invalid evidence clears the reported review actor/time and never grants authority.

Call `inspectRehearsalReferences(rows, checkedAt, calendarZone)` with an explicit IANA calendar zone, for example `UTC` or `Asia/Tehran`. There is no default inferred from the machine, clock offset or existing DTO. Omitted, empty or unsupported zones produce `rehearsal_calendar_zone_unknown` and no readiness. This third argument is a caller declaration in the offline sidecar, not a new native calendar record or an attestation.

In that declared calendar, each rehearsal date must be a valid date, no later than the check day, and intersect the successful run's start-to-completion calendar-day interval. A run crossing midnight can intersect either day but its reused ID counts only once. Future labels produce `future_rehearsal_day`; unrelated labels produce `rehearsal_day_run_mismatch`. Any issue suppresses both `structuralTenDayCandidate` and `summary.readyForGateReview`, even if ten other rows passed. Existing `summarizeRehearsal` is unchanged.

The missing native calendar, day-to-run link, real-origin attestation, review evidence snapshot and workbook-to-claim binding remain reported gaps. A valid caller declaration does not close them. Source/quotation truth, authenticated human review, verified real days, publication authority and Gate3 acceptance remain literal `false`.

Validation: `npm run test:research-provenance` covers 60 cases (the previous 36 plus 24 regressions/boundary cases). The same cases are also run under the existing offline guard; these are 60 unique cases, not 120. This work performs no build, DB/API call, installation, push or deployment. New V2 artifacts preserve the original review package and its evidence unchanged. A fresh independent review remains required before recommending merge.
