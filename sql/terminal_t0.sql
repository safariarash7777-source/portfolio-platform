-- ═══════════════════════════════════════════════════════════════════
-- T0 — بنیان دادهٔ «ترمینال بازار» (docs/ROADMAP-TERMINAL.md نسخهٔ ۲)
-- اعمال‌شده روی Supabase به‌عنوان مهاجرت terminal_t0_market_data_and_immutable_signals
-- اصول: append-only، تریگر ضد UPDATE/DELETE/TRUNCATE، هش زنجیره‌ای روی
-- سیگنال‌ها، first-print برای آمار رسمی. نوشتن فقط با service_role
-- (رله/ورکر)؛ خواندنِ دادهٔ بازار و کارنامه عمومی است.
-- ═══════════════════════════════════════════════════════════════════

-- ── توابع مشترک ────────────────────────────────────────────────────

-- append-only: هر UPDATE/DELETE/TRUNCATE با خطا متوقف می‌شود
create or replace function public.fn_forbid_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'جدول % append-only است — ویرایش/حذف/خالی‌کردن ممنوع (اصل §2 نقشهٔ ترمینال)', tg_table_name
    using errcode = 'P0001';
end $$;

-- ── ۱) تاریخچهٔ نماد (Tsetmc از رله) ────────────────────────────────
create table public.symbol_history (
  id                    bigint generated always as identity primary key,
  symbol                text not null,
  isin                  text,
  trade_date            date not null,
  captured_at           timestamptz not null default now(),
  open                  numeric,
  high                  numeric,
  low                   numeric,
  close                 numeric,
  last_price            numeric,
  volume                numeric,
  value_traded          numeric,
  individual_buy_value  numeric,
  individual_sell_value numeric,
  individual_buy_count  integer,
  individual_sell_count integer,
  legal_buy_value       numeric,
  legal_sell_value      numeric,
  buyer_power           numeric,
  raw                   jsonb,
  source                text not null default 'brsapi'
);
comment on table public.symbol_history is
  'تاریخچهٔ روزانهٔ هر نماد (OHLCV + پول حقیقی/حقوقی). append-only؛ رله می‌نویسد. فیلدهای دقیق بعد از اتصال BrsApi از مستندات نگاشت می‌شود؛ raw نگهدارِ پاسخ خام.';
create index idx_symbol_history_symbol_date on public.symbol_history (symbol, trade_date desc);
create index idx_symbol_history_captured on public.symbol_history (captured_at desc);

-- ── ۲) گزارش‌های کدال ───────────────────────────────────────────────
create table public.codal_reports (
  id           bigint generated always as identity primary key,
  symbol       text,
  company_name text,
  report_kind  text not null default 'other',
  period_end   date,
  title        text,
  source_url   text not null unique,
  published_at timestamptz,
  data         jsonb,
  raw          jsonb,
  captured_at  timestamptz not null default now()
);
comment on table public.codal_reports is
  'گزارش‌های کدال (فروش ماهانه، صورت مالی، افزایش سرمایه، …). append-only؛ dedup با source_url. ورودی ماژول I1.';
create index idx_codal_reports_symbol on public.codal_reports (symbol, published_at desc);

-- ── ۳) بورس کالا (IME) ──────────────────────────────────────────────
create table public.ime_snapshots (
  id          bigint generated always as identity primary key,
  category    text not null,
  captured_at timestamptz not null default now(),
  data        jsonb not null
);
comment on table public.ime_snapshots is
  'اسنپ‌شات‌های بورس کالا (فیزیکی/گواهی سپرده/صندوق کالایی/آتی/آپشن). append-only؛ رله می‌نویسد.';
create index idx_ime_snapshots_cat on public.ime_snapshots (category, captured_at desc);

