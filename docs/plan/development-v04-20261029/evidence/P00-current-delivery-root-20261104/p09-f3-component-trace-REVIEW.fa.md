# بازبینی source-only مسیر P09

دامنه: trace خواندنی component journal؛ هیچ تست، browser/native/SQL/network یا تغییر کد انجام نشد. این گزارش فقط source parity است و پذیرش تازهٔ f3 را اثبات نمی‌کند.

## منابع دقیق

- checkout خوانده‌شده: `C:/Users/Asus/Documents/ChatGPT/توسعه سایت/company-tools-20261024`؛ خواندن با `git show` از objectهای زیر، مستقل از HEAD checkout.
- app جاری: `f3aa9bd51d06e308b08b56651cac4733ea49af8e`.
- app پذیرفته‌شدهٔ تاریخی: `a2d710858fa3acb8b6ba8300eacf24e6ecfa5a6c`؛ پذیرش تاریخی به f3 منتقل نمی‌شود.
- validator تاریخی: `67aeda9ff84fb1d3e936fc39564c0e551b3ff17e`.
- hashهای جدول، Git blob ID کامل و معرف bytes source هستند؛ SHA-256 فایل گزارش جدا تحویل می‌شود.

## parent واقعی، جدا از bootstrap testhost

در validator67، `scripts/isolated-e2e/workbook-browser.mjs:174–175`، Chrome context واقعی با SDK cookies به `http://localhost:32189/admin/research` می‌رود. در `:188–191` password session تازه و context دوم ساخته و همان URL باز می‌شود. `scripts/isolated-e2e/native-auth-gateway.mjs:30–32` از Next واقعی و `getRequestHandler` استفاده می‌کند؛ `:20` همین page بدون query را مجاز می‌داند.

در هر دو67 وf3، `app/(protected)/admin/research/page.tsx:12–13` مستقیماً `<ResearchWorkbook />` بدون prop می‌سازد؛ `initialWorkbook` و `initialWorkbookId` خالی می‌مانند. در f3، `components/admin/ResearchWorkbook.tsx:98–100` با revision صفر و pending خالی، intent نخست را auto-restore می‌کند. gate واقعی `app/(protected)/admin/layout.tsx:15–28` شامل `auth.getUser` و نقش admin است.

`workbookNativeScenarios` در validator67، `scripts/isolated-e2e/workbook-native-auth.mjs:60–77` از hook testhost برای bootstrap/remount استفاده می‌کند. این شاهد جدا از journey صفحهٔ واقعی Chrome است؛ پذیرش testhost نباید پذیرش browser نامیده شود.

## قرارداد بازیابی و حد no-second-POST

در f3، `ResearchWorkbook.tsx:131–150`، GET همان intent با تطبیق شناسه، نسخهٔ هدف، نویسنده، متن دقیق، hash و زمان به `recoverSave` می‌رسد. در `:223–258` فقط GET intent و GET نسخهٔ مشخص انجام می‌شود؛ تطبیق canonical متن و نسخه/نویسنده اجباری است. هیچ POST خودکار بعد از reopen وجود ندارد؛ نبود نسخه فقط retry صریح را فعال می‌کند (`:231–237`).

validator67 در `workbook-browser.mjs:167–169` پس از save201، context را پیش از تحویل پاسخ می‌بندد؛ `:185` commit را جدا می‌خواند. `:190–203` window بازگشایی/بازیابی/reload را با ثابت‌ماندن شمار POST بررسی می‌کند. intent محفوظ `:193` از GET همان intent خوانده می‌شود؛ قبل از readback نسخه، metadata در `:197–198` همچنان writeOutcome=unknown و versionId=null است. این no-second-POST به window پس از reopen مربوط است؛ کل bootstrap قدیمی GET-only نیست: `workbook-native-auth.mjs:79` replay صریح و `:99` retry صریح دارد.

## پین‌ها و delta

| منبع | Git blob ID در f3 |
| --- | --- |
| `app/(protected)/admin/research/page.tsx` | `1e097b2d76d3190eae0bcd426b8ef599e94db951` |
| `app/(protected)/admin/layout.tsx` | `2652b834ad2ba9c901eca1e125e8bd43399abbd0` |
| `components/admin/ResearchWorkbook.tsx`؛ 46684 bytes | `5e21eef71e3004ded0cecf8c4253683c996f95ea` |
| `app/api/admin/intelligence/workbooks/route.ts`؛ 10308 bytes | `149b3ef79e11f5bff9934bdd80e33d1932cac4ba` |
| `lib/intelligence/workbook-intent-store.ts`؛ 7451 bytes | `d837836c9f8f230c68439d56932fdf959eb39f83` |
| `lib/intelligence/workbook-save-intent.ts` | `a5e2ee1b490a2faac2d53f7f801ccd9deb859b75` |
| `components/admin/ResearchHistoryPanel.tsx` | `93cfb1fcc060286d10ddd4192a3535e7c4cfe1c0` |
| `lib/intelligence/research-history-metadata.ts` | `caed02b69ce74570cfdf55542b87bb2767e4091d` |
| `sql/phase34_research_workbook_versions.sql` | `4ec039c252fc8cd1fca9c24db7c9a3c43770bfba` |
| `docs/ops/research-workbook-recovery-20261029/intent-store.candidate.sql` | `7e3f7c7f85cb26281851e844c31f3c1ad0e5d9b1` |
| `sql/test/supabase_bootstrap.sql` | `2d33ea0ab8c20ca942999ce7c11dc99e8555a31e` |
| `sql/test/profile_explicit_grants.sql` | `94639f289300a48d388b47ab2cc5da6868f8894c` |
| `package-lock.json` | `dddfa8d6a4f705383ccbdc3e9a1afd03ff24e305` |

Component، route، intent modules، history modules و parent page نسبت به a2d بدون delta هستند. چهار SQL بالا نیز نسبت به a2d و67 بدون delta هستند. lock جاری نسبت به67 دقیقاً بدون delta است؛ نسبت به a2d فقط ثبت `playwright-core@1.64.1` افزوده شده است. SQL journal موجود actor-owned admin SELECT/INSERT دارد (`intent-store.candidate.sql:56–63`) و trigger تغییر/حذف را می‌بندد (`:49`)؛ replacement store لازم نیست.

| منبع validator67 | Git blob ID |
| --- | --- |
| `scripts/isolated-e2e/workbook-browser.mjs` | `b81070e058171a32ff5ddf100011baf0ca96bcaf` |
| `scripts/isolated-e2e/workbook-native-auth.mjs` | `e606d97bd0028c1eaf353bb04cf021ae18a6a06d` |
| `scripts/isolated-e2e/native-auth-runtime.mjs` | `cee0370fe8be0d21c263de5ddfd40aecb5d19ab0` |
| `scripts/isolated-e2e/native-auth-gateway.mjs` | `63382febd6915d93a27d9b1434f07aed63a2976a` |

## پیشنهاد coupling حداقلی

همان journey واقعی67 و journal موجود بازاستفاده شود؛ caller باید dependency closure و export واقعی `workbookNativeScenarios` را صریح پین کند، زیرا `workbook-native-auth.mjs` و native runtime/gateway قدیمی از f3 حذف شده‌اند. parent و شرط auto-restore در source محصول موجود است؛ بازسازی UI/store لازم نیست. شمارش GET-only فقط window تازهٔ پس از context/session را پوشش دهد و bootstrap/testhost و replayهای صریح تاریخی جدا بمانند. این پیشنهاد، مجوز اجرای native یا ادعای fresh acceptance نیست.