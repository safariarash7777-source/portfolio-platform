-- ─────────────────────────────────────────────────────────────────────────────
-- phase18: ستاره‌کردن پرست‌های غربالگر (T2-ج شناسنامهٔ تحلیلی)
-- اجرا: کلود — الگوی phase14/phase17 (Supabase SQL Editor، یک تراکنش)
--
-- هدف: کاربر بتواند هم پرست‌های ذخیره‌شدهٔ خودش و هم پرست‌های سیستمی
-- (به کلید ثابت مثل bullish_guard) را ستاره کند تا در تب «منتخب» اول بیایند.
--
-- طراحی:
--   1) ستون starred روی screener_presets (پرست‌های ذخیره‌شدهٔ کاربر).
--   2) جدول کوچک screener_starred برای ستارهٔ پرست‌های «سیستمی» به‌ازای کاربر
--      (کلید متنی پرست سیستمی؛ بدون تکرار per user).
-- هیچ UPDATE روی داده‌های موجود؛ فقط DDL افزایشی.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ۱) ستون ستاره روی پرست‌های ذخیره‌شدهٔ کاربر
alter table public.screener_presets
  add column if not exists starred boolean not null default false;

comment on column public.screener_presets.starred is
  'ستاره‌شده توسط مالک — در تب «منتخب» غربالگر اول نمایش داده می‌شود.';

-- ۲) ستارهٔ پرست‌های سیستمی (کلید ثابت کد، بدون ردیف پرست)
create table if not exists public.screener_starred (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  preset_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, preset_key)
);

comment on table public.screener_starred is
  'ستارهٔ پرست‌های سیستمی غربالگر به‌ازای کاربر (T2-ج). کلید = key ثابت در lib/core/screener.ts یا fundamentalPresets.ts';

alter table public.screener_starred enable row level security;

-- RLS: هر کاربر فقط ردیف‌های خودش
create policy "screener_starred_select_own"
  on public.screener_starred for select
  using (auth.uid() = user_id);

create policy "screener_starred_insert_own"
  on public.screener_starred for insert
  with check (auth.uid() = user_id);

create policy "screener_starred_delete_own"
  on public.screener_starred for delete
  using (auth.uid() = user_id);

commit;

-- ── راستی‌آزمایی پس از اجرا (دستی) ──────────────────────────────────────────
-- select column_name from information_schema.columns
--   where table_name = 'screener_presets' and column_name = 'starred';
-- select count(*) from public.screener_starred;  -- انتظار: 0
