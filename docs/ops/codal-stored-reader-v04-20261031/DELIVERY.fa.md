# تحویل اجرای محدود Preview — فقط خواندن اطلاعیهٔ ذخیره‌شده

این برگ، برنامهٔ اجرای آینده برای root است؛ اکنون هیچ env، deployment، guard removal، SQL/دادهٔ زنده، provider/model/ingest اجرا نشده است. پذیرش root فقط کد/CI است. مالک اجرای مقصد پس از بازخوانی این بسته root؛ مالک reader و این برگ C. نمودار/Workspace/monthlyReport و مرجع مشترک خارج این برش‌اند.

## ۱. منبع دقیق و نتیجهٔ موجود

source اجرایی ثابت PR364: `e48eafa361198a2db24ea374232136bfce918f7e`، tree=`e9fa0fc641d0ed7dbf26139033e565d5b429e6d0`؛ branch=`codex/codal-stored-reader-v04-20261031`، stacked base331=`f12ba71c353e135f83d136105380f20dd59a95e0`. کد بازبینی‌شدهٔ a13 و تمام هشت blob آن محفوظ‌اند؛ e48 فقط guard همان branch را افزوده است. CI41145696401 هر پنج job موفق، quality job124370157775: Core2079+17+6+5، صفرfail/skip؛ ۳۷ تست هدفمند محلی و typecheck/lint/secrets موفق. این‌ها اتصال زنده یا آخرین ingestion موفق نیستند.

این بازنگری فقط مستند است؛ source عملیات باید همان e48 باقی بماند، نه SHA این برگ. پیش از هر عملیات آینده، remote head/base/tree و موفقیت CI همان source بازخوانی شوند. انحراف source/base، working tree کثیف یا deployment قبلیِ حل‌نشده=توقف و تطبیق با root؛ rebase/force-push/اجرای دوبارهٔ ناشناخته ممنوع.

project موجود=`prj_2tl6cSJNPWdDUvKdkogPzl1RuWVp`، team slug=`safariarash7777-4463s-projects`، repo=`safariarash7777-source/portfolio-platform`، GitHub repoId=`1210725423`. project تازه ساخته نشود. guard موجود `git.deploymentEnabled["codex/codal-stored-reader-v04-20261031"]=false` حفظ می‌شود؛ این guard فقط auto-deploy Git را می‌بندد، نه تضمین جلوگیری از manual deploy. آماده‌کردن این دستور مجوز manual deploy نیست.

## ۲. binding دقیق و مبدأ pair

| نام runtime | مقدار/مبدأ مجاز | دامنه و اثر |
|---|---|---|
| `CODAL_FEED_READ_URL` | `https://62.60.191.24/liara-preview` | server-only؛ تنها GET موجود codal-list؛ نوع API=`plain` |
| `CODAL_FEED_READ_ANON_KEY` | فقط anon عمومیِ همان مقصد که frontend عمومی Production قبلاً منتشر کرده؛ مقدار در این برگ نیست | server-only؛ نوع API=`encrypted`؛ نه service-role/secret/private credential |

برای هر دو فقط target=[preview] و gitBranch دقیق candidate؛ upsert=false؛ نه shared/team env، نه همهٔ Previewها، نه Production، نه نام‌های NEXT_PUBLIC. تنظیم‌ها هنگام ساخت deployment انتخاب و در runtime آن مصرف می‌شوند؛ تعریف branch env به‌تنهایی گواه اعمال در deployment نیست. هیچ env pull/decrypt، جست‌وجوی فایل خصوصی یا انتقال credential خصوصی لازم نیست.

مبدأ قبلاً تأییدشده: public frontend در `https://portfolio-platform-fawn.vercel.app`، Production مشاهده‌شدهٔ f93/dpl_6CWEMaNbPMD7i6r89GriNdhgNMWo. asset تاریخی `/_next/static/chunks/app/(auth)/login/page-9b9b26cf6af7280e.js` با SHA256=`1a961f585bad3842d17829fc3f0c53d2678b866ba7e733e2135372a6c96e3754` URL بالا و JWT role=anon را منتشر کرده بود. این هویت asset شاهد۳۰اکتبر است؛ نه تأیید config/تازگی امروز یا expiry فعلی. رسید root: PR332@4f3bce2، مسیر `docs/plan/development-v04-20261029/evidence/START-C-db-only-funds-root-20261030.json`.

در اجرای آینده، اگر همان pair معتبر در RAM مجری موجود است، expiry/role/issuer و URL آن را دوباره در RAM بررسی و reuse کند. اگر موجود نیست، فقط HTML عمومی /login و حداکثر۳asset واقعیِ هم‌دامنهٔ معرفی‌شده در HTML برای بازیابی public config؛ بدون login/cookie/private header، بدون اجرای JS و بدون جست‌وجوی key دیگر. URL باید دقیقاً مقصد مصوب و JWT باید role=anon،iss=supabase،exp آینده داشته باشد؛ سپس در RAM نگه داشته شود. mismatch یا نبود pair=STOP، نه حدس/کپی env تولید/درخواست کلید از آرش. payload JWT به‌تنهایی امضا یا سازگاری URL/key را اثبات نمی‌کند؛ مقصد آن را در SELECT احراز می‌کند. نقش anon به‌خودی‌خود «کلید سراسری فقط‌خواندنی» نیست؛ مرز این برش method/table/helper است و هیچ grant/RLS عوض نمی‌شود.

