-- ─────────────────────────────────────────────────────────────────────
-- فاز ۱۲ — چشم‌انداز هفتگی بازار با کارنامهٔ قابل راستی‌آزمایی
--
-- weekly_outlooks: هر هفته «یک» رکورد چشم‌انداز (سازنده/خنثی/فرسایشی) از
-- موتور رژیم بازار + متن آرش. append-only + هش زنجیره‌ای — مثل signals.
-- weekly_outlook_results: بستن هر چشم‌انداز پس از پایان هفته با نتیجهٔ واقعی.
--
-- اجرا: یک‌بار در Supabase SQL Editor (پروژهٔ uooeygybrniptzdxuzhj).
-- پیش‌نیاز: extensions.digest (pgcrypto) و fn_forbid_mutation از terminal_t0.sql.
-- ─────────────────────────────────────────────────────────────────────

-- ── ۱) چشم‌انداز هفتگی — تغییرناپذیر + هش زنجیره‌ای ──────────────────
create table public.weekly_outlooks (
  id             uuid not null default gen_random_uuid() unique,
  seq            bigint generated always as identity primary key,
  week_start     date not null unique,          -- شنبهٔ هفتهٔ پیشِ‌رو (تقویم معاملاتی تهران)
  label          text not null check (label in ('سازنده','خنثی','فرسایشی')),
  score          integer check (score between 0 and 100),
  drivers        jsonb not null default '[]'::jsonb,   -- [{label,value,effect}]
  assumptions    jsonb not null default '[]'::jsonb,   -- فروض روش‌شناسی موتور
  note_md        text,                                  -- متن کوتاه آرش (اختیاری، انسان در حلقه)
  engine_snapshot jsonb,                                -- خروجی خام computeRegime برای post-mortem
  published_at   timestamptz not null default now(),
  prev_hash      text not null,
  record_hash    text not null unique
);
comment on table public.weekly_outlooks is
  'چشم‌انداز هفتگی بازار (از موتور رژیم + تأیید انسانی). append-only + هش زنجیره‌ای — کارنامهٔ عمومی.';

create or replace function public.fn_weekly_outlooks_hash_chain()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare prev text;
begin
  perform pg_advisory_xact_lock(hashtext('public.weekly_outlooks_chain'));
  select record_hash into prev from public.weekly_outlooks order by seq desc limit 1;
  new.prev_hash    := coalesce(prev, 'GENESIS');
  new.published_at := coalesce(new.published_at, now());
  new.record_hash  := encode(extensions.digest(convert_to(
      new.prev_hash || '|' || new.week_start::text || '|' || new.label || '|' ||
      coalesce(new.score::text, '') || '|' || new.drivers::text || '|' ||
      coalesce(new.note_md, '') || '|' || new.published_at::text, 'utf8'), 'sha256'), 'hex');
  return new;
end $$;

create trigger trg_weekly_outlooks_hash_chain
  before insert on public.weekly_outlooks
  for each row execute function public.fn_weekly_outlooks_hash_chain();

-- ── ۲) نتیجهٔ هفتگی — تغییرناپذیر + هش زنجیره‌ای ─────────────────────
create table public.weekly_outlook_results (
  id                uuid not null default gen_random_uuid() unique,
  seq               bigint generated always as identity primary key,
  outlook_id        uuid not null references public.weekly_outlooks (id) unique,
  realized_label    text not null check (realized_label in ('سازنده','خنثی','فرسایشی')),
  realized_score    integer check (realized_score between 0 and 100),
  correct           boolean not null,
  detail            jsonb,                 -- سنجه‌های محقق‌شده (breadth و …)
  note              text,
  closed_at         timestamptz not null default now(),
  prev_hash         text not null,
  record_hash       text not null unique
);
comment on table public.weekly_outlook_results is
  'نتیجهٔ واقعی هر چشم‌انداز هفتگی پس از پایان هفته (درست و غلط، هر دو). append-only + هش زنجیره‌ای.';

create or replace function public.fn_weekly_outlook_results_hash_chain()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare prev text;
begin
  perform pg_advisory_xact_lock(hashtext('public.weekly_outlook_results_chain'));
  select record_hash into prev from public.weekly_outlook_results order by seq desc limit 1;
  new.prev_hash   := coalesce(prev, 'GENESIS');
  new.closed_at   := coalesce(new.closed_at, now());
  new.record_hash := encode(extensions.digest(convert_to(
      new.prev_hash || '|' || new.outlook_id::text || '|' || new.realized_label || '|' ||
      coalesce(new.realized_score::text, '') || '|' || new.correct::text || '|' ||
      new.closed_at::text, 'utf8'), 'sha256'), 'hex');
  return new;
end $$;

create trigger trg_weekly_outlook_results_hash_chain
  before insert on public.weekly_outlook_results
  for each row execute function public.fn_weekly_outlook_results_hash_chain();

-- ── ۳) تریگرهای append-only (ویرایش/حذف/ترانکیت ممنوع) ──────────────
do $$
declare t text;
begin
  foreach t in array array['weekly_outlooks','weekly_outlook_results']
  loop
    execute format('create trigger trg_%s_immutable before update or delete on public.%I
                    for each statement execute function public.fn_forbid_mutation()', t, t);
    execute format('create trigger trg_%s_no_truncate before truncate on public.%I
                    for each statement execute function public.fn_forbid_mutation()', t, t);
  end loop;
end $$;

-- ── ۴) RLS: خواندن عمومی؛ نوشتن فقط service_role (بدون policy درج) ───
alter table public.weekly_outlooks        enable row level security;
alter table public.weekly_outlook_results enable row level security;

create policy "public read weekly_outlooks"
  on public.weekly_outlooks for select to anon, authenticated using (true);
create policy "public read weekly_outlook_results"
  on public.weekly_outlook_results for select to anon, authenticated using (true);
