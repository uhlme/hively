-- Tighten operations SELECT: members only.
-- create_operation is SECURITY DEFINER and does not need creator SELECT bypass.
-- Apply after migration_fix_create_operation_rls.sql if that temporarily
-- widened SELECT with created_by = auth.uid().

drop policy if exists "Members can view their operations" on public.operations;
create policy "Members can view their operations"
  on public.operations for select
  to authenticated
  using (public.is_operation_member(id));