اسکریپت تاریخی public-config/funds را برای این کار یکجا اجرا نکنید: انتهای آن SELECT صندوق دارد. این مرحله فقط config عمومی را می‌خواهد؛ snapshot صندوق، NAV، dashboard یا SQL دوباره برای شاهد خوانده نشوند. کلید/JWT حتی داخل پاسخ خطا، ciphertext، argv، فایل موقت، trace، chat، receipt یا log چاپ/ذخیره نشود. فقط ID/key-name/type/target/gitBranch و hash/هویت assetهای عمومی ثبت شوند.

## ۳. پیش‌پرواز، ایجاد pair و بازخوانی — فقط پس از گیت اجرای root

۱) قابلیت rollback را پیشاپیش احراز کنید. connector فعلی C ابزار create/edit/get/filter env و cancel build دارد، اما ابزار حذف env و deployment ارائه نمی‌کند. root باید مسیر موجودِ احرازشدهٔ REST/CLI/native برای حذف همان IDها را داشته باشد؛ اگر ندارد، همین مرحله متوقف می‌ماند، بدون نصب/توکن یا سؤال از آرش. وضعیت پروژه/Production alias و deployment IDهای قبل از اجرا فقط از metadata موجود ثبت شوند؛ endpoint دادهٔ تولید خوانده نشود.

۲) metadata env candidate را با decrypt=false بخوانید و پیش از چاپ فقط ID/key/type/target/gitBranch را انتخاب کنید. نبود جفت جدید از رسید public-pair شاخهٔ دیگری استنباط نشود. وجود key هم‌نام/override/global با اثر روی candidate یا scope نامعلوم=STOP برای تطبیق؛ overwrite/ویرایش مقدار قبلی انجام نشود.

۳) قالب tool موجود برای ایجاد فقط دو entry، مقادیر صرفاً در RAM و فقط پس از مجوز آینده:

```javascript
// REVIEW TEMPLATE ONLY — NOT EXECUTED; verifiedPublicAnonInMemory is not a literal.
create_project_env({
  idOrName: "prj_2tl6cSJNPWdDUvKdkogPzl1RuWVp",
  slug: "safariarash7777-4463s-projects",
  upsert: "false",
  requestBody: [
    { key: "CODAL_FEED_READ_URL", value: "https://62.60.191.24/liara-preview",
      type: "plain", target: ["preview"], gitBranch: "codex/codal-stored-reader-v04-20261031" },
    { key: "CODAL_FEED_READ_ANON_KEY", value: verifiedPublicAnonInMemory,
      type: "encrypted", target: ["preview"], gitBranch: "codex/codal-stored-reader-v04-20261031" }
  ]
});
```

response کامل tool ممکن است value داشته باشد؛ آن را serialize/print نکنید. فقط metadata دو ID جدیدِ متعلق به همین intent ثبت شود. batch را atomic فرض نکنید. هر خطا/partial/timeout فقط با metadata readback تطبیق یابد؛ create کور یا upsert جدید نه. تا هر دو ID، scope و pair کامل تأیید نشده‌اند هیچ deployment ساخته نشود.

۴) بازخوانی metadata جفت جدید با decrypt=false: هر دو متعلق به project/branch/preview دقیق و نوع درست؛ هیچ public pair/Production entry تغییر نکرده باشد. helper فقط این دو مقدار را برای همین GET می‌گیرد؛ اگر pair ناقص/blank/نامعتبر باشد503/zero-fetch؛ اگر هر دو اصلاً غایب باشند تنظیم قبلی همین GET به‌کار می‌رود. این انتخاب پیش از درخواست است، نه fallback پس از شکست.

## ۴. دستور یک Preview با source ثابت، guard محفوظ

قالب canonical عملیات موجود `POST /v13/deployments?slug=safariarash7777-4463s-projects` / `create_deployment` با احراز فعلی root؛ هیچ credential/API token در payload/argv/chat نیاید. برای Preview، target عمداً **حذف** می‌شود؛ طبق API رسمی، نبود target=preview است. production/staging/custom target، customEnvironmentSlugOrId، alias، deploymentId، files، env/build.env و projectSettings اضافه نشوند. project موجود است و REST API برای آن projectSettings را الزامی نمی‌کند؛ default عمومی پروژه را تغییر ندهید. اگر wrapper مورد استفاده schema متفاوت/فیلد setting اجباری دارد، قبل mutation با root تطبیق شود؛ مقدار حدسی اضافه نشود.

```json
{
  "name": "portfolio-platform",
  "project": "prj_2tl6cSJNPWdDUvKdkogPzl1RuWVp",
  "gitSource": {
    "type": "github",
    "repoId": "1210725423",
    "ref": "codex/codal-stored-reader-v04-20261031",
    "sha": "e48eafa361198a2db24ea374232136bfce918f7e"
  },
  "meta": {
    "codalReadIntent": "ONE_RECORDED_INTENT_ID_CHOSEN_ONCE_BY_ROOT",
    "codalReadSourceSha": "e48eafa361198a2db24ea374232136bfce918f7e"
  }
}
```

فقط یک create؛ intent واقعی یک‌بار پیش از call در رسید موجود root ثبت، placeholder جایگزین و before-deployment IDs محفوظ شوند. در صورت وجود پارامتر forceNew مقدار0 و بدون force/withLatestCommit=true. مقدار meta ادعای خودمان است و جای gitSource واقعی را نمی‌گیرد. اگر guard مانع manual call شد، یا پاسخ/نتیجه unknown بود، guard حذف و درخواست replay نشود؛ فقط metadata همان project/SHA/branch/intent/time برای تعیین نتیجه خوانده شود. CLI/npx تازه یا سرویس/flag/API جدید نسازید.