-- ── ۴) آمار رسمی first-print + جدول جانبی اصلاحیه‌ها (ضد look-ahead)
create table public.macro_first_print (
  id           bigint generated always as identity primary key,
  series       text not null,
  period       text not null,
  value        numeric not null,
  unit         text,
  source       text not null,
  published_at timestamptz not null,
  captured_at  timestamptz not null default now(),
  unique (series, period, source)
);
comment on table public.macro_first_print is
  'اولین انتشارِ هر آمار رسمی (تورم و …) — write-once؛ تحلیل‌ها فقط از این جدول می‌خوانند (ضد look-ahead).';

create table public.macro_revisions (
  id           bigint generated always as identity primary key,
  series       text not null,
  period       text not null,
  value        numeric not null,
  unit         text,
  source       text not null,
  published_at timestamptz not null,
  captured_at  timestamptz not null default now()
);
comment on table public.macro_revisions is
  'نسخه‌های اصلاح‌شدهٔ آمار رسمی — فقط برای post-mortem؛ هرگز ورودی تحلیل زنده نیست.';

-- ── ۵) پیش‌نویس سیگنال (تنها جدول قابل‌ویرایش چرخهٔ سیگنال) ─────────
create table public.signal_drafts (
  id              uuid primary key default gen_random_uuid(),
  symbol          text not null,
  direction       text not null check (direction in ('buy','sell')),
  suggested_price numeric,
  reasons         jsonb not null default '[]'::jsonb,
  scores          jsonb,
  status          text not null default 'pending' check (status in ('pending','approved','rejected')),
  source          text not null default 'engine',
  review_note     text,
  reviewed_by     uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.signal_drafts is
  'پیش‌نویس سیگنال از موتور هوش؛ فقط ادمین می‌بیند و تأیید/رد می‌کند. انتشار = درج در signals (تغییرناپذیر).';

-- ── ۶) سیگنال‌های منتشرشده — تغییرناپذیر + هش زنجیره‌ای ─────────────
create table public.signals (
  id           uuid not null default gen_random_uuid() unique,
  seq          bigint generated always as identity primary key,
  draft_id     uuid references public.signal_drafts (id),
  symbol       text not null,
  direction    text not null check (direction in ('buy','sell')),
  entry_price  numeric,
  entry_date   date not null default current_date,
  horizon      text,
  reasons      jsonb not null default '[]'::jsonb,
  scores       jsonb,
  approved_by  uuid,
  published_at timestamptz not null default now(),
  prev_hash    text not null,
  record_hash  text not null unique
);
comment on table public.signals is
  'سیگنال‌های منتشرشده (پس از تأیید انسانی). append-only + هش زنجیره‌ای — کارنامهٔ عمومی و غیرقابل‌دستکاری.';

create or replace function public.fn_signals_hash_chain()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare prev text;
begin
  -- سریال‌سازی درج‌ها تا زنجیره نشکند
  perform pg_advisory_xact_lock(hashtext('public.signals_chain'));
  select record_hash into prev from public.signals order by seq desc limit 1;
  new.prev_hash   := coalesce(prev, 'GENESIS');
  new.published_at := coalesce(new.published_at, now());
  new.record_hash := encode(extensions.digest(convert_to(
      new.prev_hash || '|' || new.symbol || '|' || new.direction || '|' ||
      coalesce(new.entry_price::text, '') || '|' || new.entry_date::text || '|' ||
      new.reasons::text || '|' || new.published_at::text, 'utf8'), 'sha256'), 'hex');
  return new;
end $$;

create trigger trg_signals_hash_chain
  before insert on public.signals
  for each row execute function public.fn_signals_hash_chain();

-- ── ۷) نتیجهٔ سیگنال — تغییرناپذیر + هش زنجیره‌ای ───────────────────
create table public.signal_outcomes (
  id          uuid not null default gen_random_uuid() unique,
  seq         bigint generated always as identity primary key,
  signal_id   uuid not null references public.signals (id),
  exit_price  numeric,
  exit_date   date not null default current_date,
  outcome     text not null check (outcome in ('target','stop','manual_close','expired')),
  note        text,
  closed_at   timestamptz not null default now(),
  prev_hash   text not null,
  record_hash text not null unique
);
comment on table public.signal_outcomes is
  'بستن سیگنال و نتیجهٔ واقعی (برد و باخت، هر دو). append-only + هش زنجیره‌ای — هرگز ویرایش نمی‌شود.';

