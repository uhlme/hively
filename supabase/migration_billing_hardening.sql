-- Billing hardening (apply after migration_billing_stripe.sql)
-- 1) Force free plan on INSERT (clients must not self-upgrade)
-- 2) Optional DB gate for Pro-required writes / invites
-- 3) Wire operation_has_pro into can_edit_operation + invite policies

-- App setting: when true, cloud writes (via can_edit_operation) and invite
-- create/update require Pro. Disable for staging without Stripe:
--   update public.app_settings set value = 'false' where key = 'billing_gates_enabled';
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.app_settings enable row level security;

drop policy if exists "Authenticated can read app_settings" on public.app_settings;
create policy "Authenticated can read app_settings"
  on public.app_settings for select
  to authenticated
  using (true);

insert into public.app_settings (key, value)
values ('billing_gates_enabled', 'false')
on conflict (key) do nothing;

create or replace function public.billing_gates_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select lower(s.value) in ('true', '1', 'yes')
      from public.app_settings s
      where s.key = 'billing_gates_enabled'
    ),
    false
  );
$$;

revoke all on function public.billing_gates_enabled() from public;
grant execute on function public.billing_gates_enabled() to authenticated;

create or replace function public.protect_operation_billing_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return NEW;
  end if;

  if TG_OP = 'UPDATE' then
    NEW.plan := OLD.plan;
    NEW.plan_status := OLD.plan_status;
    NEW.plan_interval := OLD.plan_interval;
    NEW.plan_period_end := OLD.plan_period_end;
    NEW.stripe_customer_id := OLD.stripe_customer_id;
    NEW.stripe_subscription_id := OLD.stripe_subscription_id;
  elsif TG_OP = 'INSERT' then
    NEW.plan := 'free';
    NEW.plan_status := 'none';
    NEW.plan_interval := null;
    NEW.plan_period_end := null;
    NEW.stripe_customer_id := null;
    NEW.stripe_subscription_id := null;
  end if;

  return NEW;
end;
$$;

-- Cloud domain writes require Pro when billing gates are on
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
  )
  and (
    not public.billing_gates_enabled()
    or public.operation_has_pro(op_id)
  );
$$;

revoke all on function public.can_edit_operation(uuid) from public;
grant execute on function public.can_edit_operation(uuid) to authenticated;

-- Invites: create/update require owner + Pro (when gates on)
drop policy if exists "Owners can create invites" on public.operation_invites;
create policy "Owners can create invites"
  on public.operation_invites for insert
  to authenticated
  with check (
    public.is_operation_owner(operation_id)
    and created_by = auth.uid()
    and (
      not public.billing_gates_enabled()
      or public.operation_has_pro(operation_id)
    )
  );

drop policy if exists "Owners can update invites" on public.operation_invites;
create policy "Owners can update invites"
  on public.operation_invites for update
  to authenticated
  using (
    public.is_operation_owner(operation_id)
    and (
      not public.billing_gates_enabled()
      or public.operation_has_pro(operation_id)
    )
  )
  with check (
    public.is_operation_owner(operation_id)
    and (
      not public.billing_gates_enabled()
      or public.operation_has_pro(operation_id)
    )
  );
