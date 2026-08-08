-- Track Stripe cancel_at_period_end for Settings subscription status copy.
-- Apply after migration_billing_stripe.sql / migration_billing_hardening.sql

alter table public.operations
  add column if not exists plan_cancel_at_period_end boolean not null default false;

comment on column public.operations.plan_cancel_at_period_end is
  'True when Stripe subscription is set to end after the current period (Portal cancel).';

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
    NEW.plan_cancel_at_period_end := OLD.plan_cancel_at_period_end;
    NEW.stripe_customer_id := OLD.stripe_customer_id;
    NEW.stripe_subscription_id := OLD.stripe_subscription_id;
  elsif TG_OP = 'INSERT' then
    NEW.plan := 'free';
    NEW.plan_status := 'none';
    NEW.plan_interval := null;
    NEW.plan_period_end := null;
    NEW.plan_cancel_at_period_end := false;
    NEW.stripe_customer_id := null;
    NEW.stripe_subscription_id := null;
  end if;

  return NEW;
end;
$$;
