# Auth SMS service — auth.mobile.v1, disabled until rollout

Dedicated server-only Node 24 service, independent of Next09 outbox. No SMS SDK or key enters a browser bundle. GoTrue v2.197.0 (observed on Liara 2026-10-01) owns random OTP generation, expiration, single use and sessions. `sms.phone` is the signed delivery target in this version; during linking `user.phone` can be empty/old. [Pinned source](https://github.com/supabase/auth/blob/v2.197.0/internal/api/phone.go) · [hook schema](https://github.com/supabase/auth/blob/v2.197.0/internal/hooks/v0hooks/v0hooks.go).

Run `node services/auth-sms/server.mjs`. Mount a persistent local volume for SQLite; run one replica, restrict the volume to the service account, terminate TLS at the existing ingress, and make `/v1/admit` available only to the application server. Hook raw bodies and provider URL/body/error must be excluded from proxy access logs, tracing, APM and crash capture. No automatic send retry: ambiguous attempts retain a full budget reservation. Signed retries with an already accepted webhook ID return `{}` without another send; failed/pending replay is rejected. Signature age ±300s, raw UTF-8 body HMAC, secret rotation via `|`. SQLite `BEGIN IMMEDIATE` atomically reserves cost/count before provider calls. Ledger stores HMACs of webhook IDs, phones and abuse scopes, not OTP, phone, national ID or raw request. Retain the fingerprint secret across restarts.

Required environment names (no values in PR):

| Service | Names |
|---|---|
| SMS | `SMS_PROVIDER=kavenegar`, `SEND_SMS_HOOK_SECRET`, `AUTH_SMS_CONTROL_SECRET`, `AUTH_SMS_FINGERPRINT_SECRET`, `AUTH_SMS_DB_PATH`, `SMS_BIND`, `PORT`, `KAVENEGAR_API_KEY`, `KAVENEGAR_TEMPLATE`, `KAVENEGAR_TEMPLATE_APPROVED`, `AUTH_SMS_PHONE_ALLOWLIST` |
| Budget, explicitly chosen by owner/operator | `SMS_DAILY_SEND_LIMIT`, `SMS_DAILY_BUDGET_RIAL`, `SMS_MAX_MESSAGE_COST_RIAL` — strictly positive integers, no inferred commercial defaults |
| Next server | `AUTH_MOBILE_ENABLED`, `AUTH_MOBILE_ALLOW_SIGNUP`, `AUTH_ALLOWED_ORIGINS` (comma-separated exact origins), `AUTH_SMS_CONTROL_URL`, `AUTH_SMS_CONTROL_SECRET`, optionally `AUTH_TRUSTED_IP_HEADER=x-vercel-forwarded-for` only when ingress strips spoofed values |
| Private identity writer | canonical `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_IDENTITY_KEY_VERSION`, `AUTH_IDENTITY_ENCRYPTION_KEY`, `AUTH_IDENTITY_HMAC_KEY`, optionally `AUTH_IDENTITY_OLD_ENCRYPTION_KEYS` |
| Local test only | `AUTH_MOBILE_LOCAL_SANDBOX`, `AUTH_SMS_LOCAL_SANDBOX`, `SMS_PROVIDER=local-mock` |

Budgets roll over at UTC midnight, not the course's Tehran timezone. Hook limit: 1 send/phone/60s, 5/hour; failed/ambiguous attempts count. BFF admission: 5 send/link/password attempts per phone/device per 10 minutes; verify 10; IP caps 20/40. Three provider failures or a provider cost above the configured maximum close the circuit for 24 hours. Counters survive process restart, timestamps are service clock. Actual accepted provider cost is stored in rial; acceptance is neither delivered SMS nor a successful login. `GET /health` exposes only service name and mock status. Persistent volume loss or fingerprint-key replacement invalidates counters: these are rollout blockers, not a supported reset mechanism.

GoTrue settings to stage, not instructions to enable Production now:

```
GOTRUE_EXTERNAL_PHONE_ENABLED=true
GOTRUE_SMS_AUTOCONFIRM=false
GOTRUE_SMS_OTP_EXP=120
GOTRUE_SMS_OTP_LENGTH=6
GOTRUE_SMS_MAX_FREQUENCY=60s
GOTRUE_RATE_LIMIT_HEADER=<header overwritten by trusted ingress>
GOTRUE_RATE_LIMIT_VERIFY=<operator-selected attempt cap>
GOTRUE_HOOK_SEND_SMS_ENABLED=true
GOTRUE_HOOK_SEND_SMS_URI=<reachable HTTPS hook>
GOTRUE_HOOK_SEND_SMS_SECRETS=<matching signed-hook secret>
```

Pass variables through Compose explicitly. Keep `GOTRUE_SMS_TEST_OTP` unset, and do not auto-confirm real users. Native Auth `/verify` remains public for compatibility: BFF limits do **not** apply to a direct GoTrue request. The installed configuration name is **`GOTRUE_RATE_LIMIT_VERIFY`**, not an invented `GOTRUE_RATE_LIMIT_TOKEN_VERIFICATIONS`. v2.197.0 skips this limiter if its configured header is missing or empty. Synthetic baseline: 40 direct wrong verifications without 429. Corrected trusted ingress: overwrites client-supplied identity, configured cap30, request31 receives429 even when client changes its spoofed header. Raw Auth ports must be private; merely adding the header variable is not sufficient. Production inspection found the header unset; no live brute-force probe or config change was performed. Native `/otp`, password and refresh limits also remain required. No claim is made that the BFF alone prevents all distributed abuse. [Pinned middleware](https://github.com/supabase/auth/blob/v2.197.0/internal/api/middleware.go) · [pinned config](https://github.com/supabase/auth/blob/v2.197.0/internal/conf/configuration.go) · [self-hosted hooks](https://supabase.com/docs/guides/self-hosting/self-hosted-auth-hooks).

Local mock is rejected when `NODE_ENV=production` or without an explicit sandbox flag. CLI refuses to run mock without an in-process sink. The test harness receives the randomly generated GoTrue code into an ignored local file; it does not use `SMS_TEST_OTP`, a fixed code, a fabricated user JWT, or phone auto-confirmation. Application sandbox flag only changes the local review banner/loopback transport; it cannot activate a production mock service.

Kavenegar preparation (owner action, no purchase/send performed): create/use the correct owner/company account at [console](https://console.kavenegar.com), complete its required phone/documents/terms/password personally. Proposed name `arashlogin`; proposed SMS:

```
آرش صفری
کد ورود شما: %token
این کد را در اختیار دیگران قرار ندهید.
```

[Official REST docs](https://kavenegar.com/rest.html) confirm `%token`, an English name without spaces/underscore, `verify/lookup.json`, and template states `PendingReview`/`Approved`/`Rejected`. They do **not** prove this account/template is approved. Record approval in the console before setting the approval flag. API key belongs only to this service; provider requires it in the HTTPS path, so redact path tracing at the provider egress. Adapter uses POST form data, no OTP in query string, 5s timeout, checks HTTP and provider return status, entry acceptance and cost. Error 418/424 etc. cannot become success. Owner must approve an exact charge amount after the panel's quote; no assumed budget or purchase is part of this delivery.

Rollout gates: AUTH00 owner acceptance on original URL; existing DB backup/recovery verified by its owner; reviewed additive migration; private writer secret delivered securely; live template approval; agreed owner phone; sandbox real GoTrue→signed hook→provider→OTP→SSR/getUser→role→refresh→logout/login; direct-endpoint brute force controls; persistent-volume restart and fault tests; admin strong MFA/recovery and SIM-recycling policy. Then limited phone allowlist with signup off, monitored budget, separate operator decision to expand. Rollback: set `AUTH_MOBILE_ENABLED=false`, disable SMS hook, restore prior reviewed Auth settings; retain legacy email login, Auth users/UUIDs, profiles, personal assets, identity versions and encrypted key material. Never drop identity tables or restore over newly written data as an automatic rollback.

Private identity AES-256-GCM is bound to UUID/key version as AAD. HMAC registry is server-written only. Encryption rotation can read retained old keys; **HMAC rotation/reindex is not implemented** and requires a separate migration to avoid duplicate identity registry entries. No raw legacy identity rewrite or deletion is performed. SIM recycling, unowned/shared phone, foreign national ID and conflicting existing accounts require owner-assisted recovery with existing-account proof; SMS possession alone cannot establish official identity. These paths and admin MFA are rollout gates, not claims of completed real-user verification.
