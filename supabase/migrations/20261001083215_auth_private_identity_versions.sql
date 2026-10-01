begin;
create schema if not exists identity_private;
revoke all on schema identity_private from public,anon,authenticated;
create table identity_private.national_id_registry(
 digest text primary key check(digest ~ '^[a-f0-9]{64}$'),
 user_id uuid not null references auth.users(id),
 key_version text not null
);
create table identity_private.profile_versions(
 user_id uuid not null references auth.users(id),
 version integer not null check(version>0),
 ciphertext text not null check(length(ciphertext) between 30 and 8192),
 key_version text not null,
 national_id_format_valid boolean not null default true check(national_id_format_valid),
 phone_national_id_match text not null default 'pending' check(phone_national_id_match='pending'),
 identity_match text not null default 'pending' check(identity_match='pending'),
 consent_version text not null,
 created_at timestamptz not null default now(),
 primary key(user_id,version)
);
alter table identity_private.national_id_registry enable row level security;
alter table identity_private.profile_versions enable row level security;
revoke all on all tables in schema identity_private from public,anon,authenticated;
-- Trusted server-only writer. There is no client RPC for supplying a digest or verification result.
create function public.auth_save_private_identity(p_user uuid,p_base integer,p_ciphertext text,p_digest text,p_key_version text,p_consent text)
returns integer language plpgsql security definer set search_path='' as $$
declare v_current integer; v_owner uuid;
begin
 if p_user is null or p_base<0 or p_digest !~ '^[a-f0-9]{64}$' or p_key_version !~ '^[a-zA-Z0-9-]{1,40}$' or p_consent <> 'identity-v1' then raise exception 'invalid identity input' using errcode='22023'; end if;
 perform 1 from auth.users where id=p_user and phone_confirmed_at is not null for update;
 if not found then raise exception 'verified phone required' using errcode='42501'; end if;
 select coalesce(max(version),0) into v_current from identity_private.profile_versions where user_id=p_user;
 if v_current<>p_base then raise exception 'identity version conflict' using errcode='23505'; end if;
 insert into identity_private.national_id_registry(digest,user_id,key_version) values(p_digest,p_user,p_key_version) on conflict(digest) do nothing;
 select user_id into v_owner from identity_private.national_id_registry where digest=p_digest;
 if v_owner<>p_user then raise exception 'identity review required' using errcode='42501'; end if;
 insert into identity_private.profile_versions(user_id,version,ciphertext,key_version,consent_version)
 values(p_user,v_current+1,p_ciphertext,p_key_version,p_consent);
 return v_current+1;
end $$;
revoke all on function public.auth_save_private_identity(uuid,integer,text,text,text,text) from public,anon,authenticated;
grant execute on function public.auth_save_private_identity(uuid,integer,text,text,text,text) to service_role;
create function public.auth_read_private_identity()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',version,'ciphertext',ciphertext,'keyVersion',key_version,'phoneNationalIdMatch',phone_national_id_match,'identityMatch',identity_match,'consentVersion',consent_version)
 from identity_private.profile_versions where user_id=auth.uid() order by version desc limit 1
$$;
revoke all on function public.auth_read_private_identity() from public,anon;
grant execute on function public.auth_read_private_identity() to authenticated;
comment on schema identity_private is 'Encrypted, versioned identity attached to existing Auth UUID. No public identity claims. Official matching remains pending.';
commit;
