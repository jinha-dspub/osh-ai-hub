-- Apply AFTER 202611040001_site_activity.sql, using the DB owner's SQL editor.
-- User explicitly designated this existing Google account on 2026-11-04.
-- No users, sessions or login credentials are created here.
begin;
do $$
declare
  matches integer;
  target uuid;
begin
  select count(*) into matches from auth.users u
  where lower(u.email) = 'jinha@dspubs.org'
    and u.email_confirmed_at is not null and u.deleted_at is null
    and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google');
  if matches <> 1 then
    raise exception 'Expected exactly one verified Google account; no role assigned';
  end if;
  select u.id into target from auth.users u where lower(u.email) = 'jinha@dspubs.org'
    and u.email_confirmed_at is not null and u.deleted_at is null
    and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google');
  insert into public.role_assignments (user_id, role) values (target, 'admin')
    on conflict do nothing;
end;
$$;
commit;
