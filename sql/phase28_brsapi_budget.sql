-- =============================================================================
-- phase28 — بودجهٔ روزانهٔ BrsApi، ماندگار و مشترک (`P2-RELAY-BUDGET-001`)
--
-- ── مسئله‌ای که حل می‌کند ───────────────────────────────────────────────────
-- `DailyBudget` در `relay/brsapi-client.mjs` شمارنده را **در حافظه** نگه می‌دارد.
-- این یعنی هر restart — دیپلوی، کرشِ فرایند، جابه‌جاییِ کانتینر — شمارنده را
-- صفر می‌کند. رله‌ای که روزی سه بار دیپلوی شود، سه بار بودجهٔ کاملِ روز را از
-- نو می‌گیرد و سقفِ ۹۰۰۰ عملاً می‌شود ۲۷۰۰۰. یعنی سقف **وجود دارد ولی کار
-- نمی‌کند** — بدترین حالت، چون هم ادعای کنترل داریم هم کنترل نداریم.
--
-- همین ساختار مسئلهٔ دومی را هم می‌بندد: اگر روزی بیش از یک replica بالا
-- بیاید، شمارندهٔ درون‌حافظه‌ای هر replica سقفِ خودش را دارد و جمعشان از سهمیه
-- رد می‌شود. شمارندهٔ مشترکِ دیتابیس هر دو را با یک مکانیزم می‌بندد.
--
-- ── چرا «اجاره» (lease) و نه یک شمارندهٔ ساده ───────────────────────────────
-- رزروِ بودجه در کلاینت **همگام** است: بینِ «بررسی سقف» و «ارسالِ درخواست»
-- هیچ `await`ی نیست، وگرنه چند کارِ هم‌زمان می‌توانند از سقف رد شوند. یک
-- round-tripِ دیتابیس به‌ازای هر درخواست این خاصیت را از بین می‌برد.
--
-- پس کلاینت **بلوکی** از واحدها را یک‌جا و اتمیک اجاره می‌کند و بعد آن بلوک را
-- محلی و همگام خرج می‌کند. نتیجه:
--   • سقفِ سخت **سراسری** تضمین می‌شود — چون جمعِ همهٔ اجاره‌ها از `p_hard`
--     رد نمی‌شود، و این در همین تابع سریالایز شده است.
--   • restart سهمیه را صفر نمی‌کند — اجارهٔ خرج‌نشده **سوخته** حساب می‌شود.
--   • خطا همیشه در جهتِ **کم‌مصرفی** است، نه پرمصرفی. حداکثر اتلاف به‌ازای هر
--     restart برابرِ اندازهٔ یک بلوک است (پیش‌فرض ۵۰ از ۹۰۰۰، یعنی ≤۰٫۶٪).
--
-- برای اینکه همان ≤۰٫۶٪ هم سوخت نشود، کلاینت روی خاموشیِ مرتب (`SIGTERM`)
-- باقیِ اجاره را با `brsapi_budget_release` پس می‌دهد. این **بهترین‌کوشش** است،
-- نه تضمین؛ اگر فرایند کشته شود پس‌دادنی در کار نیست و همان ≤۰٫۶٪ می‌سوزد.
--
-- ── چرا کلیدِ روز متن است، نه `date` ────────────────────────────────────────
-- مرزِ روزِ سهمیه را **تأمین‌کننده** تعیین می‌کند، نه Postgres. کلاینت کلیدِ روز
-- را با `tehranDayKey` می‌سازد و همان رشته را می‌فرستد. اگر روزی معلوم شود
-- مرزِ واقعیِ BrsApi نیمه‌شبِ تهران نیست، **فقط یک تابعِ JS** عوض می‌شود و این
-- جدول دست‌نخورده می‌ماند. اگر ستون `date` بود، منطقِ منطقه‌زمانی در دو جا
-- پخش می‌شد و روزی از هم واگرا می‌شدند.
--
-- ⚠️ مرزِ واقعیِ ریستِ سهمیه هنوز **از قراردادِ تأمین‌کننده تأیید نشده است**
--    (`docs/ops/D-026-supplier-question.md` — همان نامه، پرسشِ سهمیه). تا آن
--    پاسخ، نیمه‌شبِ تهران یک **فرضِ محافظه‌کارانهٔ اعلام‌شده** است، نه واقعیتِ
--    تأییدشده. اگر مرزِ واقعی دیرتر باشد، این فرض زودتر ریست می‌کند و ممکن است
--    در پنجرهٔ همپوشانی بیش از سهمیه خرج شود — به همین دلیل سقفِ سخت ۹۰۰۰ است،
--    نه ۱۰۰۰۰: همان ۱۰۰۰ واحد حاشیه پوششِ همین عدمِ‌قطعیت است.
--
-- ── دامنه ──────────────────────────────────────────────────────────────────
-- افزایشی. یک جدولِ تازه و دو تابع. هیچ جدول/ستون/سیاستِ موجودی عوض نمی‌شود.
-- این جدول **append-only نیست** و نباید باشد: یک شمارندهٔ عملیاتی است، نه
-- دادهٔ بازار. ممنوعیتِ UPDATE/DELETE فقط برای `codal_reports` و
-- `symbol_history` است.
-- =============================================================================

