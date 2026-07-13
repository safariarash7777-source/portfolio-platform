-- تاریخچهٔ بازارِ ایران (append-only) — برای نمودارِ روندِ NAV/بازده صندوق‌ها و سهام.
--
-- رله هر ۳۰ دقیقه یک نمونه insert می‌کند (جدا از upsert تک‌ردیفهٔ latest).
-- هیچ UPDATE/DELETE تعریف نمی‌شود — فقط INSERT با service_role.
-- خواندنِ عمومی: دادهٔ قیمت بازار عمومی است.

create table if not exists public.ir_market_history (
  id bigint generated always as identity primary key,
  captured_at timestamptz not null default now(),
  section text not null check (section in ('gold','currency','funds','stocks')),
  payload jsonb not null
);

comment on table public.ir_market_history is
  'تاریخچهٔ قیمتِ بازارِ ایران (append-only)؛ هر ۳۰ دقیقه یک نمونه. برای نمودارِ روند.';

-- ایندکس برای کوئری‌های section + زمان
create index if not exists idx_ir_market_history_section_time
  on public.ir_market_history (section, captured_at desc);

alter table public.ir_market_history enable row level security;

-- خواندنِ عمومی
drop policy if exists "ir_market_history_public_read" on public.ir_market_history;
create policy "ir_market_history_public_read"
  on public.ir_market_history for select
  to anon, authenticated
  using (true);

-- نوشتن: فقط service_role (رله) — هیچ policy INSERT/UPDATE/DELETE برای anon/authenticated.
