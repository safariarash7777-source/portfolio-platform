# P11 pure projection entry

P00 scope ACK on 2026-10-02: lib/measurement/p11/**. index.mjs exports the committed canonical projection modules under docs/ops/product-plan-v0.1/p11/runtime without copying the contract, validator or handoff model. Node-only; no runtime route, shared instrumentation, collector, provider or storage is activated. P08's receipt adapter consumes this same projection via dependency injection; its archived exact modules are test fixtures only.

Run: node --test docs/ops/product-plan-v0.1/p11/runtime/runtime.test.mjs. Inspect runtime/README.md and receipt.schema.json for authority callback contracts. Current support receipt is explicitly synthetic-only. firstHumanResponseAt and SLA are null until human/server evidence exists.
