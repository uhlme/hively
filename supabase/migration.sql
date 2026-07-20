-- See also: migration_operations.sql for multi-user Bienenbetrieb support
-- (operations, members, invites, operation_id RLS).

-- Supabase Migration Schema for Bienen-Tracker with Multi-User support

-- 1. Hives Table (Bienenvölker)
create table if not exists public.hives (
    id text primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    name text not null,
    queen_name text,
    queen_year integer,
    queen_color text,
    breed text,
    status text default 'Gesund'::text,
    notes text,
    brood_frames integer default 0,
    honey_frames_1 integer default 0,
    honey_frames_2 integer default 0,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS (Row Level Security)
alter table public.hives enable row level security;
create policy "Users can only select their own hives" on public.hives for select using (auth.uid() = user_id);
create policy "Users can only insert their own hives" on public.hives for insert with check (auth.uid() = user_id);
create policy "Users can only update their own hives" on public.hives for update using (auth.uid() = user_id);
create policy "Users can only delete their own hives" on public.hives for delete using (auth.uid() = user_id);

-- 2. Inspections Table (Durchsichten)
create table if not exists public.inspections (
    id text primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    hive_id text references public.hives(id) on delete cascade not null,
    date date not null default current_date,
    feeding text,
    varroa text,
    brood_status text,
    honey_super text,
    temperament integer default 5,
    weather_temp numeric(5, 2),
    weather_condition text,
    notes text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.inspections enable row level security;
create policy "Users can only select their own inspections" on public.inspections for select using (auth.uid() = user_id);
create policy "Users can only insert their own inspections" on public.inspections for insert with check (auth.uid() = user_id);
create policy "Users can only update their own inspections" on public.inspections for update using (auth.uid() = user_id);
create policy "Users can only delete their own inspections" on public.inspections for delete using (auth.uid() = user_id);

-- 3. Finances Table (Ausgaben / Einnahmen)
create table if not exists public.finances (
    id text primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    date date not null default current_date,
    description text not null,
    category text,
    price numeric(10, 2) not null,
    type text not null default 'expense'::text,
    hive_id text references public.hives(id) on delete set null,
    sponsor_name text,
    notes text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.finances enable row level security;
create policy "Users can only select their own finances" on public.finances for select using (auth.uid() = user_id);
create policy "Users can only insert their own finances" on public.finances for insert with check (auth.uid() = user_id);
create policy "Users can only update their own finances" on public.finances for update using (auth.uid() = user_id);
create policy "Users can only delete their own finances" on public.finances for delete using (auth.uid() = user_id);

-- 4. Honey Harvests Table (Honigernten)
create table if not exists public.honey_harvests (
    id text primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    hive_id text references public.hives(id) on delete cascade not null,
    date date not null default current_date,
    amount numeric(6, 2) not null,
    type text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.honey_harvests enable row level security;
create policy "Users can only select their own honey harvests" on public.honey_harvests for select using (auth.uid() = user_id);
create policy "Users can only insert their own honey harvests" on public.honey_harvests for insert with check (auth.uid() = user_id);
create policy "Users can only update their own honey harvests" on public.honey_harvests for update using (auth.uid() = user_id);
create policy "Users can only delete their own honey harvests" on public.honey_harvests for delete using (auth.uid() = user_id);

-- 5. Incremental ALTER statements for existing deployments
-- (safe to re-run: IF NOT EXISTS where supported, otherwise ignore duplicate-column errors)
alter table public.inspections add column if not exists weather_temp numeric(5, 2);
alter table public.inspections add column if not exists weather_condition text;
alter table public.finances add column if not exists notes text;
