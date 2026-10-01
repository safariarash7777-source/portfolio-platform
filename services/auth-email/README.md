# Auth email — auth.email.v1, DD-033

Keep canonical GoTrue v2.197.0, existing UUID, email/password login and `/auth/callback` PKCE handler. SMTP is configured **on GoTrue**, never in a browser bundle. No new provider or SDK is installed. Real sender/domain/provider is not selected or activated by this package. Local SMTP receipt is not real external delivery.

Serve the two static Go templates over an operator-controlled HTTPS URL or mount them with the Auth service. Never add tracking pixels, analytics or link rewriting. `TokenHash` is a one-time credential: new links place it in a fragment on `/auth/email-link`, so it is not part of an HTTP path, query or Referer. The page immediately removes it, sends it in a same-origin POST and receives only a destination; GoTrue verifies it and the canonical SSR client writes session cookies. Both ordinary and `pkce_` token-hash formats were exercised on the pinned installed version. Do not log POST bodies. Existing PKCE links with an exchange code remain supported; redact `/auth/callback` query strings at ingress/APM.

Required Auth configuration **names**:

```
GOTRUE_SMTP_HOST
GOTRUE_SMTP_PORT
GOTRUE_SMTP_USER
GOTRUE_SMTP_PASS
GOTRUE_SMTP_ADMIN_EMAIL
GOTRUE_SMTP_SENDER_NAME
GOTRUE_SMTP_MAX_FREQUENCY
GOTRUE_SMTP_LOGGING_ENABLED
GOTRUE_MAILER_AUTOCONFIRM
GOTRUE_MAILER_OTP_EXP
GOTRUE_MAILER_TEMPLATES_CONFIRMATION
GOTRUE_MAILER_TEMPLATES_RECOVERY
GOTRUE_MAILER_SUBJECTS_CONFIRMATION
GOTRUE_MAILER_SUBJECTS_RECOVERY
GOTRUE_SITE_URL
GOTRUE_URI_ALLOW_LIST
GOTRUE_RATE_LIMIT_EMAIL_SENT
GOTRUE_RATE_LIMIT_HEADER
GOTRUE_RATE_LIMIT_VERIFY
```

Set mailer auto-confirm and SMTP payload logging false. Choose a production expiration/frequency explicitly; synthetic settings are 120 seconds/60 seconds. In v2.197.0 the verification limiter skips a missing/empty configured rate-limit header. Trusted ingress must **overwrite** that header, prevent direct public access to the raw Auth port, and be tested against forged client headers; setting only a numeric limit is insufficient. Email send quota and attempt limits are separate. Secrets pass through deployment configuration securely, not through this document or an environment file committed to Git. SMTP TLS mode/ports are provider-specific; use the selected provider's official configuration and valid certificates. Plaintext SMTP exists only in the explicit loopback synthetic sink, which rejects Production.

Next server names: `AUTH_EMAIL_ENABLED` controls the new fragment consumer, `AUTH_EMAIL_DELIVERY_READY` is an operator declaration only; `NEXT_PUBLIC_APP_URL` is the reviewed current site origin; `AUTH_ALLOWED_ORIGINS` contains exact application origins. Recovery request and fresh-session password replacement remain bridges for legacy email regardless of SMS activation. Existing password login does not depend on either readiness declaration. New password replacement requires confirmed email and a canonical OTP/recovery AMR timestamp within five minutes; it never accepts password-only authentication as recovery proof. New passwords are 12–128 characters; existing passwords are not rewritten. Signup remains disabled in Production unless separately authorized.

Final routes:

| Flow | Destination |
|---|---|
| New confirmation template | `/auth/email-link` fragment → `/api/auth/email` verification → existing allowed local `next` or `/dashboard` |
| New recovery template | `/auth/email-link` fragment → same verification → `/reset-password` |
| Existing PKCE callback | `/auth/callback?code=…&next=…`, existing normalized local return path |
| Password saved | `/dashboard`; server still enforces role and entitlement |

Confirmation return paths allow existing dashboard, market, funds, stocks, courses, consulting and admin roots only; role checks remain server-side. Recovery always goes to `/reset-password`, ignoring a supplied external `next`. Configure both canonical Production and **exact reviewed Preview** callback hosts in GoTrue; do not allow arbitrary wildcard Vercel hosts. SiteURL in a template decides which environment receives the session: do not send a Production account link to the synthetic review site.

`POST /api/auth/email` recovery returns the same neutral request response for known/missing accounts and SMTP refusal; it claims a request, not delivery. Timestamp-only error state is visible through `/api/admin/auth-health` to a DB-verified administrator. This indicator is per server instance, not a durable monitoring system. The endpoint reports readiness declarations and presence booleans, never secrets; it cannot prove that a GoTrue container has valid SMTP settings. Separate verified operator inspection and delivery acceptance remain required.

Before real activation: sender/domain ownership, verified SPF and DKIM, a documented DMARC policy and alignment, provider-approved SMTP credentials, TLS, exact callback origins, external delivery + consumed link + SSR `getUser` + role + refresh + logout/login, expiration/replay/tampering/rate-limit and provider outage. No DNS record or service purchase has been made. [GoTrue pinned SMTP configuration](https://github.com/supabase/auth/blob/v2.197.0/internal/conf/configuration.go) · [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) · [confirmation server flow](https://supabase.com/docs/guides/auth/server-side/nextjs).

Rollback: disable the new fragment feature, restore reviewed prior templates/SMTP settings and preserve PKCE callback and email/password entry. Keep accounts, profiles, personal histories, encrypted identity versions and retained keys. Never restore an old DB over new writes or delete email as a rollback step.

Reproduce only in an isolated synthetic workspace: `node scripts/testing/auth-sandbox.mjs`, then `node scripts/testing/auth-email-check.mjs`; the actual browser check needs the installed `AGENT_BROWSER_BIN`. The harness uses real GoTrue/Postgres and a local SMTP receiver; it neither auto-confirms nor manufactures a user JWT. Fixture outages and timestamp backdating are local only. Raw MIME/link material remains in ignored `.task/auth-sandbox`, restricted to the current Windows user. Committed evidence contains booleans/statuses and images after credential fields are cleared.
