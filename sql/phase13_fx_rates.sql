-- ─────────────────────────────────────────────────────────────────────
-- فاز ۱۳ — نرخ دلار روزانه (fx_rates) برای نمای دلاری چارت‌های بنیادی (T6)
--
-- fx_rates: روزی یک رکورد نرخ دلار بازار آزاد (تومان). append-only —
-- طبق الگوی جداول موجود (terminal_t0 / phase12): ویرایش/حذف/ترانکیت ممنوع.
-- منبع: رلهٔ بازار (BrsApi، id=USD) — درج روزانه پس از ساعت بازار.
--
-- اجرا: یک‌بار در Supabase SQL Editor (پروژهٔ uooeygybrniptzdxuzhj).
-- پیش‌نیاز: fn_forbid_mutation از terminal_t0.sql.
-- ─────────────────────────────────────────────────────────────────────

-- ── ۱) جدول نرخ دلار — append-only ───────────────────────────────────
create table public.fx_rates (
  id          bigint generated always as identity primary key,
  rate_date   date not null unique,              -- تاریخ میلادی (تقویم تهران)
  usd_toman   numeric not null check (usd_toman > 0),
  source      text not null default 'brsapi',    -- منبع نرخ (شفافیت روش‌شناسی)
  created_at  timestamptz not null default now()
);

comment on table public.fx_rates is
  'نرخ روزانهٔ دلار بازار آزاد (تومان) — منبع رلهٔ بازار. append-only؛ برای نمای دلاری چارت‌های بنیادی.';

-- ── ۲) تریگرهای append-only (ویرایش/حذف/ترانکیت ممنوع) ──────────────
create trigger trg_fx_rates_immutable before update or delete on public.fx_rates
  for each statement execute function public.fn_forbid_mutation();
create trigger trg_fx_rates_no_truncate before truncate on public.fx_rates
  for each statement execute function public.fn_forbid_mutation();

-- ── ۳) RLS: خواندن عمومی؛ نوشتن فقط service_role (بدون policy درج) ───
alter table public.fx_rates enable row level security;
create policy "public read fx_rates"
  on public.fx_rates for select to anon, authenticated using (true);

-- ── ۴) ایندکس بازهٔ تاریخ برای کوئری سری زمانی ───────────────────────
create index idx_fx_rates_date on public.fx_rates (rate_date desc);