create or replace function public.fn_signal_outcomes_hash_chain()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare prev text;
begin
  perform pg_advisory_xact_lock(hashtext('public.signal_outcomes_chain'));
  select record_hash into prev from public.signal_outcomes order by seq desc limit 1;
  new.prev_hash  := coalesce(prev, 'GENESIS');
  new.closed_at  := coalesce(new.closed_at, now());
  new.record_hash := encode(extensions.digest(convert_to(
      new.prev_hash || '|' || new.signal_id::text || '|' ||
      coalesce(new.exit_price::text, '') || '|' || new.exit_date::text || '|' ||
      new.outcome || '|' || new.closed_at::text, 'utf8'), 'sha256'), 'hex');
  return new;
end $$;

create trigger trg_signal_outcomes_hash_chain
  before insert on public.signal_outcomes
  for each row execute function public.fn_signal_outcomes_hash_chain();

-- ── ۸) فیلترهای ذخیره‌شدهٔ کاربر (دیده‌بان) ─────────────────────────
create table public.screener_presets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  config     jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.screener_presets is 'فیلترهای ترکیبیِ ذخیره‌شدهٔ هر کاربر در دیده‌بان.';
create index idx_screener_presets_user on public.screener_presets (user_id);

-- ── تریگرهای append-only ────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['symbol_history','codal_reports','ime_snapshots',
                           'macro_first_print','macro_revisions','signals','signal_outcomes']
  loop
    execute format('create trigger trg_%s_immutable before update or delete on public.%I
                    for each statement execute function public.fn_forbid_mutation()', t, t);
    execute format('create trigger trg_%s_no_truncate before truncate on public.%I
                    for each statement execute function public.fn_forbid_mutation()', t, t);
  end loop;
end $$;

-- ── RLS ─────────────────────────────────────────────────────────────
alter table public.symbol_history    enable row level security;
alter table public.codal_reports     enable row level security;
alter table public.ime_snapshots     enable row level security;
alter table public.macro_first_print enable row level security;
alter table public.macro_revisions   enable row level security;
alter table public.signal_drafts     enable row level security;
alter table public.signals           enable row level security;
alter table public.signal_outcomes   enable row level security;
alter table public.screener_presets  enable row level security;

-- دادهٔ بازار و کارنامه: خواندن عمومی؛ نوشتن فقط service_role (بدون policy درج)
create policy "public read symbol_history"    on public.symbol_history    for select to anon, authenticated using (true);
create policy "public read codal_reports"     on public.codal_reports     for select to anon, authenticated using (true);
create policy "public read ime_snapshots"     on public.ime_snapshots     for select to anon, authenticated using (true);
create policy "public read macro_first_print" on public.macro_first_print for select to anon, authenticated using (true);
create policy "public read signals"           on public.signals           for select to anon, authenticated using (true);
create policy "public read signal_outcomes"   on public.signal_outcomes   for select to anon, authenticated using (true);

-- اصلاحیه‌های آمار: فقط ادمین می‌بیند (ورودی تحلیل نیست)
create policy "admin read macro_revisions" on public.macro_revisions for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- پیش‌نویس سیگنال: فقط ادمین
create policy "admin select signal_drafts" on public.signal_drafts for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "admin insert signal_drafts" on public.signal_drafts for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "admin update signal_drafts" on public.signal_drafts for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- فیلترهای کاربر: مالک همه‌کاره
create policy "own screener_presets select" on public.screener_presets for select to authenticated using (user_id = auth.uid());
create policy "own screener_presets insert" on public.screener_presets for insert to authenticated with check (user_id = auth.uid());
create policy "own screener_presets update" on public.screener_presets for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own screener_presets delete" on public.screener_presets for delete to authenticated using (user_id = auth.uid());
