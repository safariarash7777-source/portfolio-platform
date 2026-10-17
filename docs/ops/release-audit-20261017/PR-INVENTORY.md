# موجودی PRهای باز — ۲۰۲۶-۱۰-۱۷

این فایل شاهد نقطه‌ای است؛ وضعیت جاری فقط در ../../COMMAND-CENTER.md نگهداری می‌شود. مبنا `4da7b3918e8811b98a3bf7419a7bebca82e6a8a2`. ۸۳ PR باز، همه Draft. اطلاعات عنوان/شرح/base/head/mergeable و CI برای تک‌تک PRها خوانده شد؛ مسیرهای تغییرکرده با Git و blobهای main تطبیق داده شدند. این کار بازبینی خط‌به‌خط همه کدها یا تأیید آمادگی انتشار نیست.

۸۰ PR در پاسخ ابزار، اجرای CI موفق روی head داشتند؛ برای #74/#75/#149 اجرای PR-triggered برنگشت (به معنی نبود همه انواع CI نیست). ابزار فقط صفحه نخست اجرای PR را برمی‌گرداند. CI تاریخی یا mergeable=true جای پذیرش نسخه ترکیبی و runtime را نمی‌گیرد. شمار فایل برابر یعنی همان blob و mode در main؛ اختلاف فایل ممکن است ناشی از اصلاح جدیدتر main باشد و اثبات جاافتادن قابلیت نیست. هیچ PR صرفاً با این سنجه بسته نشد.

## تحویل جاری

