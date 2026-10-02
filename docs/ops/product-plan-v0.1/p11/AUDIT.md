# موجودی اندازه‌گیری و شکاف

بررسی مستقیم کد در `195@31c44ab`، 2026-10-02. «موجود در کد» به معنی نصب در محیط یا سنجه واقعی نیست. مبنای Production در snapshot برنامه main51fd066 است؛ این پرونده بررسی تازه استقرار انجام نداده است.

| منبع قابل اشاره | آنچه واقعاً دارد | بازاستفاده / شکاف |
|---|---|---|
| `lib/seasonal/contracts.ts`، `lib/seasonal/events.ts`، migration `20260930182629_seasonal_course_membership.sql` | seasonal.v0.1؛ seasonal_events با revision، membership.granted/revoked/renewed، cohort.cancelled، import/identity audit | مجوز/تمدید از دفتر اصلی؛ payload خام reason/receipt/fingerprint وارد analytics نشود. اعطای دسترسی الزاماً وصول فروش نیست. grant چندباره کاربر تازه نیست. |
| `lib/intelligence/publication.ts`، migration `20260930182918_research_publication_queue.sql` | publication.v1؛ versions/commands/events و resolver مجوز فعلی | projection از شناسه نسخه/رخداد؛ خروجی resolver مبنای اعلان، تحلیل مجوز تازه نمی‌دهد. publication.published ≠ ارسال موفق. |
| `lib/intelligence/publication-feed.ts`، migration `20261001121858_member_publication_feed_reads.sql`، `app/api/publications/[id]/read/route.ts` | رسید `(user_id,version_id)` یکتا و immutable، GET بدون side effect؛ mark read رخداد تازه ایجاد نمی‌کند | snapshot/delta رسید در مسیر کنترل‌شده؛ receipt = اعلام مطالعه، نه زمان مطالعه، فهم یا معامله. نسخه تازه unread می‌ماند. دسترسی analytics به جدول private هنوز مجاز/نصب نشده. |
| `sql/phase22_manual_intelligence_workflow.sql` | intel_workflow_events و intel_rehearsal_days؛ minutes_to_approval، corrections، absent/stale sources | بازاستفاده rehearsal؛ elapsed approval را با دقیقه کار فعال آرش یکی نکن. followup_note آزاد صادر نشود. خط مبنا کار فعال و هفته پاسخ‌گویی هنوز نداریم. |
| `lib/data-analytics.ts`، `app/api/data/analytics/route.ts` | میانگین حجم و گزارش monthly/quarterly بازار | product analytics نیست؛ به داشبورد فعالیت عضو تغییر معنا نده. |
| `lib/read-state.ts` | ready/empty/error؛ خطا null و کد عمومی | دسته خطای محدود و منبع/مالک، بدون error body یا پاسخ provider. outage با «عضو نیست» یکی نشود. |
| `sql/phase32_member_holdings.sql`، فایل‌های `lib/portfolio/*` | نسخه دارایی و موتور مالی فعلی | شمار موفقیت commit به‌جای مقادیر مالی؛ سنجه بازده بدون جریان نقد ممنوع. هیچ جدول مالی به analytics صادر نشود. |

## موجودی مرتبط، خارج از پایه منتخب

PR189/site `804b6ae4f231a0c7fd2bc6e01121843fafc4e345` در git object بررسی شد: `lib/notifications/bridge.ts` با notifications.v1، `lib/notifications/worker.ts` با accepted/retry/failed/unknown/cancelled، RPCهای next09_stage/claim/check_attempt/finish. accepted یعنی پذیرش transport، نه دیده‌شدن؛ unknown/network_ambiguous نباید خودکار تکرار شود. این commit در195 نیست. PR193 و miniapp5 در برنامه به‌عنوان وابستگی آمده‌اند؛ در این تحویل runtime یا diff کامل آنها پذیرفته نشده و انتخاب adapter باP05/P00 است. هیچ نسخه اعلان دوم ساخته نمی‌شود. policy rejection قبلیNEXT09 پابرجاست و مسیر اجرایی آن دوباره امتحان نشده است.

جست‌وجوی محدود `app lib components package.json` برای posthog/sentry/plausible/gtag/trackEvent/telemetry هیچ SDK یا collector محصول را در پایه195 نشان نداد؛ تطابق واژه implausibleRatio ابزار analytics نیست. این نتیجه فقط این محدوده/نسخه را پوشش می‌دهد، ابزار خارج مخزن یا نصب‌شده در Production UNKNOWN است.

## شکاف‌های مستقل و وابسته

- مستقل اکنون: واژه‌نامه رخداد، KPI/مخرج، قالب شاهد، time study و cost ledger، runbook و طرح پایلوت.
- وابسته بهP00/P01: eligible population و زمان آغاز دسترسی، سیاست تمدید/انقضا، mapping ناشناس کنترل‌شده و محل نگهداری.
- وابسته بهP03/P05/P07: server-side login/read/action projection، نسخه مشترک اعلان/محتوا و delta idempotent، رخداد خطا بدون متن.
- وابسته بهP08: invocation metadata، هزینه معتبر provider و rubric انسانی؛ مدل/دستور/نسخه منابع، سقف مصرف و توقف. متن سؤال/پاسخ و عدد مالی وارد provider/analytics نمی‌شود.
- وابسته بهمالک عملیات: مسئول نام‌دار پشتیبانی، ساعات پاسخ، نگهداری/حذف، دسترسی incident/ticket. این مأموریت هیچ SLA یا provider تازه تصویب نمی‌کند.

قبل از استفاده واقعی، کیفیت داده: coverage هر adapter، مخرج دسترسی، missing/late/duplicate و مرز دوره/تهران بررسی شود. منبع غایب صفر نیست. هیچ نرخ فعال‌سازی/تمدید/هزینه از این audit نتیجه نشده است.
