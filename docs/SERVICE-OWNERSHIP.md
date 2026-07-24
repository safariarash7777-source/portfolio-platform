# مالکیتِ سرویس‌ها (Service Ownership)

> نامِ انسانِ ناشناخته جعل نشده. جایی که مالکِ مشخص نبود، `OWNER_UNASSIGNED`.
> مالکِ حسابِ همهٔ زیرساخت‌ها: **آرش صفری** (GitHub: `safariarash7777-source`) — تأییدشده via `get_me`.

| حوزه | مالکِ حساب/تصمیم | مجریِ عملیاتی | یادداشت |
|---|---|---|---|
| **Portfolio (Vercel)** | آرش صفری | آرش + ایجنت‌های Claude | حسابِ Vercel متعلق به آرش؛ راستی‌آزماییِ مستقیمِ حساب در این سشن انجام نشد |
| **Supabase (DB/Auth)** | آرش صفری | آرش + ایجنت‌ها | سازمان `foglnmjnfppaiqdbbgof`؛ تنها پروژه `uooeygybrniptzdxuzhj` |
| **Relay (Liara)** | آرش صفری | آرش (کلیدها/دیپلوی) | app `arsadata`؛ توکنِ Liara دستِ آرش |
| **Mini App (Manus Legacy)** | آرش صفری | آرش | نسخهٔ زنده؛ برنامهٔ مهاجرت به Docker/Coolify (ADR-001) |
| **Mini App (هدف Docker/Coolify/VPS)** | آرش صفری | `OWNER_UNASSIGNED` (VPS هنوز نیست) | بر مبنای PR #2 |
| **Scheduler** | Vercel Cron (منبعِ اصلی) + Relay (مستقل) | آرش | ADR-002 |
| **Deployment** | آرش صفری | آرش + ایجنت‌ها (با اجازهٔ صریح) | push/PR/deploy فقط با okِ آرش |
| **Database migrations** | آرش صفری | ایجنت (پیشنهاد) → آرش (تأیید) | اجرا فقط با تأیید؛ MIGRATION-LEDGER |
| **Domain / DNS** | آرش صفری | `OWNER_UNASSIGNED` (جزئیاتِ DNS راستی‌آزمایی‌نشده) | خارج از دامنهٔ P1-001 |

> اصلِ حاکم: **یک مالکِ واحد در هر لحظه** برای هر منبعِ درحالِ ویرایش (به‌ویژه وقتی دو ایجنت هم‌زمان کار می‌کنند — ONBOARDING §۱۲).
