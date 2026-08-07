-- Fix: "Betrieb anlegen" fails with
--   new row violates row-level security policy for table "operations"
--
-- Root causes:
-- 1) INSERT ... RETURNING / PostgREST .select() needs SELECT visibility on the
--    new row, but SELECT only allowed members — creator is not a member yet.
-- 2) Membership bootstrap NOT EXISTS used unqualified operation_id inside a
--    subquery on operation_members, so Postgres resolved it to
--    m.operation_id = m.operation_id (always true). Bootstrap then fails as soon
--    as any membership row exists in the table.
--
-- Fix: atomic security-definer RPC + corrected policies.

-- ---------------------------------------------------------------------------
-- Atomic create: operation + first owner membership
-- ---------------------------------------------------------------------------

create or replace function public.create_operation(
  p_name text,
  p_address_line text default '',
  p_postal_code text default '',
  p_city text default ''
)
returns public.operations
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  new_op public.operations;
  trimmed_name text := trim(coalesce(p_name, ''));
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if trimmed_name = '' then
    raise exception 'Betriebsname ist erforderlich.';
  end if;

  insert into public.operations (
    name,
    address_line,
    postal_code,
    city,
    created_by
  )
  values (
    trimmed_name,
    trim(coalesce(p_address_line, '')),
    trim(coalesce(p_postal_code, '')),
    trim(coalesce(p_city, '')),
    uid
  )
  returning * into new_op;

  insert into public.operation_members (operation_id, user_id, role)
  values (new_op.id, uid, 'owner');

  return new_op;
end;
$$;

revoke all on function public.create_operation(text, text, text, text) from public;
grant execute on function public.create_operation(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- SELECT: members only (create_operation is SECURITY DEFINER and returns the
-- row without relying on invoker SELECT visibility)
-- ---------------------------------------------------------------------------

drop policy if exists "Members can view their operations" on public.operations;
create policy "Members can view their operations"
  on public.operations for select
  to authenticated
  using (public.is_operation_member(id));

-- ---------------------------------------------------------------------------
-- Membership bootstrap: qualify outer operation_id correctly
-- ---------------------------------------------------------------------------

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
        where o.id = operation_members.operation_id
          and o.created_by = auth.uid()
      )
      and not exists (
        select 1
        from public.operation_members m
        where m.operation_id = operation_members.operation_id
      )
    )
  );
