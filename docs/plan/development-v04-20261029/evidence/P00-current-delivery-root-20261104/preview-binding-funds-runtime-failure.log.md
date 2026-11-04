## Runtime Logs

**Project:** prj_2tl6cSJNPWdDUvKdkogPzl1RuWVp
**Deployment:** dpl_9D3b5WKUWtvyjBFjKUoncHsNfLtR
**Time range:** 2026-11-04T07:22:45.000Z → 2026-11-04T07:23:30.000Z

### 2026-11-04T07:22:59.331Z GET /market/funds [warn/function]
dep=dpl_9D3b5WKUWtvyjBFjKUoncHsNfLtR branch=codex/p08-funds-url-20261104 request=5ws97-1793776977482-64ccb41e4446 domain=portfolio-platform-flw0rb2bo-safariarash7777-4463s-projects.vercel.app environment=preview region=fra1 runtime=nodejs26.x stream=stderr
    {
      event: 'funds_read_failure',
      selector: 'legacy',
      scope: 'shared-last-observation',
      state: 'error',
      reason: 'read-error',
      status: 401,
      readAt: 1793776979329,
      urlPresent: false,
      keyPresent: false,
      selectedPair: false,
      fundCount: null
    }