| PR | عنوان | head | CI مشاهده‌شده | mergeable | فایل برابر main / کل | اقدام |
|---|---|---|---|---|---|---|
| [#244](https://github.com/safariarash7777-source/portfolio-platform/pull/244) | feat(ui): extend layered Arash design language across desk and shared surfaces | 29423db | success | true | 0/12 | Preview موجود؛ انتخاب طراحی و پذیرش حساب/داده مانده |
| [#243](https://github.com/safariarash7777-source/portfolio-platform/pull/243) | fix(dashboard): distinguish financial read errors from empty states | aa9d6ec | success | true | 0/5 | نامزد انتشار محدود؛ بازبینی و پذیرش مرورگر لازم |
| [#242](https://github.com/safariarash7777-source/portfolio-platform/pull/242) | docs(portfolio): verify save retries and correct B3 acceptance scope | 63e144b | success | false | 0/2 | با main تلفیق و ارسال شد؛ فقط رسید آزمون تاریخی |
| [#241](https://github.com/safariarash7777-source/portfolio-platform/pull/241) | fix(codal): accept optional در in equity statement titles | 3755898 | success | true | 0/3 | نامزد اصلاح رله؛ بازبینی، پنجره انتشار و شاهد چرخه لازم |
| [#240](https://github.com/safariarash7777-source/portfolio-platform/pull/240) | docs: coordinate independent member, market and portfolio deliveries | 960b150 | success | false | 0/1 | با main تلفیق و ارسال شد؛ سند برنامه، نه انتشار قابلیت |

## ورود، عضو، آموزش، پرداخت و دسترسی

| PR | عنوان | head | CI مشاهده‌شده | mergeable | فایل برابر main / کل | اقدام |
|---|---|---|---|---|---|---|
| [#237](https://github.com/safariarash7777-source/portfolio-platform/pull/237) | NOT READY FOR PRODUCTION: M2 exact-webinar access and SQL proposal | ced8a32 | success | false | 0/24 | مسدود: انتقال حقوق قبلی/ACL/پرداخت؛ ادغام نشود |
| [#226](https://github.com/safariarash7777-source/portfolio-platform/pull/226) | fix(auth): integrate selected member entry fixes on main | 32049f3 | success | false | 18/22 | ۱۸ از ۲۲ فایل برابر main؛ با اصلاحات جدید تطبیق شود |
| [#225](https://github.com/safariarash7777-source/portfolio-platform/pull/225) | fix(auth): protect profile roles and narrow member ledger privileges | d4998e7 | success | true | 11/12 | ۱۱ از ۱۲ فایل برابر main؛ فقط CI متفاوت؛ کاندید تطبیق جانشین |
| [#221](https://github.com/safariarash7777-source/portfolio-platform/pull/221) | fix(auth): make private profile reads independent of SMS activation | 0d15ed0 | success | true | 0/11 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#219](https://github.com/safariarash7777-source/portfolio-platform/pull/219) | Integrate bounded login, email recovery and financial Auth on cfa | 2e44dc1 | success | true | 0/26 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#218](https://github.com/safariarash7777-source/portfolio-platform/pull/218) | fix(auth): bound browser password login and late session writes | b2c2832 | success | true | 0/6 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#217](https://github.com/safariarash7777-source/portfolio-platform/pull/217) | fix(auth): align financial APIs with session error contract | ca2f3e2 | success | true | 0/3 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#215](https://github.com/safariarash7777-source/portfolio-platform/pull/215) | P01: protect email signup metadata and preserve the recovery journey | dd9f237 | success | true | 0/17 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#211](https://github.com/safariarash7777-source/portfolio-platform/pull/211) | P01: isolate Auth cookie names for the separate P00 demo | 0465115 | success | true | 0/6 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#209](https://github.com/safariarash7777-source/portfolio-platform/pull/209) | P03: guided member start, scoped lessons and resilient drafts | a44aff3 | success | true | 0/48 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#208](https://github.com/safariarash7777-source/portfolio-platform/pull/208) | P01: preserve Auth session failures, SSR callbacks and scoped access | f0e002b | success | true | 0/17 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#197](https://github.com/safariarash7777-source/portfolio-platform/pull/197) | test(member): remove calendar deadline from feed keyset fixture | e83c382 | success | false | 0/2 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#193](https://github.com/safariarash7777-source/portfolio-platform/pull/193) | NEXT09: preserve publication cohort links and classify session errors | 712ff1c | success | true | 0/23 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#190](https://github.com/safariarash7777-source/portfolio-platform/pull/190) | Auth180: preserve outage responses for identity and session status | a92e184 | success | true | 0/12 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#189](https://github.com/safariarash7777-source/portfolio-platform/pull/189) | NEXT09: verified Telegram connection and optional publication notifications | 804b6ae | success | true | 0/39 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#185](https://github.com/safariarash7777-source/portfolio-platform/pull/185) | feat(member): canonical cohort publication feed and version read state | a54b161 | success | true | 0/36 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#184](https://github.com/safariarash7777-source/portfolio-platform/pull/184) | fix(courses): align resource list and download with existing module grants | 51ad615 | success | true | 0/11 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#181](https://github.com/safariarash7777-source/portfolio-platform/pull/181) | feat(member): scoped course home and resumable needs assessment | a95aa0c | success | true | 0/40 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#180](https://github.com/safariarash7777-source/portfolio-platform/pull/180) | feat(auth): add isolated mobile OTP and transactional email infrastructure | bb4f2f3 | success | true | 0/74 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#179](https://github.com/safariarash7777-source/portfolio-platform/pull/179) | fix(auth): bound server login checks and preserve redirect cookies | ca27b94 | success | false | 0/14 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#177](https://github.com/safariarash7777-source/portfolio-platform/pull/177) | NEXT-05: rebuild public seasonal product and consultation request flow | 27e59ad | success | true | 0/68 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#175](https://github.com/safariarash7777-source/portfolio-platform/pull/175) | NEXT-04: verified seasonal enrollment and scoped membership ledger | bb7c2f9 | success | true | 0/56 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#156](https://github.com/safariarash7777-source/portfolio-platform/pull/156) | #113 هم‌تراز با main: پرداخت ← دسترسی، بدون تعارض و با CI تازه | fbb627e | success | false | 0/41 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#113](https://github.com/safariarash7777-source/portfolio-platform/pull/113) | feat(payments): one canonical path from payment to entitlement | b64ec25 | success | false | 0/41 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#91](https://github.com/safariarash7777-source/portfolio-platform/pull/91) | feat(G2-005): bridge payment to entitlement, with a recoverable failure path | 6f1dec0 | success | false | 0/12 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#75](https://github.com/safariarash7777-source/portfolio-platform/pull/75) | fix(security): webinar-registration RPC uses user client + security review findings | 2bd82eb | نامشاهد | false | 0/4 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |

## داده، بازار و FX

| PR | عنوان | head | CI مشاهده‌شده | mergeable | فایل برابر main / کل | اقدام |
|---|---|---|---|---|---|---|
| [#229](https://github.com/safariarash7777-source/portfolio-platform/pull/229) | Fix login recovery and gate prospective N10 admission | 527b0be | success | false | 8/12 | ۸ از ۱۲ فایل برابر main؛ با بسته‌های ادغام‌شده تطبیق شود |
| [#214](https://github.com/safariarash7777-source/portfolio-platform/pull/214) | Fix market freshness reporting and prepare quota install handoff | 44f16a9 | success | true | 0/12 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#212](https://github.com/safariarash7777-source/portfolio-platform/pull/212) | P02 FX: verified CPI model binding and bounded YTM archive retention | 84b0949 | success | true | 0/30 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#207](https://github.com/safariarash7777-source/portfolio-platform/pull/207) | P02: complete read-only market coverage and live quota acceptance gates | 81e68e4 | success | true | 1/22 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#204](https://github.com/safariarash7777-source/portfolio-platform/pull/204) | P02 FX: offline source guards and explicit D-FX decision handoff | 27b3990 | success | true | 0/8 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#198](https://github.com/safariarash7777-source/portfolio-platform/pull/198) | FOLLOWUP04: offline history/NAV coverage planner and resumable dry run | 9380772 | success | true | 0/27 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#195](https://github.com/safariarash7777-source/portfolio-platform/pull/195) | fix: retain missing N10 gross values and reject conflicting amount units | 31c44ab | success | true | 0/13 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#194](https://github.com/safariarash7777-source/portfolio-platform/pull/194) | IE01: reconcile EPS assertion with permitted full C4 rejection | e143fbb | success | true | 0/6 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#192](https://github.com/safariarash7777-source/portfolio-platform/pull/192) | IE01: offline contract replay exposes missing-value and unit failures | 1c24c16 | success | true | 0/15 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#187](https://github.com/safariarash7777-source/portfolio-platform/pull/187) | Bound public market sources and defer complete analytics scans | 874c160 | success | true | 3/48 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#183](https://github.com/safariarash7777-source/portfolio-platform/pull/183) | Verify portable FX dashboard runtime and document Linux acceptance | 8723c55 | success | true | 0/110 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#182](https://github.com/safariarash7777-source/portfolio-platform/pull/182) | fix(market): complete paginated readers and five-minute board refresh | e5740be | success | true | 0/42 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#178](https://github.com/safariarash7777-source/portfolio-platform/pull/178) | Harden shared BrsApi quota and protect persisted market snapshots | 4ce06b3 | success | false | 1/29 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#174](https://github.com/safariarash7777-source/portfolio-platform/pull/174) | NEXT-07: truthful market dashboards, units, freshness and module access | 95cfa34 | success | true | 1/77 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#154](https://github.com/safariarash7777-source/portfolio-platform/pull/154) | کارت بنیادی: فصل‌ها هم همان گزارش کارت را ببینند؛ زمان انتشار جای id | e34211c | success | true | 1/8 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#153](https://github.com/safariarash7777-source/portfolio-platform/pull/153) | رله: پایانی هر جلسه با برچسب جلسهٔ بعد ذخیره می‌شد (B-055) | cae459f | success | true | 3/9 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#150](https://github.com/safariarash7777-source/portfolio-platform/pull/150) | تقدم اصلاحیه در انتخاب گزارش هر دوره (#142) | 24beb20 | success | false | 2/6 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#149](https://github.com/safariarash7777-source/portfolio-platform/pull/149) | اتصال پایدار هشدار بازتوازن + استخراج واحد ن-۳۰ | 09d4893 | نامشاهد | true | 2/17 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#119](https://github.com/safariarash7777-source/portfolio-platform/pull/119) | feat(ops): measure the quota problem, then contain the growth | 47bf861 | success | false | 0/14 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#74](https://github.com/safariarash7777-source/portfolio-platform/pull/74) | feat(fx): فعال‌سازی GARCH و PSYِ ماهانه از سری روزانهٔ دلار | 6aaadc5 | نامشاهد | true | 0/5 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |

## سبد، پژوهش و هوشمندی

| PR | عنوان | head | CI مشاهده‌شده | mergeable | فایل برابر main / کل | اقدام |
|---|---|---|---|---|---|---|
| [#223](https://github.com/safariarash7777-source/portfolio-platform/pull/223) | fix(p07): persist private preparation in versioned research workbook | c3d282e | success | true | 10/21 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#222](https://github.com/safariarash7777-source/portfolio-platform/pull/222) | fix(recovery): persistent private finance and safe save retries | 3ace1fb | success | true | 9/23 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#220](https://github.com/safariarash7777-source/portfolio-platform/pull/220) | fix(p07): clear stale workbook approval after return | f0857a8 | success | true | 0/4 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#206](https://github.com/safariarash7777-source/portfolio-platform/pull/206) | feat(p07): connect manual Arash desk to existing research and publication | 051ca87 | success | true | 0/22 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#205](https://github.com/safariarash7777-source/portfolio-platform/pull/205) | P04: holdings import and investment scope previews with canonical read/receipt | 1fcb3a1 | success | true | 8/30 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#202](https://github.com/safariarash7777-source/portfolio-platform/pull/202) | P08: offline assistant contracts, privacy rehearsal and 60-question evaluation | a83bc01 | success | true | 0/44 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#176](https://github.com/safariarash7777-source/portfolio-platform/pull/176) | NEXT-08: daily research desk and audience-scoped publication queue | d697635 | success | true | 1/51 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#173](https://github.com/safariarash7777-source/portfolio-platform/pull/173) | ترازنامهٔ شخصی مشتری: دارایی، بدهی و خالص ثروت ثبت‌شده | 6787005 | success | true | 8/54 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#168](https://github.com/safariarash7777-source/portfolio-platform/pull/168) | نسخهٔ اول: دارایی نسخه‌دار، پژوهش و پروندهٔ مشاوره با دسترسی صریح | 15eebc9 | success | false | 15/80 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#157](https://github.com/safariarash7777-source/portfolio-platform/pull/157) | کاربرگ پژوهش: ذخیره، بازکردن، نسخهٔ دوم و تأیید داخلی (#142) | 819cbf1 | success | false | 1/9 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#144](https://github.com/safariarash7777-source/portfolio-platform/pull/144) | دارایی واقعی نسخه‌دار عضو و موتور مقایسه با سبد هدف (#140) | 48cea22 | success | false | 8/34 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#143](https://github.com/safariarash7777-source/portfolio-platform/pull/143) | لغو انتشار اعلامیه بدون نابودکردن سابقه (#139) | ae06f0a | success | false | 0/14 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |

## طرح و پوسته قبلی

| PR | عنوان | head | CI مشاهده‌شده | mergeable | فایل برابر main / کل | اقدام |
|---|---|---|---|---|---|---|
| [#199](https://github.com/safariarash7777-source/portfolio-platform/pull/199) | fix: refine the existing public frontend and request error states | e1c46e3 | success | false | 0/14 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#188](https://github.com/safariarash7777-source/portfolio-platform/pull/188) | Design review: connected course/member prototype and local font A/B | f3a0e05 | success | true | 0/25 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |

## یکپارچه‌سازی/زیرساخت/مهاجرت

| PR | عنوان | head | CI مشاهده‌شده | mergeable | فایل برابر main / کل | اقدام |
|---|---|---|---|---|---|---|
| [#216](https://github.com/safariarash7777-source/portfolio-platform/pull/216) | P00: compose the portfolio import preview and manual research desk for isolated demo | cfa4e21 | success | true | 8/54 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#213](https://github.com/safariarash7777-source/portfolio-platform/pull/213) | P00: isolated P01 and P03 integration candidate with separate Auth cookies | 65c215b | success | true | 0/60 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#191](https://github.com/safariarash7777-source/portfolio-platform/pull/191) | FOLLOWUP06: isolated PR185 feed and PR187 market acceptance on fixed PR186 | a83f71d | success | true | 3/131 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#186](https://github.com/safariarash7777-source/portfolio-platform/pull/186) | FOLLOWUP06: isolated limited integration of Auth, member home and resource fixes | be60bf5 | success | false | 25/757 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#170](https://github.com/safariarash7777-source/portfolio-platform/pull/170) | Guard Liara relay migration and encrypted owner-only inventory | 3587a97 | success | false | 0/5 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#165](https://github.com/safariarash7777-source/portfolio-platform/pull/165) | آماده‌سازی بکاپ ویندوز با ورود فقط رمز و حفظ محرمانگی خطای بازیابی | 599dfc3 | success | true | 0/5 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#160](https://github.com/safariarash7777-source/portfolio-platform/pull/160) | یکپارچه‌سازی بکاپ و لیارا، صحت داده، پرداخت، دارایی اعضا و پژوهش | 2afaab4 | success | false | 18/149 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#159](https://github.com/safariarash7777-source/portfolio-platform/pull/159) | بکاپ: مقصدِ بازگردانیِ ایزوله (بدونِ پورت) و سازگار با Auth/Storageِ Production — پذیرش روی Windows PowerShell 5.1 | 1a468ea | success | false | 0/18 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#158](https://github.com/safariarash7777-source/portfolio-platform/pull/158) | آماده‌سازیِ انتقال به Supabaseِ خودمیزبان روی سرورِ لیارا (بدون خرید، بدون تغییر Production) | a177e9a | success | false | 1/13 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#155](https://github.com/safariarash7777-source/portfolio-platform/pull/155) | بکاپ ویندوز: CR انتهای رشتهٔ اتصال، اتصال را خراب می‌کرد (B-057) | 01fc30e | success | true | 0/13 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#151](https://github.com/safariarash7777-source/portfolio-platform/pull/151) | دو نقص زیرساخت: دروازهٔ CI که اجرا نمی‌شد و symlink خودارجاع node_modules | 2f7585a | success | false | 1/4 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |

## گزارش و قرارداد/پذیرش

| PR | عنوان | head | CI مشاهده‌شده | mergeable | فایل برابر main / کل | اقدام |
|---|---|---|---|---|---|---|
| [#210](https://github.com/safariarash7777-source/portfolio-platform/pull/210) | docs: record isolated Liara acceptance and P00 baseline | a879636 | success | true | 0/80 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#203](https://github.com/safariarash7777-source/portfolio-platform/pull/203) | P11: measurement projections and scoped product acceptance evidence | 79efd8a | success | true | 0/49 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#201](https://github.com/safariarash7777-source/portfolio-platform/pull/201) | P09 wave 0: partner inventory and offline report reconciliation contract | 204c5e5 | success | true | 0/11 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#200](https://github.com/safariarash7777-source/portfolio-platform/pull/200) | P04: canonical holdings reuse, import mapping and acceptance gates | c25759d | success | true | 0/4 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#196](https://github.com/safariarash7777-source/portfolio-platform/pull/196) | IE01: independent frozen-input acceptance of fa4b84fd | 804a7f8 | success | true | 0/2 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#117](https://github.com/safariarash7777-source/portfolio-platform/pull/117) | docs: operating design for the market intelligence system | e1b1189 | success | false | 0/8 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |
| [#104](https://github.com/safariarash7777-source/portfolio-platform/pull/104) | audit: ممیزی تجربه عمومی دیده‌بانی بازار — ۹ مسیر (Draft) | 0eb9968 | success | false | 0/1 | نیازمند تعیین delta قابل استفاده نسبت به main؛ ادغام مستقیم تأیید نشده |

## اصلاحات بعد از snapshot

- PR240 با main تلفیق شد؛ تعارض دو سند با حفظ سوابق هر دو مسیر رفع شد. head موجودی بالا قبل از این اقدام است؛ head نهایی از PR خوانده شود.
- PR242 به `6cf2ce0` همگام شد؛ diff نسبت به main همان دو فایل رسید است. CI تازه پس از push باید جدا دیده شود؛ CI قدیمی به head جدید نسبت داده نشود.
- PR245/246 بسته و ادغام‌شده‌اند؛ در ۸۳ PR باز نیستند. Production READY روی main `4da7b39` و alias اصلی مستقلاً تطبیق داده شد.

## موجودی محلی محدود به دو ریشه شناخته‌شده پروژه

۶۸ checkout دارای .git و یک پوشه نمونه طراحی بدون .git مستقل مشاهده شد. ۱۳ checkout تغییر ثبت‌نشده داشتند. ۵۷ checkout upstream تنظیم‌شده نداشتند؛ این به معنی ارسال‌نشدن همه آن‌ها نیست (شاخه remote/PR باید تطبیق داده شود). داده به refs محلی همان checkout متکی است؛ برای همه checkoutها fetch اجرا نشده است. هیچ فایل یا شاخه‌ای پاک نشد.

| پوشه | شاخه | head | تغییر ثبت‌نشده | upstream |
|---|---|---|---|---|
| api-to-page-freshness-20261013 | codex/market-freshness-repair-20261017 | 246bd3a | 0 | تنظیم نشده |
| arash-design-lab | — | بدون Git مستقل | — | تنظیم نشده |
| codal-combined-review-20261013 | codex/codal-combined-review-20261013 | 1d0ba4a | 5 | تنظیم نشده |
| codal-coverage-pagination-20261013 | codex/codal-coverage-pagination-20261013 | 3d391ac | 2 | origin/main |
| codal-delivery-review-20261013 | codex/codal-delivery-review-20261013 | ec92770 | 30 | تنظیم نشده |
| codal-safe-diagnostics-20261014 | codex/codal-safe-diagnostics-20261014 | bce29a5 | 0 | تنظیم نشده |
| commodity-null-20261013 | codex/commodity-null-20261013 | 1c3b262 | 0 | origin/main |
| daily-fx-candidate-20261013 | codex/daily-fx-candidate-20261013 | a298ba7 | 0 | تنظیم نشده |
| ime-storage-audit-20261013 | codex/ime-retry-integration-20261013 | a4420eb | 0 | تنظیم نشده |
| portfolio-auth-direct-ip-incident | codex/incident-auth-direct-ip-20261002 | d8fc03f | 0 | تنظیم نشده |
| portfolio-auth-outage-patch | codex/auth-outage-classification-20261001 | a92e184 | 0 | تنظیم نشده |
| portfolio-balance-sheet | codex/customer-balance-sheet | 6787005 | 0 | تنظیم نشده |
| portfolio-followup-auth | codex/followup-auth-20261001 | bb4f2f3 | 0 | تنظیم نشده |
| portfolio-followup-owner | codex/followup-owner-login-20261001 | ca27b94 | 0 | تنظیم نشده |
| portfolio-followup06-acceptance | — | 2605a0f | 0 | تنظیم نشده |
| portfolio-followup06-feed-market | codex/followup06-feed-market-20261001 | a83f71d | 0 | تنظیم نشده |
| portfolio-followup06-integration | codex/followup06-integration-20261001 | ddd6716 | 30 | تنظیم نشده |
| portfolio-followup06-limited | codex/followup06-limited-20261001 | be60bf5 | 0 | تنظیم نشده |
| portfolio-frontend-existing | codex/frontend-existing-refinement-20261002 | e1c46e3 | 0 | تنظیم نشده |
| portfolio-frontend-visual | codex/frontend-visual-fonts-20261001 | f3a0e05 | 0 | تنظیم نشده |
| portfolio-ie01-independent-20261002 | — | e143fbb | 13 | تنظیم نشده |
| portfolio-ie01-offline | codex/ie01-independent-fa4b84fd-20261002 | 804a7f8 | 0 | تنظیم نشده |
| portfolio-isolated-e2e-pr228-20261013 | codex/isolated-e2e-pr228-20261013 | c62d026 | 0 | تنظیم نشده |
| portfolio-next-01 | codex/next-01-contract-20260930 | 1978bf5 | 1 | تنظیم نشده |
| portfolio-next-02 | codex/next-02-audit-20260930 | 1978bf5 | 1 | تنظیم نشده |
| portfolio-next-03 | codex/next-03-design-20260930 | 1978bf5 | 1 | تنظیم نشده |
| portfolio-next-04 | codex/next-04-core-20260930 | bb7c2f9 | 0 | تنظیم نشده |
| portfolio-next-05 | codex/next-05-public-20260930 | 27e59ad | 0 | تنظیم نشده |
| portfolio-next-05-before | — | f6cb560 | 0 | تنظیم نشده |
| portfolio-next-06 | codex/next-06-member-home-20261001 | a95aa0c | 0 | تنظیم نشده |
| portfolio-next-07 | codex/next-07-market-20260930 | 95cfa34 | 0 | تنظیم نشده |
| portfolio-next-08 | codex/next-08-desk-20260930 | d697635 | 0 | تنظیم نشده |
| portfolio-next04-resource-contract | codex/next04-resource-contract-20261001 | 51ad615 | 0 | تنظیم نشده |
| portfolio-next06-feed-clock-fix | codex/next06-feed-clock-fixture-20261002 | e83c382 | 0 | تنظیم نشده |
| portfolio-next06-publication-feed | codex/next06-publication-feed-20261001 | a54b161 | 0 | origin/codex/next06-publication-feed-20261001 |
| portfolio-next09 | codex/next09-contract-audit-20261002 | 712ff1c | 0 | تنظیم نشده |
| portfolio-p00-auth-next-20261002 | codex/p00-auth-next-20261002 | 2e44dc1 | 0 | تنظیم نشده |
| portfolio-p00-baseline-20261002 | codex/p00-baseline-20261002 | a879636 | 0 | تنظیم نشده |
| portfolio-p01-cookie-scope | codex/p01-cookie-scope-20261002 | 0465115 | 0 | تنظیم نشده |
| portfolio-p01-email-recovery | codex/p01-demo65-triage-20261002 | fd7ebe8 | 4 | تنظیم نشده |
| portfolio-p01-financial-auth | codex/p01-financial-auth-20261002 | ca2f3e2 | 0 | تنظیم نشده |
| portfolio-p01-login-deadline | codex/p01-login-deadline-20261002 | b2c2832 | 0 | تنظیم نشده |
| portfolio-p01-origin-harness | codex/p01-profile-read-20261003 | 0d15ed0 | 0 | تنظیم نشده |
| portfolio-p01-p03-candidate-20261002 | codex/p01-p03-candidate-20261002 | 65c215b | 0 | تنظیم نشده |
| portfolio-p01-recovery-20261003 | codex/p01-owner-recovery-20261009 | c89229e | 0 | تنظیم نشده |
| portfolio-p01-role-guard-20261006 | codex/p01-role-guard-20261006 | d4998e7 | 0 | تنظیم نشده |
| portfolio-p01-session-contract | codex/p01-session-contract-20261002 | f0e002b | 0 | تنظیم نشده |
| portfolio-p03-member-start | codex/p03-member-start-20261002 | bae3787 | 0 | تنظیم نشده |
| portfolio-p04-canonical-20261002 | codex/p04-investment-scope-20261002 | 1fcb3a1 | 0 | تنظیم نشده |
| portfolio-p04-recovery-20261003 | codex/p04-scope-retry-20261009 | ae1d15c | 4 | تنظیم نشده |
| portfolio-p07-desk | codex/p07-recovery-persistence-20261003 | c3d282e | 7 | تنظیم نشده |
| portfolio-p08-assistant | codex/p08-assistant-contract-20261002 | a83bc01 | 0 | تنظیم نشده |
| portfolio-p09-partners-20261002 | codex/p09-partner-contract-20261002 | 204c5e5 | 0 | تنظیم نشده |
| portfolio-p11-measurement | codex/p11-measurement-20261002 | 79efd8a | 0 | تنظیم نشده |
| portfolio-product-direction | codex/product-two-tracks | 042af79 | 18 | تنظیم نشده |
| portfolio-recovery-01-20261003 | codex/fmli-db-only-read-20261012 | be487e0 | 0 | تنظیم نشده |
| portfolio-reset02-member-entry-20261011 | codex/reset02-member-entry | 32049f3 | 0 | تنظیم نشده |
| portfolio-v1 | codex/product-v1-delivery | 15eebc9 | 7 | تنظیم نشده |
| portfolio-visible-finance-desk-20261002 | codex/p00-visible-finance-desk-20261002 | cfa4e21 | 0 | تنظیم نشده |
| portfolio-wave-02-base | codex/wave-02-base-20260930 | f6cb560 | 0 | تنظیم نشده |
| portfolio-wave-02-review | codex/wave-02-review-20260930 | 7cb030c | 0 | تنظیم نشده |
| telegram-next09 | codex/next09-bridge-20261001 | 26c885c | 0 | origin/codex/next09-bridge-20261001 |
| telegram-p05-portfolio-20261002 | codex/p05-portfolio-preview-20261002 | 1b024e0 | 0 | origin/codex/p05-portfolio-preview-20261002 |
| coordination-20261017 | codex/three-track-coordination-20261017 | 09579db | 0 | origin/codex/three-track-coordination-20261017 |
| desk-visual-preview-20261017 | codex/desk-visual-preview-20261017 | 29423db | 0 | origin/codex/desk-visual-preview-20261017 |
| lane-data-market-20261017 | codex/lane-data-market-20261017 | 3755898 | 0 | origin/codex/lane-data-market-20261017 |
| lane-member-webinar-20261017 | codex/lane-member-webinar-20261017 | aa9d6ec | 0 | origin/codex/lane-member-webinar-20261017 |
| lane-portfolio-research-20261017 | codex/lane-portfolio-research-20261017 | 63e144b | 0 | origin/codex/lane-portfolio-research-20261017 |
| responsive-qa | codex/responsive-qa-20261013 | b308432 | 0 | origin/main |
