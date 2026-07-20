-- Add viewer role for read-only Patenschaft access
-- Safe for existing data: only expands role checks and tightens write RLS.

-- Expand allowed roles on members + invites
alter table public.operation_members
  drop constraint if exists operation_members_role_check;
alter table public.operation_members
  add constraint operation_members_role_check
  check (role in ('owner', 'editor', 'viewer'));

alter table public.operation_invites
  drop constraint if exists operation_invites_role_check;
alter table public.operation_invites
  add constraint operation_invites_role_check
  check (role in ('owner', 'editor', 'viewer'));

-- Helper: can write operational data (owner + editor, not viewer)
create or replace function public.can_edit_operation(op_id uuid)
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
      and m.role in ('owner', 'editor')
  );
$$;

revoke all on function public.can_edit_operation(uuid) from public;
grant execute on function public.can_edit_operation(uuid) to authenticated;

-- HIVES: keep select for all members; writes only for editors/owners
drop policy if exists "Members can insert operation hives" on public.hives;
drop policy if exists "Members can update operation hives" on public.hives;

create policy "Editors can insert operation hives"
  on public.hives for insert to authenticated
  with check (public.can_edit_operation(operation_id) and created_by = auth.uid());

create policy "Editors can update operation hives"
  on public.hives for update to authenticated
  using (public.can_edit_operation(operation_id))
  with check (public.can_edit_operation(operation_id));

-- INSPECTIONS
drop policy if exists "Members can insert operation inspections" on public.inspections;
drop policy if exists "Members can update operation inspections" on public.inspections;
drop policy if exists "Members can delete operation inspections" on public.inspections;

create policy "Editors can insert operation inspections"
  on public.inspections for insert to authenticated
  with check (public.can_edit_operation(operation_id) and created_by = auth.uid());

create policy "Editors can update operation inspections"
  on public.inspections for update to authenticated
  using (public.can_edit_operation(operation_id))
  with check (public.can_edit_operation(operation_id));

create policy "Editors can delete operation inspections"
  on public.inspections for delete to authenticated
  using (public.can_edit_operation(operation_id));

-- HONEY
drop policy if exists "Members can insert operation honey" on public.honey_harvests;
drop policy if exists "Members can update operation honey" on public.honey_harvests;
drop policy if exists "Members can delete operation honey" on public.honey_harvests;

create policy "Editors can insert operation honey"
  on public.honey_harvests for insert to authenticated
  with check (public.can_edit_operation(operation_id) and created_by = auth.uid());

create policy "Editors can update operation honey"
  on public.honey_harvests for update to authenticated
  using (public.can_edit_operation(operation_id))
  with check (public.can_edit_operation(operation_id));

create policy "Editors can delete operation honey"
  on public.honey_harvests for delete to authenticated
  using (public.can_edit_operation(operation_id));
