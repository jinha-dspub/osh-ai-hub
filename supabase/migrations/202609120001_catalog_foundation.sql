-- Phase 0 foundation. The web preview currently reads DEMO fixtures.
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 100),
  organization text check (char_length(organization) <= 200),
  created_at timestamptz not null default now()
);
create table public.role_assignments (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('provider', 'admin')),
  primary key (user_id, role)
);
create table public.datasets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null, description text not null default '',
  category text not null, provider text not null,
  status text not null default 'draft' check (status in ('draft','review','published','archived')),
  visibility text not null default 'private' check (visibility in ('public','registered','restricted','private')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.dataset_versions (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.datasets(id) on delete restrict,
  version text not null, description text not null default '', license text not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  released_at timestamptz,
  unique (dataset_id, version)
);
create table public.dataset_files (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.dataset_versions(id) on delete restrict,
  name text not null, bucket_id text not null, object_path text not null,
  file_size bigint not null check (file_size >= 0),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  mime_type text not null,
  unique (bucket_id, object_path)
);
create index dataset_versions_dataset_idx on public.dataset_versions(dataset_id);
create index dataset_files_version_idx on public.dataset_files(version_id);
create index datasets_public_category_idx on public.datasets(category) where status='published';

alter table public.profiles enable row level security;
alter table public.role_assignments enable row level security;
alter table public.datasets enable row level security;
alter table public.dataset_versions enable row level security;
alter table public.dataset_files enable row level security;

revoke all on public.profiles, public.role_assignments, public.datasets,
  public.dataset_versions, public.dataset_files from anon, authenticated;
grant select on public.datasets, public.dataset_versions, public.dataset_files to anon, authenticated;
grant select, insert on public.profiles to authenticated;
grant update (display_name, organization) on public.profiles to authenticated;
grant select on public.role_assignments to authenticated;

create policy profile_read_self on public.profiles for select to authenticated
  using ((select auth.uid())=id);
create policy profile_insert_self on public.profiles for insert to authenticated
  with check ((select auth.uid())=id);
create policy profile_update_self on public.profiles for update to authenticated
  using ((select auth.uid())=id) with check ((select auth.uid())=id);
create policy role_read_self on public.role_assignments for select to authenticated
  using ((select auth.uid())=user_id);
-- No role writes or catalog writes are granted to browser users yet.
create policy dataset_read_public on public.datasets for select to anon, authenticated
  using (status='published' and visibility='public');
create policy version_read_public on public.dataset_versions for select to anon, authenticated
  using (status='published' and exists (
    select 1 from public.datasets d where d.id=dataset_id
      and d.status='published' and d.visibility='public'
  ));
create policy file_read_public on public.dataset_files for select to anon, authenticated
  using (exists (
    select 1 from public.dataset_versions v join public.datasets d on d.id=v.dataset_id
    where v.id=version_id and v.status='published'
      and d.status='published' and d.visibility='public'
  ));

-- Private buckets with no client upload/download policies until authorization is implemented.
insert into storage.buckets (id,name,public)
values ('dataset-files','dataset-files',false),('model-weights','model-weights',false)
on conflict (id) do nothing;
commit;