-- ── جدولِ شمارنده ───────────────────────────────────────────────────────────
create table if not exists public.brsapi_budget_days (
  day_key       text        primary key,
  leased        integer     not null default 0,
  hard_ceiling  integer     not null,
  lease_calls   integer     not null default 0,
  released      integer     not null default 0,
  first_lease_at timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- اجاره هرگز منفی نمی‌شود و هرگز از سقفِ همان روز رد نمی‌شود. اگر روزی
  -- کدی این را نقض کند، اینجا می‌شکند نه در صورت‌حسابِ تأمین‌کننده.
  constraint brsapi_budget_leased_sane   check (leased >= 0 and leased <= hard_ceiling),
  constraint brsapi_budget_released_sane check (released >= 0),
  constraint brsapi_budget_ceiling_sane  check (hard_ceiling > 0)
);

comment on table public.brsapi_budget_days is
  'شمارندهٔ مشترکِ مصرفِ روزانهٔ BrsApi. `leased` = واحدهایی که به فرایندها داده شده (محافظه‌کارانه «خرج‌شده» حساب می‌شود).';

alter table public.brsapi_budget_days enable row level security;
alter table public.brsapi_budget_days force row level security;

-- هیچ policyای تعریف نمی‌شود: این جدول فقط از مسیرِ service-role و از طریقِ
-- همین دو تابع دیده می‌شود. کاربرِ عادی نه می‌خواند نه می‌نویسد. `FORCE` هم
-- هست تا حتی مالکِ جدول از policy معاف نشود.

