-- Aggregate browser visits. Identity comes exclusively from verified Auth JWTs.
begin;

-- The initial catalog migration has not been deployed on this installation.
create table if not exists public.role_assignments (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('provider', 'admin')),
  primary key (user_id, role)
);
alter table public.role_assignments enable row level security;
revoke all on public.role_assignments from anon, authenticated;
grant select on public.role_assignments to authenticated;
drop policy if exists role_read_self on public.role_assignments;
create policy role_read_self on public.role_assignments for select to authenticated
  using ((select auth.uid()) = user_id);

create table public.site_visitors (
  visitor_id uuid primary key,
  user_id uuid references auth.users(id) on delete set null,
  first_seen timestamptz not null,
  last_seen timestamptz not null
);
create index site_visitors_active_idx on public.site_visitors (last_seen desc);
create table public.site_activity_totals (
  id boolean primary key default true check (id),
  started_at timestamptz not null default now(),
  visits bigint not null default 0,
  browsers bigint not null default 0
);
insert into public.site_activity_totals (id) values (true);
create table public.site_activity_daily (
  day date primary key,
  visits bigint not null default 0,
  browsers bigint not null default 0
);
alter table public.site_visitors enable row level security;
alter table public.site_activity_totals enable row level security;
alter table public.site_activity_daily enable row level security;
revoke all on public.site_visitors, public.site_activity_totals,
  public.site_activity_daily from public, anon, authenticated;
-- No direct client access, including administrators. Only the bounded RPCs below.

create function public.record_site_visit(p_visitor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  stamp timestamptz := now();
  who uuid := auth.uid();
  added integer;
  previous public.site_visitors%rowtype;
  new_visit boolean := false;
begin
  if p_visitor_id is null then raise exception 'visitor required'; end if;
  insert into public.site_visitors (visitor_id, user_id, first_seen, last_seen)
    values (p_visitor_id, who, stamp, stamp) on conflict do nothing;
  get diagnostics added = row_count;
  if added = 1 then
    new_visit := true;
  else
    select * into previous from public.site_visitors
      where visitor_id = p_visitor_id for update;
    new_visit := previous.last_seen < stamp - interval '30 minutes';
    -- Shared browser tabs and retries do not increase visits. Throttle writes.
    if previous.last_seen < stamp - interval '30 seconds'
        or previous.user_id is distinct from who then
      update public.site_visitors set last_seen = stamp, user_id = who
        where visitor_id = p_visitor_id;
    end if;
  end if;
  if new_visit then
    update public.site_activity_totals set visits = visits + 1, browsers = browsers + added
      where id;
    insert into public.site_activity_daily (day, visits, browsers)
      values ((stamp at time zone 'Asia/Seoul')::date, 1, added)
      on conflict (day) do update set
        visits = public.site_activity_daily.visits + 1,
        browsers = public.site_activity_daily.browsers + excluded.browsers;
  end if;
end;
$$;
revoke all on function public.record_site_visit(uuid) from public;
grant execute on function public.record_site_visit(uuid) to anon, authenticated;

create function public.site_activity_summary()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare answer jsonb;
begin
  if not exists (select 1 from public.role_assignments
    where user_id = auth.uid() and role = 'admin') then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'startedAt', t.started_at,
    'updatedAt', now(),
    'activeBrowsers', (select count(*) from public.site_visitors where last_seen >= now() - interval '5 minutes'),
    'totalVisits', t.visits,
    'totalBrowsers', t.browsers,
    'todayVisits', coalesce((select visits from public.site_activity_daily where day = (now() at time zone 'Asia/Seoul')::date), 0),
    'registeredUsers', (select count(*) from auth.users where deleted_at is null),
    'activeUsers', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'email', a.email,
        'name', a.name, 'lastSeen', a.last_seen) order by a.last_seen desc)
      from (
        select u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '') as name,
          max(v.last_seen) as last_seen
        from public.site_visitors v join auth.users u on u.id = v.user_id
        where v.last_seen >= now() - interval '5 minutes' and u.deleted_at is null
        group by u.id
      ) a
    ), '[]'::jsonb),
    'recentLogins', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email,
        'name', coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
        'lastSignIn', u.last_sign_in_at) order by u.last_sign_in_at desc)
      from (select id, email, raw_user_meta_data, last_sign_in_at from auth.users
        where deleted_at is null and last_sign_in_at is not null
        order by last_sign_in_at desc limit 50) u
    ), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'visits', d.visits) order by d.day desc)
      from (select day, visits from public.site_activity_daily
        where day >= (now() at time zone 'Asia/Seoul')::date - 29 order by day desc) d), '[]'::jsonb)
  ) into answer from public.site_activity_totals t where id;
  return answer;
end;
$$;
revoke all on function public.site_activity_summary() from public, anon;
grant execute on function public.site_activity_summary() to authenticated;
commit;