readback قبل از هر GET: deployment ID و immutable URL متعلق به همین project/team، source واقعی gitSource.sha/meta Git واقعی دقیق e48، ref دقیق candidate، tree از Git همانe9، target preview یا target=null طبق نمایش API و بدون custom environment، سپس READY. source/target نامعلوم یا mismatch=STOP؛ هیچ promote، assign Production alias یا redeploy از latest انجام نشود. Production deployment/alias metadata با baseline بدون تغییر بماند. مقادیر env در metadata deployment نیز هرگز چاپ نشوند.

## ۵. Auth/write و cron دقیقاً چه می‌شوند؟

جست‌وجوی source تأیید کرد تنها مصرف‌کنندهٔ production-code نام‌های جدید `lib/codal-feed-reader.ts` است. `lib/supabase/client.ts` و server.ts همچنان NEXT_PUBLIC_SUPABASE_URL/ANON_KEY را می‌گیرند؛ admin/writers، next.config.js و lib/liara-public-env.js تغییر نکرده‌اند. تابع validator فقط object ایزوله می‌گیرد و چیزی در process.env/build config نصب نمی‌کند. تست actual دو constructor با SDK stub هم این wiring را ثابت کرد؛ realAuth/login/write آزموده نشده است.

Preview همچنان routeهای موجود Auth/write را دارد؛ این بسته آن‌ها را غیرفعال نمی‌کند و صرفاً مقصدشان را retarget نمی‌کند. برای این گام هیچ‌یک فراخوانی نمی‌شوند. روی Preview صفحهٔ /symbol، /dashboard، /market/funds، /login، APImarket/diag/alert/refresh و مسیرهای member/admin باز نشوند؛ استثنای public Production /login فقط برای config و با حدود بند۲ است، نه login واقعی.  بارگذاری صفحه ممکن است درخواست‌های دیگری داشته باشد. readback داده فقط GET زیر است.

`vercel.json` هر دو cron قبلی `/api/cron/alerts` و `/api/cron/telegram-sync` را عیناً دارد. طبق مستند رسمی Vercel، scheduler cron به production deployment URL GET می‌زند؛ Preview زمان‌بندی خودکار این cronها را فعال نمی‌کند. شرط این است که deployment واقعاً preview بماند و promote/Production alias نشود. global Disable Cron Jobs را لمس نکنید؛ این کار روی Production اثر دارد. handlerهای cron API هستند و اجرای دستی‌شان ممکن است مستقل از scheduler رخ دهد؛ پس نه endpoint آن‌ها، نه crons run/workflow و نه CRON_SECRET در این آزمون استفاده نمی‌شود. handlerها و شرط Auth موجودشان دست‌نخورده‌اند. metadata فهرست cronهای Production را به‌اشتباه «cron فعال Preview» یا «صفر cron همهٔ پروژه» گزارش نکنید.

## ۶. یک GET و قرارداد readback

پس از READY/هویت صحیح و مجوز اجرای root، فقط یک GET بدون Cookie/Authorization به immutable URL زیر؛ نه alias اصلی یا صفحهٔ کامل:

```text
https://<EXACT_IMMUTABLE_PREVIEW_HOST>/api/codal-list?symbol=%D9%81%D9%88%D9%84%D8%A7%D8%AF
```

تک‌تلاش، HTTPS معتبر، redirect/retry صفر، timeout client۲۰ثانیه و cap۵۱۲KiB؛ Accept=application/json و بدون header خصوصی، bypass credential، -k یا -L. اگر Deployment Protection=401/403، همان گیت دسترسی ثبت و توقف؛ protection/session/credentials تغییر نکند. helper درون route خودش GET ثابت به `/rest/v1/codal_feed` با select/order موجود، limit60، no-store،۱۵ثانیه شامل body و cap۵۱۲KiB دارد؛ incoming headers/session را forward نمی‌کند.

رسید فقط deployment ID/SHA/URL، UTC و تهران، status، request/cache headers عمومی مجاز، تعداد/پنجره، source/coverage و hash پاسخ را ثبت کند؛ نه credential یا کل بدنه. 200 باید source=codal_feed،coverage=stored-announcements،rowsRead≤60،itemsReturned≤30،totalHistory=null وcompleteHistory=false داشته باشد. تعداد۲۱ قدیم یا publishDate همهNULL ازقبل تحمیل نشود؛ sent/publication/null همان نتیجهٔ مشاهده‌شده بماند. [] معتبر=empty واقعی؛ 503=config error و502=read error، با phase/upstreamStatus پالایش‌شده در صورت وجود، نه «اطلاعیه وجود ندارد». خطا با fallback/تغییرgrant/SQL/refresh پنهان نشود و retry کور نباشد.

200 یا source=codal_feed تنها پذیرش این read محدود است؛ نه دریافت مالی/N10/N30، آخرین job موفق، NAV/قیمت یا کامل‌بودن چرخهٔ collect→store→API→render. cache HIT/Age نیز ثبت شود؛ از یک پاسخ cache‌شده اجرای تازهٔ upstream استنباط نشود. برای اثبات clock/null دوباره GET نزنید. پذیرش UI/رندر واقعی مرحلهٔ مستقل root/A است؛ نمونهٔ قدیمی dashboard/funds/فولاد امروز معرفی نشود.

## ۷. rollback محدود، ازقبل آماده و توسط root

در خطا ابتدا فقط deployment همین intent را از سرویس خارج کنید: اگر build درحال اجراست `cancel_deployment` روی **همان ID**؛ اگر ساخته/READY است حذف **همان ID** از مسیر موجود احرازشدهٔ root، canonical REST=`DELETE /v13/deployments/{id}`. سپس فقط دو ID env جدید همین project/branch، canonical REST=`DELETE /v9/projects/{projectId}/env/{newEnvId}`؛ نه حذف با wildcard/key یا batch همه، نه مقدار/ID قدیمی.

