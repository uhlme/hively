-- Security hardening: Critical + High findings from audit
-- Safe to run after migration_operations.sql + migration_viewer_role.sql

-- ---------------------------------------------------------------------------
-- Critical: Close privilege-escalation via membership bootstrap
-- Only the operation creator may self-insert as first owner, and only when
-- the operation has no members yet.
-- ---------------------------------------------------------------------------

drop policy if exists "Owners can insert members" on public.operation_members;
create policy "Owners can insert members"
  on public.operation_members for insert
  to authenticated
  with check (
    public.is_operation_owner(operation_id)
    or (
      user_id = auth.uid()
      and role = 'owner'
      and exists (
        select 1
        from public.operations o
        where o.id = operation_id
          and o.created_by = auth.uid()
      )
      and not exists (
        select 1
        from public.operation_members m
        where m.operation_id = operation_id
      )
    )
  );

-- ---------------------------------------------------------------------------
-- High: Restrict profile visibility to self + co-members (no global email leak)
-- ---------------------------------------------------------------------------

drop policy if exists "Profiles are viewable by authenticated users" on public.profiles;
drop policy if exists "Profiles viewable by self or co-members" on public.profiles;
create policy "Profiles viewable by self or co-members"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.operation_members me
      join public.operation_members them
        on them.operation_id = me.operation_id
      where me.user_id = auth.uid()
        and them.user_id = profiles.id
    )
  );

-- ---------------------------------------------------------------------------
-- High: Invites must not grant owner; neutralize existing owner invites
-- ---------------------------------------------------------------------------

update public.operation_invites
set role = 'editor'
where role = 'owner';

alter table public.operation_invites
  drop constraint if exists operation_invites_role_check;
alter table public.operation_invites
  add constraint operation_invites_role_check
  check (role in ('editor', 'viewer'));

-- Harden join: never accept owner via invite code
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

  if invite_role is null or invite_role not in ('editor', 'viewer') then
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

revoke all on function public.join_operation_with_code(text) from public;
grant execute on function public.join_operation_with_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- High: Invite preview — no operation_id leak; honor expiry / max_uses
-- ---------------------------------------------------------------------------

drop function if exists public.get_invite_by_code(text);

create or replace function public.get_invite_by_code(invite_code text)
returns table (
  operation_name text,
  role text,
  expires_at timestamp with time zone
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.name as operation_name,
    i.role,
    i.expires_at
  from public.operation_invites i
  join public.operations o on o.id = i.operation_id
  where upper(i.code) = upper(trim(invite_code))
    and i.role in ('editor', 'viewer')
    and (i.expires_at is null or i.expires_at >= timezone('utc'::text, now()))
    and (i.max_uses is null or i.used_count < i.max_uses)
  limit 1;
$$;

revoke all on function public.get_invite_by_code(text) from public;
grant execute on function public.get_invite_by_code(text) to anon;
grant execute on function public.get_invite_by_code(text) to authenticated;