-- ── اجارهٔ یک بلوک ──────────────────────────────────────────────────────────
-- ورودی:  کلیدِ روز · تعدادِ درخواستی · سقفِ سختِ آن روز
-- خروجی:  چند واحد واقعاً داده شد · قبلش چقدر اجاره رفته بود · سقف
--
-- `granted` می‌تواند از `p_want` کمتر باشد (وقتی به سقف نزدیکیم) و می‌تواند
-- **صفر** باشد (وقتی سقف پر شده). صفر یعنی «امروز دیگر نه» — نه خطا.
create or replace function public.brsapi_budget_lease(
  p_day   text,
  p_want  integer,
  p_hard  integer
)
returns table (granted integer, leased_before integer, hard_ceiling integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before integer;
  v_hard   integer;
  v_grant  integer;
begin
  if p_day is null or btrim(p_day) = '' then
    raise exception 'brsapi_budget_lease: کلیدِ روز خالی است' using errcode = 'BRSB1';
  end if;
  if p_want is null or p_want <= 0 then
    raise exception 'brsapi_budget_lease: تعدادِ درخواستی باید مثبت باشد' using errcode = 'BRSB2';
  end if;
  if p_hard is null or p_hard <= 0 then
    raise exception 'brsapi_budget_lease: سقفِ سخت باید مثبت باشد' using errcode = 'BRSB3';
  end if;

  -- ردیفِ روز را بساز اگر نیست. `on conflict do nothing` یعنی دو فرایند که
  -- هم‌زمان اولین درخواستِ روز را می‌دهند، دو ردیف نمی‌سازند.
  insert into public.brsapi_budget_days (day_key, leased, hard_ceiling)
  values (p_day, 0, p_hard)
  on conflict (day_key) do nothing;

  -- قفلِ ردیف. از اینجا تا `commit`، هیچ فرایندِ دیگری این روز را نمی‌خواند.
  -- این همان چیزی است که «جمعِ اجاره‌ها از سقف رد نمی‌شود» را تضمین می‌کند.
  select b.leased, b.hard_ceiling into v_before, v_hard
    from public.brsapi_budget_days b
   where b.day_key = p_day
     for update;

  -- سقفِ ثبت‌شدهٔ روز مرجع است، نه سقفی که این فرایند ادعا می‌کند. اگر یک
  -- replica با پیکربندیِ سخاوتمندانه‌تر بالا بیاید، نمی‌تواند سقفِ روز را
  -- وسطِ روز بالا ببرد. فقط **سخت‌گیرانه‌تر** پذیرفته می‌شود.
  if p_hard < v_hard then
    update public.brsapi_budget_days
       set hard_ceiling = p_hard, updated_at = now()
     where day_key = p_day;
    v_hard := p_hard;
  end if;

  v_grant := least(p_want, greatest(0, v_hard - v_before));

  if v_grant > 0 then
    update public.brsapi_budget_days
       set leased      = v_before + v_grant,
           lease_calls = lease_calls + 1,
           updated_at  = now()
     where day_key = p_day;
  end if;

  granted       := v_grant;
  leased_before := v_before;
  hard_ceiling  := v_hard;
  return next;
end;
$$;

revoke all on function public.brsapi_budget_lease(text, integer, integer) from public;
revoke all on function public.brsapi_budget_lease(text, integer, integer) from anon, authenticated;

comment on function public.brsapi_budget_lease(text, integer, integer) is
  'یک بلوکِ بودجه اجاره می‌دهد. اتمیک و سریالایز‌شده؛ جمعِ اجاره‌ها هرگز از سقفِ روز رد نمی‌شود.';

-- ── پس‌دادنِ اجارهٔ خرج‌نشده ─────────────────────────────────────────────────
-- فقط روی خاموشیِ مرتب صدا زده می‌شود. اگر صدا زده نشود، هیچ‌چیز خراب نمی‌شود؛
-- فقط آن بلوک تا پایانِ روز سوخته می‌ماند. یعنی **نبودنش ایمن است** — که برای
-- چیزی که روی مسیرِ خاموشی است شرطِ لازم است.
create or replace function public.brsapi_budget_release(
  p_day  text,
  p_back integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before integer;
  v_back   integer;
begin
  if p_day is null or btrim(p_day) = '' then
    raise exception 'brsapi_budget_release: کلیدِ روز خالی است' using errcode = 'BRSB1';
  end if;
  if p_back is null or p_back <= 0 then
    return 0;   -- «چیزی برای پس‌دادن نبود» یک حالتِ عادی است، نه خطا.
  end if;

  select b.leased into v_before
    from public.brsapi_budget_days b
   where b.day_key = p_day
     for update;

  if v_before is null then
    return 0;   -- روزی که ردیف ندارد، اجاره‌ای هم نداده.
  end if;

  -- هرگز بیش از آنچه اجاره رفته پس گرفته نمی‌شود. بدونِ این، یک فراخوانیِ
  -- اشتباه می‌توانست شمارنده را منفی و بی‌معنا کند.
  v_back := least(p_back, v_before);

  update public.brsapi_budget_days
     set leased     = v_before - v_back,
         released   = released + v_back,
         updated_at = now()
   where day_key = p_day;

  return v_back;
end;
$$;

revoke all on function public.brsapi_budget_release(text, integer) from public;
revoke all on function public.brsapi_budget_release(text, integer) from anon, authenticated;

comment on function public.brsapi_budget_release(text, integer) is
  'اجارهٔ خرج‌نشده را روی خاموشیِ مرتب پس می‌دهد. بهترین‌کوشش؛ نبودنش ایمن است.';
