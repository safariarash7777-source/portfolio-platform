# Draft candidate — فقط خواندن codal_feed

مرجع رفتار base: f12ba71c353e135f83d136105380f20dd59a95e0. branch محلی مستقل: codex/codal-stored-reader-v04-20261031. این برش runtime را به جفت server-only فقط در GET موجود codal-list محدود می‌کند؛ constructor عمومی، Auth/write SDK، RLS/grant، دادهٔ اصلی و دریافت‌کننده تغییر نمی‌کنند. هنوز مقصد زنده/candidate Preview آزموده نشده و این تحویل رفع علت تجاری402 یا last-ingest-success نیست.

## مسیر و reuse

`GET /api/codal-list?symbol=...` → `lib/codal-feed-reader.ts/readStoredCodalFeed` → همان `codalFeedQuery` → `GET {base}/rest/v1/codal_feed` → همان `codalFeedWindow` → payload موجود source/coverage/window. اعتبارسنج موجود `liaraPublicEnv` با object ایزوله reuse می‌شود؛ نتیجهٔ آن وارد process.env یا next.config.js نمی‌شود. helper با `server-only` از واردشدن مستقیم به client جلوگیری می‌کند.

جفت جدید دقیق: `CODAL_FEED_READ_URL` و `CODAL_FEED_READ_ANON_KEY`. هر دو server-only و runtime، نه NEXT_PUBLIC. فقط وقتی هیچ‌یک اصلاً تعریف نشده باشند، تنظیم قبلی همین GET حفظ می‌شود. وجود partial/blank/invalid pair=503/zero-fetch؛ شکست مقصد انتخاب‌شده هرگز باعث درخواست به مقصد دیگر نمی‌شود. override فقط `https://62.60.191.24/liara-preview`؛ key فقط JWT عمومی anon با iss/expiry معتبر. این validation محلی امضای JWT/pair را تأیید نمی‌کند؛ PostgREST مقصد این کار را می‌کند. هیچ key واقعی در source/آزمون/رسید نیست.

حدود درخواست: method GET، تنها جدول codal_feed، query از builder موجود و limit60، headers فقط apikey/Authorization همان anon و Accept، بدون forward کردن Cookie/Auth/headers درخواست؛ credentials=omit، redirect=error، timeout15s شامل body، cap512KiB، بدون retry/provider/relay/fallback. خطاهای config503 و read502، upstreamstatus و phase telemetry حفظ می‌شوند. body/URL/token از Error خام به پاسخ/log کپی نمی‌شود. آرایه واقعاًخالی=empty؛ JSON/schema/ردیف بدون عنوان/بیش از۶۰ردیف=error. source clock/sent/publication/null و نمایش۳۰از۶۰ و unknown total/lastsuccess از قرارداد موجود می‌آیند.

## تنظیم و rollback پیشنهادی؛ هیچ‌کدام اجرا نشده

فقط دو entry تازه target=preview و gitBranch=`codex/codal-stored-reader-v04-20261031` با نام‌های server-only بالا؛ upsert=false. هر دو مقدار قبل استقرار با هم و scope/expiry/role بررسی شوند؛ مقدار anon فقط از public config مسیر مصوب به ابزار تنظیم و هرگز argv/log/source منتقل نشود. shared NEXT_PUBLIC/Production و دیگر branchها تغییری ندارند. این بار Auth/write آن branch هم مقصد قبلی خود را حفظ می‌کنند.

rollback تنظیم فقط حذف دو ID تازهٔ متعلق به همین branch و نسخهٔ کد همین برش؛ حذف یک عضو pair به‌تنهایی runtime503 می‌دهد. برای کد، یک revert همین diff helper/route کافی است. rollback داده/DDL/عضویت موضوعیت ندارد چون تغییری ندارند.

## گیت Draft آنلاین بدون استقرار

Git push معمولی می‌تواند Vercel Preview بسازد؛ Draft بودن PR به‌تنهایی تضمین عدم build نیست. برای عدم نقض ممنوعیت deployment، ابتدا commit/tree قابل review در GitHub بدون ایجاد/به‌روزرسانی remote head آماده می‌شود؛ این **PR یا CI/Preview نیست**. هیچ git push، dispatch یا env mutation انجام نمی‌شود.

پیشنهاد فنی محدود برای root قبل انتشار رسمی Draft: صرفاً entry زیر در vercel.json همان candidate (نه تنظیم پروژه/Production) اجازهٔ auto-deploy همان branch را ببندد؛ دیگر branchها default خود را حفظ کنند. این فایل خارج رزرو فعلی C است و اکنون اعمال نشده است:

```json
{"git":{"deploymentEnabled":{"codex/codal-stored-reader-v04-20261031":false}}}
```

مرجع رسمی: https://vercel.com/docs/project-configuration/git-configuration . بعد از تطبیق root می‌توان همان candidate را با guard branch منتشر و Draft PR باز کرد؛ پذیرش زنده و env/deploy همچنان گیت جدا دارند. هیچ سؤال/کلید یا دخالت مرورگر از آرش لازم نیست.

## بازتولید بررسی بدون مقصد زنده

```sh
node_modules/.bin/tsx --test app/api/codal-list/route.test.ts lib/codal-feed.test.ts components/symbol/CodalReportsTab.test.ts lib/liara-public-env.test.js
npm run typecheck
npm run lint:ci
npm run test:core
npm run scan:secrets
```

آزمون‌های جدید در route.test.ts ازقبل ثبت‌شده‌اند؛ package/registry/CI تغییر نکرده. transportهای آزمون مصنوعی و برچسب‌دارند و دادهٔ واقعی/چرخه ingestion تلقی نمی‌شوند. actual constructors موجود با استاب SDK اجرا می‌شوند؛ این اثبات wiring است، نه login/auth/نوشتن واقعی. negative-control با جایگزینی مقصد reader با shared destination باید همان تست جداسازی را شکست دهد و سپس source برگردانده شود.
