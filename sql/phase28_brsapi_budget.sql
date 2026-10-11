-- phase28: existing shared BrsApi counter, hardened for self-hosted Liara.
-- Operational counters only; never changes financial tables.
-- Run as database owner with BYPASSRLS. Every quota window requires an
-- operator-verified conservative usage baseline and supplier reset boundary.
begin;
create table if not exists public.brsapi_budget_days (
 day_key text primary key,
 leased integer not null default 0,
 hard_ceiling integer not null,
 lease_calls integer not null default 0,
 released integer not null default 0,
 first_lease_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint brsapi_budget_leased_sane check (leased >= 0 and leased <= hard_ceiling),
 constraint brsapi_budget_released_sane check (released >= 0),
 constraint brsapi_budget_ceiling_sane check (hard_ceiling > 0)
);
alter table public.brsapi_budget_days add column if not exists usage_verified boolean not null default false;
alter table public.brsapi_budget_days add column if not exists baseline_note text;
comment on table public.brsapi_budget_days is 'Shared conservative BrsApi allocation counter; unknown quota windows deny leases.';
comment on column public.brsapi_budget_days.usage_verified is 'Operator confirmed prior usage baseline and supplier quota window; never inferred from restart/date change.';
alter table public.brsapi_budget_days enable row level security;
alter table public.brsapi_budget_days force row level security;
revoke all on table public.brsapi_budget_days from public, anon, authenticated, service_role;
grant select on table public.brsapi_budget_days to service_role;

create or replace function public.brsapi_budget_lease(p_day text, p_want integer, p_hard integer)
returns table (granted integer, leased_before integer, hard_ceiling integer)
language plpgsql security definer set search_path = ''
as $$
declare
 v_before integer;
 v_hard integer;
 v_grant integer;
 v_verified boolean;
begin
 if p_day is null or btrim(p_day) = '' then
  raise exception 'brsapi budget: empty day' using errcode = 'BRSB1';
 end if;
 if p_want is null or p_want <= 0 then
  raise exception 'brsapi budget: invalid lease size' using errcode = 'BRSB2';
 end if;
 if p_hard is null or p_hard <= 0 then
  raise exception 'brsapi budget: invalid hard ceiling' using errcode = 'BRSB3';
 end if;
 -- Missing/unverified windows NEVER receive a zero-usage assumption.
 select b.leased, b.hard_ceiling, b.usage_verified into v_before, v_hard, v_verified
 from public.brsapi_budget_days b where b.day_key = p_day for update;
 if v_verified is distinct from true then
  raise exception 'brsapi budget: prior usage or quota window unverified' using errcode = 'BRSB4';
 end if;
 if p_hard < v_hard then
  -- Already allocated units cannot be undone; freeze further allocation
  -- when the requested ceiling is below them, keeping the CHECK valid.
  v_hard := greatest(p_hard, v_before);
  update public.brsapi_budget_days b set hard_ceiling = v_hard, updated_at = now() where b.day_key = p_day;
 end if;
 v_grant := least(p_want, greatest(0, v_hard - v_before));
 if v_grant > 0 then
  update public.brsapi_budget_days b set leased = v_before + v_grant,
   lease_calls = b.lease_calls + 1, updated_at = now() where b.day_key = p_day;
 end if;
 granted := v_grant;
 leased_before := v_before;
 hard_ceiling := v_hard;
 return next;
end;
$$;
revoke all on function public.brsapi_budget_lease(text, integer, integer) from public, anon, authenticated;
grant execute on function public.brsapi_budget_lease(text, integer, integer) to service_role;
comment on function public.brsapi_budget_lease(text, integer, integer) is 'Atomic shared allocation; requires operator-verified usage baseline and quota window.';

-- Keep the existing RPC signature compatible with deployed clients. Without
-- a lease ID, duplicate release/ambiguous HTTP retry could reopen quota.
-- Burn unused allocations; this is conservative and restart-safe.
create or replace function public.brsapi_budget_release(p_day text, p_back integer)
returns integer language plpgsql security definer set search_path = ''
as $$
begin
 if p_day is null or btrim(p_day) = '' then
  raise exception 'brsapi budget: empty day' using errcode = 'BRSB1';
 end if;
 return 0;
end;
$$;
revoke all on function public.brsapi_budget_release(text, integer) from public, anon, authenticated;
grant execute on function public.brsapi_budget_release(text, integer) to service_role;
comment on function public.brsapi_budget_release(text, integer) is 'Compatibility no-op: unused allocations burned; duplicate release never reopens quota.';
notify pgrst, 'reload schema';
commit;
