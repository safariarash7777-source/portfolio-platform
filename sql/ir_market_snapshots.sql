-- جدولِ اسنپ‌شاتِ بازارِ ایران (پُلِ عبور از قطعیِ اینترنتِ بین‌الملل).
--
-- چرا: سرورِ Vercel (خارج) نمی‌تواند زنده به رلهٔ داخل ایران وصل شود. پس رله
-- بعد از هر رفرش، اسنپ‌شاتِ قیمت‌ها را با کلیدِ سرویس‌رول به این جدول upsert می‌کند
-- (key='latest')، و سایت با کلیدِ anon از آن می‌خواند. Supabase از همه‌جای دنیا
-- در دسترس است، پس سایت به اتصالِ لحظه‌ایِ ایران↔خارج وابسته نیست.
--
-- امنیت: RLS روشن؛ خواندنِ عمومی (قیمت‌ها عمومی‌اند)، نوشتن فقط با service_role.
-- هیچ دادهٔ کاربری اینجا نیست — فقط قیمتِ بازار.

create table if not exists public.ir_market_snapshots (
  key text primary key default 'latest',
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table public.ir_market_snapshots is
  'اسنپ‌شاتِ بازارِ ایران؛ رلهٔ داخل ایران می‌نویسد (upsert key=latest)، سایت می‌خواند. فقط قیمتِ عمومی.';

alter table public.ir_market_snapshots enable row level security;

-- خواندنِ عمومی: این قیمت‌ها عمومی‌اند و همان‌ها روی سایت نمایش داده می‌شوند.
drop policy if exists "ir_market_snapshots_public_read" on public.ir_market_snapshots;
create policy "ir_market_snapshots_public_read"
  on public.ir_market_snapshots for select
  to anon, authenticated
  using (true);

-- هیچ policy نوشتنی برای anon/authenticated تعریف نمی‌شود؛ فقط service_role
-- (رله، با SUPABASE_SERVICE_ROLE_KEY در env لیارا) می‌نویسد — RLS را دور می‌زند.
