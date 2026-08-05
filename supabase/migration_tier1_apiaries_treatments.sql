-- Tier 1: apiaries, treatments, inspection checklist (JSONB)
-- Apply in Supabase SQL editor / migration pipeline after existing operation migrations.

-- ---------------------------------------------------------------------------
-- Apiaries (Bienenstände) — belong to a Betrieb (operation)
-- ---------------------------------------------------------------------------
create table if not exists public.apiaries (
  id text primary key,
  name text not null,
  notes text,
  user_id uuid references auth.users(id) on delete set null,
  operation_id uuid references public.operations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.apiaries enable row level security;

create index if not exists apiaries_operation_id_idx on public.apiaries(operation_id);

drop policy if exists "Members can select operation apiaries" on public.apiaries;
create policy "Members can select operation apiaries"
  on public.apiaries for select to authenticated
  using (public.is_operation_member(operation_id));

drop policy if exists "Editors can insert operation apiaries" on public.apiaries;
create policy "Editors can insert operation apiaries"
  on public.apiaries for insert to authenticated
  with check (public.can_edit_operation(operation_id) and created_by = auth.uid());

drop policy if exists "Editors can update operation apiaries" on public.apiaries;
create policy "Editors can update operation apiaries"
  on public.apiaries for update to authenticated
  using (public.can_edit_operation(operation_id))
  with check (public.can_edit_operation(operation_id));

drop policy if exists "Owners can delete operation apiaries" on public.apiaries;
create policy "Owners can delete operation apiaries"
  on public.apiaries for delete to authenticated
  using (public.is_operation_owner(operation_id));

-- ---------------------------------------------------------------------------
-- Hives: link to apiary
-- ---------------------------------------------------------------------------
alter table public.hives
  add column if not exists apiary_id text references public.apiaries(id) on delete set null;

create index if not exists hives_apiary_id_idx on public.hives(apiary_id);

-- ---------------------------------------------------------------------------
-- Inspections: structured checklist (JSONB)
-- ---------------------------------------------------------------------------
alter table public.inspections
  add column if not exists checklist jsonb;

-- ---------------------------------------------------------------------------
-- Treatments (Behandlungen)
-- ---------------------------------------------------------------------------
create table if not exists public.treatments (
  id text primary key,
  hive_ids jsonb not null default '[]'::jsonb,
  apiary_id text references public.apiaries(id) on delete set null,
  date_start date not null,
  date_end date,
  disease text not null default 'varroa',
  product_id text,
  product_label text,
  dose text,
  phi_days numeric,
  harvest_blocked_until date,
  status text not null default 'active',
  notes text,
  user_id uuid references auth.users(id) on delete set null,
  operation_id uuid references public.operations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint treatments_status_check check (status in ('active', 'done', 'cancelled'))
);

alter table public.treatments enable row level security;

create index if not exists treatments_operation_id_idx on public.treatments(operation_id);
create index if not exists treatments_status_idx on public.treatments(status);

drop policy if exists "Members can select operation treatments" on public.treatments;
create policy "Members can select operation treatments"
  on public.treatments for select to authenticated
  using (public.is_operation_member(operation_id));

drop policy if exists "Editors can insert operation treatments" on public.treatments;
create policy "Editors can insert operation treatments"
  on public.treatments for insert to authenticated
  with check (public.can_edit_operation(operation_id) and created_by = auth.uid());

drop policy if exists "Editors can update operation treatments" on public.treatments;
create policy "Editors can update operation treatments"
  on public.treatments for update to authenticated
  using (public.can_edit_operation(operation_id))
  with check (public.can_edit_operation(operation_id));

drop policy if exists "Editors can delete operation treatments" on public.treatments;
create policy "Editors can delete operation treatments"
  on public.treatments for delete to authenticated
  using (public.can_edit_operation(operation_id));
