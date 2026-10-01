-- Read-only. No identifiers, contact details, credentials or password hashes returned.
select count(*) as admin_profile_count,
 jsonb_agg(jsonb_build_object(
  'uuid_present', u.id is not null,
  'providers', (select jsonb_agg(distinct i.provider) from auth.identities i where i.user_id=u.id),
  'password_present', coalesce(u.encrypted_password, '') <> '',
  'email_confirmed', u.email_confirmed_at is not null,
  'phone_confirmed', u.phone_confirmed_at is not null,
  'banned', coalesce(u.banned_until > now(), false),
  'profile_linked', p.id = u.id,
  'role', p.role)) as statuses
from public.profiles p left join auth.users u on u.id = p.id
where p.role = 'admin';
