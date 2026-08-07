-- Stripe Pro billing on operations (owner pays for the Betrieb)
-- Apply after migration_operations.sql

alter table public.operations
  add column if not exists plan text not null default 'free',
  add column if not exists plan_status text not null default 'none',
  add column if not exists plan_interval text,
  add column if not exists plan_period_end timestamptz,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

alter table public.operations
  drop constraint if exists operations_plan_check;
alter table public.operations
  add constraint operations_plan_check
  check (plan in ('free', 'pro'));

alter table public.operations
  drop constraint if exists operations_plan_status_check;
alter table public.operations
  add constraint operations_plan_status_check
  check (plan_status in ('none', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete'));

alter table public.operations
  drop constraint if exists operations_plan_interval_check;
alter table public.operations
  add constraint operations_plan_interval_check
  check (plan_interval is null or plan_interval in ('month', 'year'));

create unique index if not exists operations_stripe_customer_id_uidx
  on public.operations (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists operations_stripe_subscription_id_uidx
  on public.operations (stripe_subscription_id)
  where stripe_subscription_id is not null;

comment on column public.operations.plan is 'Product plan: free | pro';
comment on column public.operations.plan_status is 'Stripe subscription status mapped for the Betrieb';

-- Members may read plan fields via existing SELECT policy on operations.

create or replace function public.operation_has_pro(p_operation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.operations o
    where o.id = p_operation_id
      and o.plan = 'pro'
      and o.plan_status in ('active', 'trialing', 'past_due')
      and (o.plan_period_end is null or o.plan_period_end > now())
  );
$$;

revoke all on function public.operation_has_pro(uuid) from public;
grant execute on function public.operation_has_pro(uuid) to authenticated;

-- Prevent clients from self-upgrading billing columns (service_role may write).
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
    NEW.plan := coalesce(NEW.plan, 'free');
    NEW.plan_status := coalesce(NEW.plan_status, 'none');
    NEW.plan_interval := null;
    NEW.plan_period_end := null;
    NEW.stripe_customer_id := null;
    NEW.stripe_subscription_id := null;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_protect_operation_billing on public.operations;
create trigger trg_protect_operation_billing
  before insert or update on public.operations
  for each row
  execute function public.protect_operation_billing_columns();