حذف env از تنظیم پروژه، env تزریق‌شده در deployment ازقبلساخته‌شده را پس نمی‌گیرد؛ بنابراین صرف delete-env یا توقف آزمون را rollback کامل ننامید. نبود branch env در metadata و حذف/عدم دسترسی همان deployment از metadata بازخوانی شوند؛ برای اثبات حذف دوباره source GET نشود. اگر create/update/delete نتیجهٔ unknown داد، فقط readback و تطبیق ID، نه تکرار کور. همهٔ حذف‌ها نیز نیازمند همان دامنهٔ اجرای آیندهٔ root هستند؛ اکنون اجرا نشده‌اند.

Production/global settings، public pair، guard، source branch، cronها و دادهٔ اصلی دست‌نخورده می‌مانند. `vercel rollback`/promote/alias production و ساخت Preview جایگزین برای rollback این آزمون استفاده نشوند. اگر root مسیر حذف دقیق با احراز موجود ندارد، پیش‌پرواز از ابتدا STOP است. نصب/توکن یا سؤال از آرش راه‌حل این گیت فرض نشده است.

## منابع و بازتولید کد (بدون اجرای زنده)

- https://vercel.com/docs/rest-api/deployments/create-a-new-deployment — source با ref+sha، default preview و projectSettings برای پروژهٔ موجود.
- https://vercel.com/docs/project-configuration/git-configuration — branch-only auto-deploy guard.
- https://vercel.com/docs/cron-jobs — scheduler به production URL.
- https://vercel.com/docs/cron-jobs/manage-cron-jobs — cronها API هستند؛ Disable Cron Jobs تنظیم کل پروژه است.
- https://vercel.com/docs/rest-api/deployments/delete-a-deployment و `/rest-api/projects/remove-an-environment-variable` — حذف دقیق ID.

```sh
node_modules/.bin/tsx --test app/api/codal-list/route.test.ts lib/codal-feed.test.ts components/symbol/CodalReportsTab.test.ts lib/liara-public-env.test.js
```

کد/guard/CI همان e48 است؛ برای این تغییر صرفاً مستند، آزمون زنده یا CI/Preview تازه اجرا نشده است. برگ تاریخی a13 و رسید انتشار e48 در Git/PR364 محفوظ‌اند؛ این برگ جای هیچ lastSuccess/تازگی دادهٔ نامعلوم را نمی‌گیرد.

## P06.4/P07 — اتصال علت رد به گزارش: شکاف و برش بعدی

**وضعیت این واحد: طرح فنی آماده، اجرای وابسته نگه‌داشته‌شده.** گیت Preview/binding همچنان بسته است: مسیر حذف احرازشدهٔ root ثابت نشده؛ نه env/manualdeploy/guard removal اجرا شود. sourcee48 و کد/CI364 ثابت‌اند. این افزوده فقط تطبیق source و قرارداد است، نه candidate رفع عملیاتی یا receipt تازه از pipeline.

### شاهد موجود چه می‌گوید و چه نمی‌گوید؟

رسید تاریخی root روی PR332@e71e0278c3ad16060ad08248c952873642071503، `evidence/START-C-source-metadata-root-20261031.json`، query واقعی 30Oct22:28:12UTC (31Oct01:58:12تهران) بود: stateupdated=21:12:09.793Z و lastCycleadmissionRejected18 شامل N10scope_unknown2،scope_unsupported13 وN30unsupported_layout3؛ exceptionهای download/admission/persistence صفر، lastSourceAttemptAt وlastCompletePipelineSuccess=null، runtimeLastRunPersisted=false. این شاهد در این نوبت دوباره SQL/خواندن نشده و همچنان به reportId/دوره/scope/clock همان تلاش وصل نیست. صفر exception، موفقیت مالی یا نبود مشکل سایر چرخه‌ها نیست.

source بررسی‌شده برای خط‌های زیر e48 است؛ برابری این کد با image زندهٔ primary در این نوبت آزموده نشده است. در این source، counts مربوط به engine feed+backfill‌اند؛ archive قرارداد جدا دارد، بنابراین آن را همهٔ مسیرهای Codal ننامید.

