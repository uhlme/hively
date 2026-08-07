-- Complete Pro RLS gaps + safer billing_gates default
-- Apply after migration_billing_hardening.sql

-- Align default with docs: gates off until explicitly enabled at Stripe go-live.
--   update public.app_settings set value = 'true' where key = 'billing_gates_enabled';
insert into public.app_settings (key, value)
values ('billing_gates_enabled', 'false')
on conflict (key) do update
  set value = 'false',
      updated_at = timezone('utc'::text, now());

-- Allow Stripe "paused" status in plan_status
alter table public.operations
  drop constraint if exists operations_plan_status_check;
alter table public.operations
  add constraint operations_plan_status_check
  check (plan_status in (
    'none', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'paused'
  ));

-- Shared helper: cloud writes / owner team actions allowed
create or replace function public.operation_pro_write_allowed(op_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    not public.billing_gates_enabled()
    or public.operation_has_pro(op_id)
  );
$$;

revoke all on function public.operation_pro_write_allowed(uuid) from public;
grant execute on function public.operation_pro_write_allowed(uuid) to authenticated;

-- Finances (owner-only writes) must respect Pro gates
drop policy if exists "Owners can insert operation finances" on public.finances;
create policy "Owners can insert operation finances"
  on public.finances for insert to authenticated
  with check (
    public.is_operation_owner(operation_id)
    and created_by = auth.uid()
    and public.operation_pro_write_allowed(operation_id)
  );

drop policy if exists "Owners can update operation finances" on public.finances;
create policy "Owners can update operation finances"
  on public.finances for update to authenticated
  using (
    public.is_operation_owner(operation_id)
    and public.operation_pro_write_allowed(operation_id)
  )
  with check (
    public.is_operation_owner(operation_id)
    and public.operation_pro_write_allowed(operation_id)
  );

drop policy if exists "Owners can delete operation finances" on public.finances;
create policy "Owners can delete operation finances"
  on public.finances for delete to authenticated
  using (
    public.is_operation_owner(operation_id)
    and public.operation_pro_write_allowed(operation_id)
  );

-- Hive / apiary deletes
drop policy if exists "Owners can delete operation hives" on public.hives;
create policy "Owners can delete operation hives"
  on public.hives for delete to authenticated
  using (
    public.is_operation_owner(operation_id)
    and public.operation_pro_write_allowed(operation_id)
  );

drop policy if exists "Owners can delete operation apiaries" on public.apiaries;
create policy "Owners can delete operation apiaries"
  on public.apiaries for delete to authenticated
  using (
    public.is_operation_owner(operation_id)
    and public.operation_pro_write_allowed(operation_id)
  );

-- Team: adding members requires Pro (bootstrap first-owner stays free)
drop policy if exists "Owners can insert members" on public.operation_members;
create policy "Owners can insert members"
  on public.operation_members for insert
  to authenticated
  with check (
    (
      public.is_operation_owner(operation_id)
      and public.operation_pro_write_allowed(operation_id)
    )
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

drop policy if exists "Owners can update members" on public.operation_members;
create policy "Owners can update members"
  on public.operation_members for update
  to authenticated
  using (
    public.is_operation_owner(operation_id)
    and public.operation_pro_write_allowed(operation_id)
  )
  with check (
    public.is_operation_owner(operation_id)
    and public.operation_pro_write_allowed(operation_id)
  );

-- Invite delete also Pro-gated when gates on
drop policy if exists "Owners can delete invites" on public.operation_invites;
create policy "Owners can delete invites"
  on public.operation_invites for delete
  to authenticated
  using (
    public.is_operation_owner(operation_id)
    and public.operation_pro_write_allowed(operation_id)
  );
