-- Multi-user Bienenbetrieb (operations) migration
-- Safe to run after the base migration.sql
-- Converts solo user_id ownership into shared operation_id workspaces.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (display names for "created by")
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by authenticated users" on public.profiles;
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "Users can upsert own profile" on public.profiles;
create policy "Users can upsert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'Imker'),
    new.email
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for existing users
insert into public.profiles (id, display_name, email)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1), 'Imker'),
  u.email
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Operations
-- ---------------------------------------------------------------------------

create table if not exists public.operations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address_line text not null default '',
  postal_code text not null default '',
  city text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.operations enable row level security;

create table if not exists public.operation_members (
  operation_id uuid not null references public.operations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor')),
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  invited_by uuid references auth.users(id) on delete set null,
  primary key (operation_id, user_id)
);

create index if not exists operation_members_user_id_idx on public.operation_members(user_id);
alter table public.operation_members enable row level security;

create table if not exists public.operation_invites (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.operations(id) on delete cascade,
  code text not null unique,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamp with time zone,
  max_uses integer,
  used_count integer not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists operation_invites_code_idx on public.operation_invites(code);
alter table public.operation_invites enable row level security;

-- Membership helpers (security definer to avoid RLS recursion)
create or replace function public.is_operation_member(op_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.operation_members m
    where m.operation_id = op_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_operation_owner(op_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.operation_members m
    where m.operation_id = op_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

create or replace function public.user_operation_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.operation_id
  from public.operation_members m
  where m.user_id = auth.uid();
$$;

revoke all on function public.is_operation_member(uuid) from public;
revoke all on function public.is_operation_owner(uuid) from public;
revoke all on function public.user_operation_ids() from public;
grant execute on function public.is_operation_member(uuid) to authenticated;
grant execute on function public.is_operation_owner(uuid) to authenticated;
grant execute on function public.user_operation_ids() to authenticated;

-- Operations policies
drop policy if exists "Members can view their operations" on public.operations;
create policy "Members can view their operations"
  on public.operations for select
  to authenticated
  using (public.is_operation_member(id));

drop policy if exists "Authenticated users can create operations" on public.operations;
create policy "Authenticated users can create operations"
  on public.operations for insert
  to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "Owners can update operations" on public.operations;
create policy "Owners can update operations"
  on public.operations for update
  to authenticated
  using (public.is_operation_owner(id))
  with check (public.is_operation_owner(id));

drop policy if exists "Owners can delete operations" on public.operations;
create policy "Owners can delete operations"
  on public.operations for delete
  to authenticated
  using (public.is_operation_owner(id));

-- Members policies
drop policy if exists "Members can view co-members" on public.operation_members;
create policy "Members can view co-members"
  on public.operation_members for select
  to authenticated
  using (public.is_operation_member(operation_id));

drop policy if exists "Owners can insert members" on public.operation_members;
create policy "Owners can insert members"
  on public.operation_members for insert
  to authenticated
  with check (
    public.is_operation_owner(operation_id)
    or (user_id = auth.uid() and role = 'owner') -- bootstrap: creator adds self as owner
  );

drop policy if exists "Owners can update members" on public.operation_members;
create policy "Owners can update members"
  on public.operation_members for update
  to authenticated
  using (public.is_operation_owner(operation_id))
  with check (public.is_operation_owner(operation_id));

drop policy if exists "Owners or self can delete membership" on public.operation_members;
create policy "Owners or self can delete membership"
  on public.operation_members for delete
  to authenticated
  using (
    public.is_operation_owner(operation_id)
    or user_id = auth.uid()
  );

-- Invites policies
drop policy if exists "Members can view invites of their operations" on public.operation_invites;
create policy "Members can view invites of their operations"
  on public.operation_invites for select
  to authenticated
  using (public.is_operation_member(operation_id));

drop policy if exists "Owners can create invites" on public.operation_invites;
create policy "Owners can create invites"
  on public.operation_invites for insert
  to authenticated
  with check (public.is_operation_owner(operation_id) and created_by = auth.uid());

drop policy if exists "Owners can update invites" on public.operation_invites;
create policy "Owners can update invites"
  on public.operation_invites for update
  to authenticated
  using (public.is_operation_owner(operation_id));

drop policy if exists "Owners can delete invites" on public.operation_invites;
create policy "Owners can delete invites"
  on public.operation_invites for delete
  to authenticated
  using (public.is_operation_owner(operation_id));

-- Public invite lookup by code (needed before joining)
create or replace function public.get_invite_by_code(invite_code text)
returns table (
  id uuid,
  operation_id uuid,
  operation_name text,
  role text,
  expires_at timestamp with time zone,
  max_uses integer,
  used_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.id,
    i.operation_id,
    o.name as operation_name,
    i.role,
    i.expires_at,
    i.max_uses,
    i.used_count
  from public.operation_invites i
  join public.operations o on o.id = i.operation_id
  where upper(i.code) = upper(invite_code)
  limit 1;
$$;

-- Replace join function with a clearer version
create or replace function public.join_operation_with_code(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_id uuid;
  op_id uuid;
  invite_role text;
  invite_expires timestamp with time zone;
  invite_max integer;
  invite_used integer;
  invite_creator uuid;
  uid uuid := auth.uid();
  already_member boolean;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select i.id, i.operation_id, i.role, i.expires_at, i.max_uses, i.used_count, i.created_by
  into invite_id, op_id, invite_role, invite_expires, invite_max, invite_used, invite_creator
  from public.operation_invites i
  where upper(i.code) = upper(trim(invite_code))
  for update;

  if invite_id is null then
    raise exception 'Einladungscode ungültig';
  end if;

  if invite_expires is not null and invite_expires < timezone('utc'::text, now()) then
    raise exception 'Einladungscode abgelaufen';
  end if;

  if invite_max is not null and invite_used >= invite_max then
    raise exception 'Einladungscode bereits aufgebraucht';
  end if;

  select exists (
    select 1 from public.operation_members m
    where m.operation_id = op_id and m.user_id = uid
  ) into already_member;

  if already_member then
    return op_id;
  end if;

  insert into public.operation_members (operation_id, user_id, role, invited_by)
  values (op_id, uid, invite_role, invite_creator);

  update public.operation_invites
  set used_count = used_count + 1
  where id = invite_id;

  return op_id;
end;
$$;

revoke all on function public.get_invite_by_code(text) from public;
revoke all on function public.join_operation_with_code(text) from public;
grant execute on function public.get_invite_by_code(text) to authenticated;
grant execute on function public.join_operation_with_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Extend domain tables with operation_id + created_by
-- ---------------------------------------------------------------------------

alter table public.hives add column if not exists operation_id uuid references public.operations(id) on delete cascade;
alter table public.hives add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.inspections add column if not exists operation_id uuid references public.operations(id) on delete cascade;
alter table public.inspections add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.finances add column if not exists operation_id uuid references public.operations(id) on delete cascade;
alter table public.finances add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.honey_harvests add column if not exists operation_id uuid references public.operations(id) on delete cascade;
alter table public.honey_harvests add column if not exists created_by uuid references auth.users(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Migrate existing solo data into per-user default operations
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  new_op_id uuid;
begin
  for r in
    select distinct user_id from public.hives where operation_id is null
    union
    select distinct user_id from public.inspections where operation_id is null
    union
    select distinct user_id from public.finances where operation_id is null
    union
    select distinct user_id from public.honey_harvests where operation_id is null
  loop
    insert into public.operations (name, address_line, postal_code, city, created_by)
    values ('Mein Betrieb', '', '', '', r.user_id)
    returning id into new_op_id;

    insert into public.operation_members (operation_id, user_id, role)
    values (new_op_id, r.user_id, 'owner')
    on conflict do nothing;

    update public.hives set operation_id = new_op_id, created_by = coalesce(created_by, user_id)
      where user_id = r.user_id and operation_id is null;
    update public.inspections set operation_id = new_op_id, created_by = coalesce(created_by, user_id)
      where user_id = r.user_id and operation_id is null;
    update public.finances set operation_id = new_op_id, created_by = coalesce(created_by, user_id)
      where user_id = r.user_id and operation_id is null;
    update public.honey_harvests set operation_id = new_op_id, created_by = coalesce(created_by, user_id)
      where user_id = r.user_id and operation_id is null;
  end loop;
end $$;

-- For users with accounts but no data yet: no auto-op (created on first login in app)

create index if not exists hives_operation_id_idx on public.hives(operation_id);
create index if not exists inspections_operation_id_idx on public.inspections(operation_id);
create index if not exists finances_operation_id_idx on public.finances(operation_id);
create index if not exists honey_harvests_operation_id_idx on public.honey_harvests(operation_id);

-- ---------------------------------------------------------------------------
-- Replace RLS on domain tables (operation-scoped)
-- ---------------------------------------------------------------------------

-- HIVES
drop policy if exists "Users can only select their own hives" on public.hives;
drop policy if exists "Users can only insert their own hives" on public.hives;
drop policy if exists "Users can only update their own hives" on public.hives;
drop policy if exists "Users can only delete their own hives" on public.hives;

create policy "Members can select operation hives"
  on public.hives for select to authenticated
  using (public.is_operation_member(operation_id));

create policy "Members can insert operation hives"
  on public.hives for insert to authenticated
  with check (public.is_operation_member(operation_id) and created_by = auth.uid());

create policy "Members can update operation hives"
  on public.hives for update to authenticated
  using (public.is_operation_member(operation_id))
  with check (public.is_operation_member(operation_id));

create policy "Owners can delete operation hives"
  on public.hives for delete to authenticated
  using (public.is_operation_owner(operation_id));

-- INSPECTIONS
drop policy if exists "Users can only select their own inspections" on public.inspections;
drop policy if exists "Users can only insert their own inspections" on public.inspections;
drop policy if exists "Users can only update their own inspections" on public.inspections;
drop policy if exists "Users can only delete their own inspections" on public.inspections;

create policy "Members can select operation inspections"
  on public.inspections for select to authenticated
  using (public.is_operation_member(operation_id));

create policy "Members can insert operation inspections"
  on public.inspections for insert to authenticated
  with check (public.is_operation_member(operation_id) and created_by = auth.uid());

create policy "Members can update operation inspections"
  on public.inspections for update to authenticated
  using (public.is_operation_member(operation_id))
  with check (public.is_operation_member(operation_id));

create policy "Members can delete operation inspections"
  on public.inspections for delete to authenticated
  using (public.is_operation_member(operation_id));

-- HONEY
drop policy if exists "Users can only select their own honey harvests" on public.honey_harvests;
drop policy if exists "Users can only insert their own honey harvests" on public.honey_harvests;
drop policy if exists "Users can only update their own honey harvests" on public.honey_harvests;
drop policy if exists "Users can only delete their own honey harvests" on public.honey_harvests;

create policy "Members can select operation honey"
  on public.honey_harvests for select to authenticated
  using (public.is_operation_member(operation_id));

create policy "Members can insert operation honey"
  on public.honey_harvests for insert to authenticated
  with check (public.is_operation_member(operation_id) and created_by = auth.uid());

create policy "Members can update operation honey"
  on public.honey_harvests for update to authenticated
  using (public.is_operation_member(operation_id))
  with check (public.is_operation_member(operation_id));

create policy "Members can delete operation honey"
  on public.honey_harvests for delete to authenticated
  using (public.is_operation_member(operation_id));

-- FINANCES (owners only)
drop policy if exists "Users can only select their own finances" on public.finances;
drop policy if exists "Users can only insert their own finances" on public.finances;
drop policy if exists "Users can only update their own finances" on public.finances;
drop policy if exists "Users can only delete their own finances" on public.finances;

create policy "Owners can select operation finances"
  on public.finances for select to authenticated
  using (public.is_operation_owner(operation_id));

create policy "Owners can insert operation finances"
  on public.finances for insert to authenticated
  with check (public.is_operation_owner(operation_id) and created_by = auth.uid());

create policy "Owners can update operation finances"
  on public.finances for update to authenticated
  using (public.is_operation_owner(operation_id))
  with check (public.is_operation_owner(operation_id));

create policy "Owners can delete operation finances"
  on public.finances for delete to authenticated
  using (public.is_operation_owner(operation_id));