| محل موجود | قرارداد/شکاف دقیق |
|---|---|
| `relay/codal.mjs:1019–1024` | downloadAndParse خود `a` و meta را دارد، ولی callback فقط observer parser است؛ HTML به diagnostic نباید برود. |
| `relay/codal-admission-diagnostics.mjs:40–43` | notifyAdmissionRejection فقط `{kind,reason}` می‌فرستد و خطای observer را بی‌اثر نگه می‌دارد. |
| همان فایل `:28–38` | admissionEvent تمام extraها را عمداً حذف می‌کند؛ recordAdmissionRejection فقط fixed-cardinality totals/lastCycle را افزایش می‌دهد. |
| `relay/codal-engine.mjs:303–313` و`:401–411` | این دو نقطه هم‌زمان `a` و reason همان تلاش را دارند؛ پس از ثبت count، اتصال به `a` در diagnostics باقی نمی‌ماند. نمونهٔ متصل نیازمند hook همین runtime است. |
| engine`:168–172` | fails فقط URL→تعداد شکست انباشته است؛ MAX_FAILS=3. علت/دوره/زمانِ هر تلاش یا ارتباط با lastCycle را نگه نمی‌دارد و ledger ممکن است ردهای چندچرخه/علت‌های مختلف داشته باشد. join آن با شمارنده۱۸، نسبت‌دادن تازه یا پرکردن reportId مجاز نیست. |
| diagnostics`:24–26`؛ engine`:123–128` و`:140–144` | load، diagnostics را دوباره به countهایv1 محدود می‌کند؛ saveState همان payload را در ir_market_snapshots/key=codal_engine_state می‌نویسد. افزودن اطلاعات صرفاً به callback هم بدون تغییر قرارداد load/save پایدار نمی‌ماند. استفاده از همان POST نیز تغییر semantic payload writer است، حتی اگر درخواست اضافه‌ای نباشد. |
| engine`:432` و`:440–441` | lastRun فقط ساعت runtime و جدا از state است؛ lastCycle در آغاز چرخه reset می‌شود. updated_at ساعت ذخیرهٔ state است، نه ساعت هر rejection یا job موفق. |
| codal`:1030–1055` | report row و captured_at فقط در مسیر accepted/persistence ایجاد می‌شوند؛ rejected الزاماً codal_reports.id ندارد. یک row قدیمی همان URL هم ID این تلاش ردشده نیست. |
| `relay/codal-archive.mjs:229–240` | archive فعلی downloadAndParse را بدون observer علت صدا می‌زند؛ parseFailed و ledger مستقل دارد. افزودن پوشش آن برش جداست و در counts فعلی۱۸ ادغام نمی‌شود. |

**نتیجهٔ guardها:** در codal.mjs:518–524، scope_unsupported یعنی تعداد contextهای income مستقل صفر است؛ این می‌تواند نبود context شناخته‌شده هم باشد، پس از۱۳ مورد نمی‌توان۱۳گزارش تلفیقی نتیجه گرفت. scope_unknown نیز مقدار معتبر scope را به بیرون نمی‌دهد. N30unsupported_layout در:690–697/:741–742 به نبود جدول با headerهای شناخته‌شدهٔ محصول/دوره اشاره دارد؛ این دلیل مشخص، شناسه/دورهٔ سه گزارش را تعیین نمی‌کند.

**هم‌پوشانی PR329:** head فعلی خوانده‌شده9668620ab24ae6f1f6c11f7b12e19659a1f28bb5، OPEN/unmerged. diff آن در relay/codal.mjs بازار/واحد ردیف‌های N30 را داخل بلوک layout ازقبلشناخته‌شده اصلاح می‌کند و restatement/نسخهٔ parser دارد؛ گیت‌های scope N10، تشخیص header منجر بهunsupported_layout و قرارداد attribution را تغییر نمی‌دهد. بنابراین رفع این۱۸رد یا آن۳layout را به329 نسبت نمی‌دهیم و fix مشابه صادرات/خدمات دوباره نمی‌سازیم. تغییر layout واقعی هر گزارش تا دریافت شاهد متصل/ورودی ذخیره‌شدهٔ متعلق به همان مورد نامعلوم است.

### آیا delta خالص واقعاً این مشکل را رفع می‌کند؟

خیر، با ورودی فعلیِ ذخیره‌شده. یک اجرای آفلاینِ فقط helper خالص موجود انجام شد: دو ورودی مصنوعی با kind/reason یکسان ولی reportId/period/scope/observedAt متفاوت به admissionEvent و سپس recordAdmissionRejection داده شدند؛ خروجی‌ها دقیقاً یکسان بود. readAdmissionDiagnostics نیز records/clock اضافی را حذف کرد. network=0، engine/collector import=0، writer/provider/runtime اجرا یا ویرایش نشده‌اند. این اثبات رفتار قراردادِ فعلی است، نه replay آن۱۸ گزارش یا fixture زنده. تبدیل خالص از این خروجی مشترک نمی‌تواند identity/timeهای متفاوت را بازسازی کند.

metaFromAnnouncement هم منبع جایگزینِ «تأییدشده» نیست: codal.mjs:952–965 برای نبود ماه در عنوان N10 عدد۱۲ پیش‌فرض می‌دهد و jalaliStr در:56 فقط رشته را قالب‌بندی می‌کند. آن‌ها را periodVerified یا clock معتبر ننامید؛ title/guard reason را scopeVerified نکنید. reportId/period/scope و زمانِ موارد قدیمی تا شاهد متصل **null** هستند. observedAt خواندن root و updated_at state جای rejectedAt/attemptStartedAt/sourcePublishedAt نمی‌نشینند.

افزودن helperی که این فیلدها را از counts حدس بزند، یا projectorی بدون اتصال runtime با ادعای رفع مشاهده‌پذیری، تحویل واقعی این نقص نیست. ازاین‌رو در این نوبت delta محصول ساخته نشد؛ فقط این واحد وابسته نگه داشته می‌شود، نه کلP06/P07.

### رزرو پیشنهادی برای root؛ اکنون هیچ‌کدام ویرایش نشده‌اند

رزرو فعال C در این نوبت فقط همین DELIVERY است. برش آینده نیازمند تخصیص صریح root برای دو hook engine و هماهنگی مالک sanitizer است؛ رزرو خودکار فایل‌های محافظت‌شدهٔ A فرض نشود:

