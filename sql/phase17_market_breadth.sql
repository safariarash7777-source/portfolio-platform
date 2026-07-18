-- ─────────────────────────────────────────────────────────────────────
-- فاز ۱۷ — جدول market_breadth برای داشبورد «امروز بازار»
--
-- market_breadth: تجمیع روزانهٔ پایان‌بازار از اسنپ‌شات موجود رله — append-only
--                 (الگوی index_history از فاز ۱۴). روزی یک ردیف؛ روز تعطیل درج نمی‌شود
--                 (jdate اسنپ‌شات همان آخرین روز معاملاتی می‌ماند و unique رد می‌کند).
--
-- منبع همهٔ ستون‌ها: فید AllSymbols موجود رله — صفر درخواست جدید به BrsApi.
--
-- اجرا: یک‌بار در Supabase SQL Editor (پروژهٔ uooeygybrniptzdxuzhj).
-- پیش‌نیاز: fn_forbid_mutation از terminal_t0.sql.
-- ─────────────────────────────────────────────────────────────────────

create table public.market_breadth (
  id                  bigint generated always as identity primary key,
  jdate               text not null unique,  -- تاریخ جلالی متن اسنپ‌شات (مثل «1405-04-27»)
  -- نبض بازار (مبنا: درصد تغییر قیمت پایانی سهام معامله‌شده)
  pos_count           integer,               -- شمار نمادهای مثبت (پایانی > +۰.۵٪)
  neg_count           integer,               -- شمار نمادهای منفی (پایانی < −۰.۵٪)
  flat_count          integer,               -- شمار نمادهای خنثی (±۰.۵٪)
  total_traded        integer,               -- کل نمادهای معامله‌شدهٔ روز (ارزش > ۰)
  -- صف‌ها (تعریف: بهترین تقاضا روی سقف دامنه و عرضهٔ صفر = صف خرید؛ برعکس = صف فروش؛
  --         ارزش صف = حجم سطر اول سفارش × قیمت همان سطر)
  buy_queue_count     integer,               -- شمار نمادهای در صف خرید
  sell_queue_count    integer,               -- شمار نمادهای در صف فروش
  buy_queue_value     numeric,               -- ارزش تقریبی صف‌های خرید (ریال)
  sell_queue_value    numeric,               -- ارزش تقریبی صف‌های فروش (ریال)
  -- جریان پول حقیقی (مبنا: حجم خرید/فروش حقیقی × قیمت پایانی)
  net_real_flow       numeric,               -- خالص خرید حقیقی کل بازار (ریال؛ منفی = خروج)
  per_capita_buy      numeric,               -- سرانهٔ خرید هر کد حقیقی (ریال)
  per_capita_sell     numeric,               -- سرانهٔ فروش هر کد حقیقی (ریال)
  -- ارزش معاملات
  trade_value         numeric,               -- ارزش کل معاملات سهام روز (ریال)
  source              text not null default 'relay_eod',
  created_at          timestamptz not null default now()
);

comment on table public.market_breadth is
  'تجمیع روزانهٔ پایان‌بازار (نبض بازار، صف‌ها، جریان پول حقیقی) از اسنپ‌شات رله. append-only؛ روزی یک ردیف؛ مقادیر پولی ریال.';

-- append-only: هیچ UPDATE/DELETE/TRUNCATE — همان الگوی index_history
create trigger trg_market_breadth_immutable before update or delete on public.market_breadth
  for each statement execute function public.fn_forbid_mutation();
create trigger trg_market_breadth_no_truncate before truncate on public.market_breadth
  for each statement execute function public.fn_forbid_mutation();

alter table public.market_breadth enable row level security;
create policy "public read market_breadth"
  on public.market_breadth for select to anon, authenticated using (true);

create index idx_market_breadth_jdate on public.market_breadth (jdate desc);

-- ── راستی‌آزمایی پس از اجرا (فقط SELECT — اختیاری) ────────────────────
-- select count(*) from public.market_breadth;                          -- انتظار: 0 (تا اولین EOD)
-- select * from public.market_breadth order by jdate desc limit 5;    -- بعد از اولین EOD: یک ردیف
