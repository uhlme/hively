-- Supabase Migration Schema for Bienen-Tracker

-- Enable UUID extension if needed (though client generates text keys, standardizing DB is good practice)
-- create extension if not exists "uuid-ossp";

-- 1. Hives Table (Bienenvölker)
create table if not exists public.hives (
    id text primary key,
    name text not null,
    queen_name text,
    queen_year integer,
    queen_color text,
    breed text,
    status text default 'Gesund'::text,
    notes text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS (Row Level Security) - recommended for Supabase
alter table public.hives enable row level security;
create policy "Allow public read access" on public.hives for select using (true);
create policy "Allow public insert" on public.hives for insert with check (true);
create policy "Allow public update" on public.hives for update using (true);
create policy "Allow public delete" on public.hives for delete using (true);

-- 2. Inspections Table (Durchsichten)
create table if not exists public.inspections (
    id text primary key,
    hive_id text references public.hives(id) on delete cascade not null,
    date date not null default current_date,
    feeding text,
    varroa text,
    brood_status text,
    honey_super text,
    temperament integer default 5,
    notes text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.inspections enable row level security;
create policy "Allow public read access" on public.inspections for select using (true);
create policy "Allow public insert" on public.inspections for insert with check (true);
create policy "Allow public update" on public.inspections for update using (true);
create policy "Allow public delete" on public.inspections for delete using (true);

-- 3. Finances Table (Ausgaben / Einnahmen)
create table if not exists public.finances (
    id text primary key,
    date date not null default current_date,
    description text not null,
    category text,
    price numeric(10, 2) not null,
    type text not null default 'expense'::text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.finances enable row level security;
create policy "Allow public read access" on public.finances for select using (true);
create policy "Allow public insert" on public.finances for insert with check (true);
create policy "Allow public update" on public.finances for update using (true);
create policy "Allow public delete" on public.finances for delete using (true);

-- 4. Honey Harvests Table (Honigernten)
create table if not exists public.honey_harvests (
    id text primary key,
    hive_id text references public.hives(id) on delete cascade not null,
    date date not null default current_date,
    amount numeric(6, 2) not null,
    type text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.honey_harvests enable row level security;
create policy "Allow public read access" on public.honey_harvests for select using (true);
create policy "Allow public insert" on public.honey_harvests for insert with check (true);
create policy "Allow public update" on public.honey_harvests for update using (true);
create policy "Allow public delete" on public.honey_harvests for delete using (true);