- `relay/codal-engine.mjs`: فقط اتصال همان announcement و اولین rejection هر تلاش طبیعی در دو lane feed/backfill؛ بدون تغییر fetch/download/known/ledger/insert/watermark/بودجه/زمان‌بند. ثبت قبل/بعد تلاش واقعی با clock همان execution؛ نه Date.now برای بازسازی گذشته.
- `relay/codal-admission-diagnostics.mjs`: serializer/restore whitelist لازم برای metadata متصل؛ این تغییر sanitizer محسوب می‌شود و اکنون ممنوع/نیازمند هماهنگی root/A است. reason enum و guardهای پذیرش عوض نشوند.
- `relay/codal.mjs`: تنها اگر scope/period تأییدشدهٔ parser باید در observer بیاید، قرارداد observer فعلی نیازمند رزرو جداگانه است؛ در گام حداقلی اصلاً تغییر نکند و فیلد تأییدنشدهnull بماند. writer گزارش insertParsedReport و parser/فرمول/واحد/329 و منبع untouched.
- تست‌های موجود `relay/codal-engine-cycle.test.mjs` و`relay/codal-n10-admission.test.mjs`: بعد از تخصیص، فقط قرارداد افزایشی و حفظ رفتار را بسنجند؛ registry/package/CI جدید لازم نیست. archive و sanitizer/types/MonthlyCharts/دادهP14ِ A بیرون محدوده بمانند.

### قرارداد حداقلی آینده و اثر قابل بررسی

در **همان** admissionDiagnostics موجود و **همان** state write طبیعی، metadata محدود فقط برای **ردهای طبیعی آینده**؛ نه جدول/ledger/journal/API/statekey جدید یا ارسال مدل. outer counts و version1 فعلی محفوظ بمانند؛ nested metadata نسخهٔ مستقل داشته باشد تا migration شمارنده‌های تاریخی را صفر نکند. reader قدیمی ممکن است metadata تازه را کنار بگذارد؛ rollback آن را پوششِ نامعلوم اعلام کند، نه empty یا احیای history. load/save/debug serializer و expose کردن شناسهٔ عمومی نیاز به review یکجا دارند.

قرارداد پیشنهادی هر observation، نه دادهٔ مشاهده‌شده یا ساخت۱۸رویداد:

```json
{
  "reportId": null,
  "sourceAnnouncementId": null,
  "announcementRef": null,
  "lane": null,
  "kind": null,
  "reason": null,
  "periodDeclared": null,
  "periodVerified": null,
  "scopeVerified": null,
  "clocks": {
    "sourceSentAt": null,
    "sourcePublishedAt": null,
    "attemptStartedAt": null,
    "rejectedAt": null
  }
}
```

reportId فقط شناسهٔ صریح و معتبر همان مشاهده است؛ DBid برای rejected معمولاًnull می‌ماند. sourceAnnouncementId تنها اگر خود منبع همان شناسه را صریح/معتبر داده یا identifier عمومیِ معتبر Codal در همان announcementRef تأیید شود؛ hash، requestHash، URL به‌جایDBid، index یا شناسهٔ گزارش قدیمی مجاز نیست. announcementRef فقط URL عمومی مصوب با whitelist و بدون credential/query خصوصی؛ rawHTML/عنوان کامل/مقادیر مالی/stack/header/env ذخیره نشوند. periodDeclared اگر واقعاً همراه همان announcement است با basis اعلام‌شده جدا از تأیید parser؛ periodVerified/scopeVerified و clock تبدیل‌شده فقط با شاهد معتبر، وگرنهnull. نرسیدن به guard دوره/واحد موفقیت آن را ثابت نمی‌کند.

بودجهٔ نمونه‌برداری از **تلاش‌های موجود همان چرخه** می‌آید: حداکثر دامنهٔ engine `FEED_MAX_DL + BACKFILL_PER_CYCLE × BACKFILL_MAX_DL` با effective configuration معتبر همان runtime؛ پیش‌فرض source۱۰+۲×۶=۲۲ تلاش گزارش است، نه ادعای مقدار واقعی فعلی سرور یا سقف درخواست‌های HTTP؛ retryهای دانلود موجود جدا هستند و تغییر نمی‌کنند. هیچ درخواست/دانلود، retry یا دور جدید برای پرکردن metadata ایجاد نشود. cap فیلد/طول/حجم و omittedCount/coverage صریح و bounded؛ overflow فقط نمونه را حذف کند، شمارندهٔ کامل را کم نکند یا چرخه را موفق ننامد. ledger600/MAX_FAILS3 و مصرف فعلی provider ثابت بمانند. metadata یک window محدود lastCycle است، نه دفتر append-only کامل. snapshot قدیمی بدون observation = coverageنامعلوم، نه صفر رد.

برای اثر واقعی نیاز است engine اتصال را ثبت و قرارداد restore/save آن را نگه دارد؛ این runtime + payload writer است و از مجوز «اصلاح خالص بدون runtime/writer» فراتر می‌رود. حتی پس از نصب احتمالی، صرفاً چرخهٔ طبیعی بعدی می‌تواند شاهد تازه بسازد؛ runEngineCycle، codal-engine-dryrun.mjs، codalDebugDump، archive batch، provider refresh، SQL یا مدل برای ساخت شاهد اجرا نشوند. گذشته با تغییر کد ترمیم خودکار نمی‌شود و last-success همچنان نامعلوم است.

### معیار آزمون candidate آینده و پایان این واحد

۱) ورودی legacy همان counters را با ID/clocknull/coverageunknown بازخوانی کند، نه resetv1→zero. ۲) دو lane به announcement همان تلاش وصل باشند؛ skipped/known/blocked گزارش rejection تازه نسازند. ۳) نخستین reason و accepted/null outputs، count/request/write-budget، watermark، backfillCursor و blocking۳تلاش ثابت بمانند. ۴) default۱۲ماه/meta، scopeازعنوان/علت، store/read clock و IDقدیمی جای شاهد نیایند؛ null/invalid بماند. ۵) cap/drop/omitted coverage و saturation باعث false-empty یا false-success نشود. ۶) URL/metadata مخرب، private payload/header/env حذف شوند و خطای observer پذیرش/پارس را عوض نکند. ۷) فقط mock/ورودی ذخیره‌شدهٔ ازقبل مجاز؛ هیچ natural provider replay یا primary write برای تست. ۸) تعداد POST طبیعی state/report و بودجه همان baseline بماند؛ API/debug ناخواسته دادهٔ بیشتر افشا نکند.

