-- ─────────────────────────────────────────────────────────────────────
-- فاز ۱۴ — «رصد بازار» (M4 + M5)
--
-- codal_feed:     متادیتای اطلاعیه‌های کدال (فید سراسری موتور v3) — append-only.
--                 هر چرخهٔ موتور، اطلاعیه‌های تازه را درج می‌کند (dedup با لینک).
-- index_history:  تاریخچهٔ روزانهٔ شاخص کل/هم‌وزن + ارزش/حجم بازار — append-only.
--                 روزی یک ردیف EOD از اسنپ‌شات؛ روز تعطیل درج نمی‌شود.
--
-- اجرا: یک‌بار در Supabase SQL Editor (پروژهٔ uooeygybrniptzdxuzhj).
-- پیش‌نیاز: fn_forbid_mutation از terminal_t0.sql.
-- ─────────────────────────────────────────────────────────────────────

-- ── ۱) فید کدال — append-only ────────────────────────────────────────
create table public.codal_feed (
  id            bigint generated always as identity primary key,
  symbol        text not null,                     -- نماد (l18)
  company_name  text,                              -- نام شرکت (l30)
  title         text not null,                     -- عنوان اطلاعیه
  report_code   text,                              -- کد گزارش (مثل ن-۱۰، ن-۳۰، ن-۴۵)
  category      text not null default 'سایر'
                check (category in ('ماهانه','صورت مالی','شفاف‌سازی','مجمع','سایر')),
  sent_date     text,                              -- تاریخ ارسال (جلالی، متن BrsApi)
  sent_time     text,                              -- ساعت ارسال
  publish_date  text,                              -- تاریخ انتشار (جلالی)
  link          text not null unique,              -- صفحهٔ اطلاعیه در codal.ir (کلید dedup)
  link_pdf      text,
  link_excel    text,
  created_at    timestamptz not null default now()
);
comment on table public.codal_feed is
  'متادیتای اطلاعیه‌های کدال از فید سراسری موتور v3 (الگوی کدال۷۲۴). append-only؛ منبع صفحهٔ عمومی /codal.';

create trigger trg_codal_feed_immutable before update or delete on public.codal_feed
  for each statement execute function public.fn_forbid_mutation();
create trigger trg_codal_feed_no_truncate before truncate on public.codal_feed
  for each statement execute function public.fn_forbid_mutation();

alter table public.codal_feed enable row level security;
create policy "public read codal_feed"
  on public.codal_feed for select to anon, authenticated using (true);

create index idx_codal_feed_created on public.codal_feed (created_at desc);
create index idx_codal_feed_symbol on public.codal_feed (symbol);
create index idx_codal_feed_category on public.codal_feed (category);

-- ── ۲) تاریخچهٔ شاخص — append-only ───────────────────────────────────
create table public.index_history (
  id                  bigint generated always as identity primary key,
  jdate               text not null unique,        -- تاریخ جلالی (مثل ۱۴۰۵/۰۴/۲۷ — همان قالب اسنپ‌شات)
  total_index         numeric not null,            -- شاخص کل
  total_change        numeric,                     -- تغییر شاخص کل (واحد)
  equal_weight_index  numeric,                     -- شاخص هم‌وزن
  equal_weight_change numeric,                     -- تغییر هم‌وزن (واحد)
  market_value        numeric,                     -- ارزش بازار
  trade_value         numeric,                     -- ارزش معاملات روز
  trade_volume        numeric,                     -- حجم معاملات روز
  trades              numeric,                     -- تعداد معاملات
  source              text not null default 'relay_eod',
  created_at          timestamptz not null default now()
);
comment on table public.index_history is
  'روزی یک ردیف EOD شاخص کل/هم‌وزن + ارزش و حجم بازار از اسنپ‌شات رله. append-only؛ روز تعطیل درج نمی‌شود.';

create trigger trg_index_history_immutable before update or delete on public.index_history
  for each statement execute function public.fn_forbid_mutation();
create trigger trg_index_history_no_truncate before truncate on public.index_history
  for each statement execute function public.fn_forbid_mutation();

alter table public.index_history enable row level security;
create policy "public read index_history"
  on public.index_history for select to anon, authenticated using (true);

create index idx_index_history_jdate on public.index_history (jdate desc);
