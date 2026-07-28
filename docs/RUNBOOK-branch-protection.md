# Runbook — اجباری‌کردنِ CI روی `main`

> **وضعیت: اجرا نشده.** این یک دستورالعملِ دستی است، نه گزارشِ اجرا.
>
> **چرا دستی:** سرورِ GitHub MCP در این سشن **هیچ ابزارِ branch protection ندارد**
> (نه `create_branch_protection`، نه `update_repository`، نه دسترسی به
> `/repos/{owner}/{repo}/branches/{branch}/protection`). ابزارهای موجود فقط
> `create_branch`، `fork_repository`، `list_repository_collaborators` و مانندِ آن‌اند.
> پس طبقِ قاعدهٔ «اگر ابزار نبود، اقدامِ دستیِ دقیق را گزارش کن — حدس نزن»، مراحل
> اینجا نوشته شده تا آرش یک‌بار اجرا کند.
>
> مرتبط: `B-015` در [`COMMAND-CENTER.md`](./COMMAND-CENTER.md) · `DD-015`
> (طراحیِ `CI Gate`) در [`DECISION-LOG.md`](./DECISION-LOG.md)

## چرا این مهم است

`.github/workflows/ci.yml` از ۲۰۲۶-۰۷-۲۶ روی هر PR اجرا می‌شود و سبز است — ولی
**اجباری نیست**. یعنی امروز یک PRِ قرمز هم می‌تواند merge شود. تا وقتی این runbook
اجرا نشده، CI یک **گزارش** است، نه یک **گیت**.

## پیش‌نیاز — نامِ چک باید دقیقاً درست باشد

GitHub چک را با **نامِ نمایشیِ job** می‌شناسد، نه با نامِ فایل یا کلیدِ job. نامِ درست:

```
CI Gate
```

(با فاصله، با همین حروفِ بزرگ. کلیدِ jobش در YAML `ci` است ولی `name: CI Gate` دارد.)

**شواهدِ اینکه این نام واقعاً با موفقیت تمام شده** — قاعدهٔ سخت: هرگز چکی را الزامی
نکن که هیچ‌وقت سبز نشده، وگرنه `main` برای همیشه قفل می‌شود:

| اجرا | commit | نتیجه |
|---|---|---|
| `30194847587` | `0023f6f` (merge شدنِ PR #80) | ✅ success |
| `30276709105` | `51ac8aa` (merge شدنِ PR #79) | ✅ success |

برای تأییدِ مجدد در لحظهٔ اجرا:

```bash
gh run list --repo safariarash7777-source/portfolio-platform \
  --workflow ci.yml --branch main --limit 5
```

## مراحل

1. **Settings → Branches → Add branch protection rule**
2. **Branch name pattern:** `main`
3. تیک بزن: **Require a pull request before merging**
   - «Require approvals» را می‌توانی روی **۰** بگذاری. آرش تنها توسعه‌دهنده است؛
     الزامِ approval یعنی نتواند PR خودش را merge کند.
4. تیک بزن: **Require status checks to pass before merging**
   - تیک بزن: **Require branches to be up to date before merging**
   - در جست‌وجوی چک‌ها، **`CI Gate`** را انتخاب کن — **و فقط همین یکی**.
     - ❌ `Vercel` را الزامی نکن — یک اینتگریشنِ بیرونی است و اگر حسابِ Vercel
       مشکلی پیدا کند `main` قفل می‌شود.
     - ❌ `Supabase Preview` را الزامی نکن — وضعیتش `skipped` است و GitHub
       `skipped` را success حساب نمی‌کند، پس **هیچ‌وقت پاس نمی‌شود**.
     - ❌ `Dependencies` / `Typecheck · Lint · Tests · Build` /
       `Secret scan · SQL validation` را جدا الزامی نکن — `CI Gate` خودش هر سه را
       جمع می‌کند (`DD-015`)، و الزامی‌کردنِ جداگانه یعنی هر بار jobی اضافه شد باید
       این تنظیمات را هم دست بزنی.
5. تیک بزن: **Do not allow bypassing the above settings**
   - ⚠️ **مهم:** این گزینه ادمین‌ها را هم شامل می‌شود. اگر آرش تنها نگهدارنده است و
     می‌خواهد در شرایطِ اضطراری بتواند مخزن را نجات دهد، این را **خاموش** بگذارد.
     خاموش‌بودنش گیت را برای کارِ عادی از بین نمی‌برد؛ فقط دریچهٔ فرار باز می‌ماند.
6. **Allow force pushes:** خاموش
7. **Allow deletions:** خاموش
8. **Create** / **Save changes**

## راستی‌آزمایی پس از اجرا

```bash
gh api repos/safariarash7777-source/portfolio-platform/branches/main/protection \
  --jq '{
    required_checks: .required_status_checks.contexts,
    strict_up_to_date: .required_status_checks.strict,
    pr_required: (.required_pull_request_reviews != null),
    force_push: .allow_force_pushes.enabled,
    deletions: .allow_deletions.enabled
  }'
```

انتظار:

```json
{
  "required_checks": ["CI Gate"],
  "strict_up_to_date": true,
  "pr_required": true,
  "force_push": false,
  "deletions": false
}
```

سپس یک تستِ رفتاری: روی یک برنچِ آزمایشی یک PR بساز که عمداً تست را بشکند و مطمئن شو
دکمهٔ merge قفل می‌شود.

## اگر چیزی خراب شد

از همان صفحهٔ Settings → Branches، قاعده را **Delete** کن. برگشت آنی است و هیچ
کامیتی را تغییر نمی‌دهد.

## پس از اجرا

ردیفِ `B-015` در `COMMAND-CENTER.md` را از «با یک اقدامِ دستیِ باقی‌مانده» به بسته
تغییر بده و خروجیِ دستورِ راستی‌آزمایی را به‌عنوانِ شواهد بچسبان.