**تحویل این نوبت:** source/قرارداد/PR329 تطبیق شد، محل از‌دست‌رفتن اتصال و اثر اصلاح ثبت شد؛ فایل محصول/محافظت‌شده تغییر نکرد، ID/دوره/scope/clock قدیمیnull وگیت Preview بسته ماند. **مالک next action:** root برای تخصیص runtime/serializer و هماهنگی A؛ C برای candidate پس از آن. این گزارش ادعای رفع ردها، تکمیل مالی یا پذیرش مقصد واقعی نیست و سؤال فنی از آرش ایجاد نمی‌کند.

## تخصیص candidate P06.4/P07 — قبل از patch

دستور تازهٔ root وضعیت «طرح نگه‌داشته» بالا را فقط برای **تهیهٔ کد/mock** این چهار فایل باز کرد: relay/codal-engine.mjs (دو hook رد طبیعی + reset metadata کنار reset شمارندهٔ موجود)، relay/codal-admission-diagnostics.mjs (serializer/restore محدود)، تست‌های مرتبط موجود و همین DELIVERY. sourcebase=e48، branchمحلی مستقل=codex/codal-rejection-metadata-v04-20261031. parser/واحد/329/archive/known/ledger/watermark/fetch/retry/زمان‌بند/بودجه و فایل‌هایA دست‌نخورده می‌مانند. نصب و اجرای collector/writer واقعی همچنان ممنوع است.

قرارداد پیش از کد: outerversion1 و totals/lastCycle حفظ؛ nestedobservations.version1 با window=cycle_observed_rejections، coverage=unknown/observed/partial. legacy یا nested ناشناخته/ناسازگار=unknown باeventsخالی/omittedCountnull، نه اعلام صفر رد تاریخی. پنجرهٔ تازه فقط هنگام reset چرخهٔ موجود فعال می‌شود. sampler cap=min(بودجهٔ تلاش فعلی معتبر،۳۲)، capبدنه۳۲KiB؛ drop با omittedCount وpartial، بدون اثر بر شمارنده یا پذیرش. شمارندهٔ resetشده/همانPOST موجود، نه IO یا تاریخچهٔ دوم.

هم‌مشاهده: اولین reason واقعی همان تلاش طبیعی + lane و clockهای واقعی attemptStartedAt/rejectedAt؛ source clocks، reportId، periodVerified/scopeVerified همیشهnull چون قرارداد parser شاهدی نمی‌دهد. فقط reference عمومی HTTPS Codal Decision با query مصوب؛ sourceAnnouncementId از همان LetterSerial صریح، نه hash/DBid. periodDeclaredText تنها نقل محدود date_title با format/date-range ساده و با برچسب متن اعلام‌شده، نه تقویم/دورهٔ تأییدشده یا پیش‌فرض۱۲ماه. هیچtitle/HTML/financial/header/privateURL نگهداری نشود.

آزمون‌ها: privacy/clock/null/cap/restore ناسازگار و حفظ v1؛ اتصال دو lane با mock واقعی engine، حفظ fetch/write/download/known/block/watermark/بودجه؛ موفق/exception/blocked نمونهٔ رد تازه نسازد؛ observer خطاپذیر ingestion را تغییر ندهد. مقایسهٔ counterهای قدیمی از nested افزایشی جداست، ولی assertionهای اصلی رفتار حفظ می‌شوند. بدون pipeline/provider replay یا بازسازی۱۸گزارش.

گیت انتشار: guard e48 فقط branch364 را می‌بندد، نه branch جدید. remote head جدید تا وجود guard همان branch منتشر نمی‌شود. اضافه‌کردن mapping دقیق branch جدید=false به vercel.json بیرون تخصیص این چهار فایل است؛ candidate کامل و patch پیشنهادی guard برای root آماده می‌شود، بدون push/deploy یا سؤال از آرش. این شرط مانع پیاده‌سازی/mock نیست.

### نتیجهٔ candidate تخصیص‌یافته — کد/mock، بدون نصب

دو hook engine اکنون اولین rejection طبیعی همان تلاش را به announcement/lane و ساعت runtime وصل می‌کنند. initialization metadata کنار reset شمارندهٔ همان چرخه است؛ هیچ scheduler/cycle تازه نیست. saveState/insert/fetch/retry/known/ledger/watermark، parser/329/واحد/archive و داده/فایل‌هایA بایت‌به‌بایت با e48 ثابت مانده‌اند. تنها payload همان state موجود، در صورت نصب آینده، nested metadata افزایشی خواهد داشت؛ هیچ POST، جدول یا ledger دوم ایجاد نشده است. existingdebug نیز فقط همین object محدود را می‌بیند.

قرارداد واقعی کد:

- outerversion1 و totals/lastCycle همان ثابت قبلی؛ nested `observations.version=1`،window=`cycle_observed_rejections`.
- `coverage=unknown`: metadata قبلی موجود/قابل‌اعتماد نیست؛limit/cycleStartedAt/omittedCount=null،events=[]؛ نه ادعای صفر رد. تاریخچهٔ countهای v1 حفظ می‌شود و رویداد قدیمی ساخته نمی‌شود.
- `coverage=observed`: تمام rejectionهای شمرده‌شدهٔ همین window تا آن لحظه retained هستند؛ این به معنی کامل‌بودن identity/دوره/scope، اتمام چرخه یا موفقیت ingestion نیست. nullها مستقل‌اند. `partial` یعنی حذف نمونه وomittedCountصریح؛ شمارندهٔ کامل کم نمی‌شود.
- capتعداد=min(effectivebudget معتبر،۳۲)، capکل nested object=۳۲KiB به UTF8، هرrefحداکثر۵۱۲کاراکتر وLetterSerialحداکثر۲۵۶. ظرفیت کمتر/invalidbudget فقط پوششmetadata را محدود می‌کند و هیچ تنظیم بودجه‌ای را تغییر نمی‌دهد. restoreناسازگار/oversize/futurecycle/countermismatch=unknown، نه resetcounter یا falseempty.
- هر event:kind/reason/lane،reportId=null،sourceAnnouncementId فقط LetterSerial همانURL،announcementRef فقط HTTPS Codal Decision وپارامترهایpublicمصوب،periodDeclaredText نقل محدود date_title (نه تقویم تأییدشده)،periodVerified/scopeVerified=null. clockssourceSentAt/sourcePublishedAt=null؛attemptStartedAt/rejectedAt فقط زمان واقعی همان execution، با format/range/order معتبر؛future/invalid/reversed بهnull می‌روند و هیچ‌وقت ساعت read/store جایگزین نمی‌شود.
- هیچ title/HTML/financial/header/privateURL/credential نگهداری نشده؛ host/path/query غیرمجاز یا controlcharacter، userinfo،duplicatequery وfragment رد می‌شوند. IDازhash،rowقبلی یا index ساخته نمی‌شود. دو تلاش طبیعی همانURL در دوlane دو مشاهده‌اند؛ به‌عنوان دوگزارش یکتا معرفی یا dedupeساختگی نمی‌شوند.

اعتبارسنجی نهایی: `node --test relay/codal-n10-admission.test.mjs relay/codal-engine-cycle.test.mjs relay/codal-coverage.test.mjs` →۱۷۳pass،صفرfail/skip؛ رگرسیون parser موجود `node relay/codal.test.mjs`→ALL TESTS PASSED؛ engineunitباSKIP_LIVE=1→۱۳pass. تست‌ها دارای fixture/mock صریح‌اند؛ تمام fetchهای engine به provider/storage.invalid یاExcel.invalid محدود و unmatched denied هستند. fixtureCodalIDها synthetic‌اند و URLannouncement هرگز fetchنمی‌شود. reportwrite/statewrite صرفاً آرایه‌های حافظهٔ mock بودند، نه اجرای writer واقعی.

آزمون معنایی negativecontrol، context hookfeed را موقتاً حذف کرد: آزمون اتصال همانlane با partialبه‌جایobserved شکست خورد و backfill سالم ماند؛ سپس source دقیق بازگردانده شد. تست‌های اصلی تعداد درخواست/سه retryدانلود/block۳تلاش/ledger/watermark وcountv1 حفظ شده‌اند؛ فقط مقایسهٔ countهای قبلی از nested افزایشی جدا شده و assertionهای اختصاصی metadata اضافه شده‌اند. capبایت حتی قبل از capتعداد باfixtureطولانی فعال شد؛ omitted+retained برابرcount باقی ماند. خطای getter/envelope اختیاری پذیرش یا counters را تغییر نداد.

این candidate در appPreview اجرا نمی‌شود؛ hookها مربوط به relaycollector هستند و فعال‌شدن واقعی نیازمند rollout جداگانهٔ root است. هیچ rollout/deploy/env/SQL/provider/model/ingest یا pipeline replay انجام نشده؛ گیت cleanupاحرازشدهٔ Preview همچنان بسته است. ۱۸رد تاریخی بازسازی نشد و lastSuccess نامعلوم است. بستهٔ Preview-read قبلی همچنان فقط sourcee48 را هدف می‌گیرد؛ آن را با این candidate تعویض نکنید.

برای Draft مستقل: branchمحلی `codex/codal-rejection-metadata-v04-20261031` ازe48 است؛ guard فعلی فقط branch364 را پوشش می‌دهد. mapping زیر فقط **پیشنهاد تخصیص root** است و vercel.json اکنون تغییر نکرده. تا تخصیص و ثبت guard همانbranch، candidate به‌صورت Gitcommit/tree قابلreview و بدون remote-head/push تحویل می‌شود؛ Draft رسمی/CI جدید/Preview ادعا نمی‌شود:

```json
{"git":{"deploymentEnabled":{
  "codex/codal-stored-reader-v04-20261031":false,
  "codex/codal-rejection-metadata-v04-20261031":false
}}}
```

فقط entryدوم لازم است؛ crons/تمامfieldsقبلی محفوظ، wildcard/globalfalse/project/Production دست‌نخورده. این مانع صرفاً انتشار remote branch است و کد/mock بالا را متوقف نکرد. مالک nextaction برای guard و انتشار/CI، root/C؛ مالک نصب/چرخهٔ طبیعی/پذیرش، root. هیچ سؤال یا credential از آرش لازم نیست.

بررسی نهایی همین candidate: lint:ci وtypecheck موفق؛ scansecrets روی هر۵فایل staged موفق. CI2079/41145696401 متعلق بهsourceقبلیe48 است و به این candidate تعمیم داده نمی‌شود؛ CI آنلاینِ candidate هنوز اجرا نشده است. نتیجهٔ کد/mock برای review آماده است، نه پذیرش primary/natural-cycle یا بازیابی metadata گذشته.
