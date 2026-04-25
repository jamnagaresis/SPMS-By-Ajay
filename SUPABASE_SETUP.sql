-- Enable UUID extension if not enabled
create extension if not exists "uuid-ossp";

-- 1. Create Profiles Table (for Role Management)
create table public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  role text default 'user', -- 'admin' or 'user'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Trigger to create profile on signup
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'admin'); -- Defaulting to admin for simplicity as you are the main user
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Create Employees Table (Mapping Database)
create table public.employees (
  id uuid default uuid_generate_v4() primary key,
  original_name text not null unique, -- The raw name from Excel (Dr.ChiragBPandya)
  corrected_name text not null,       -- The clean name (Dr. Chirag B. Pandya)
  pan_number text,                    -- PAN Card Number
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Create Monthly Records Table (Actual Data Store)
create table public.monthly_records (
  id uuid default uuid_generate_v4() primary key,
  employee_id uuid references public.employees(id),
  month_date date not null,           -- E.g., '2025-01-01' for Jan 2025
  designation text,
  income_tax numeric default 0,
  net_pay numeric default 0,
  source_file text,
  raw_name_snapshot text,             -- Keep track of what name was used during import
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  -- Constraint to avoid duplicate entries for same month? Maybe allow multiple files?
  -- Let's keep it flexible for now.
  unique(employee_id, month_date, source_file) 
);

-- 4. Enable Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.employees enable row level security;
alter table public.monthly_records enable row level security;

-- 5. Create Policies (Allow authenticated users full access for this internal tool)
create policy "Allow generic access" on public.profiles for all using (auth.role() = 'authenticated');
create policy "Allow generic access" on public.employees for all using (auth.role() = 'authenticated');
create policy "Allow generic access" on public.monthly_records for all using (auth.role() = 'authenticated');

-- Instructions:
-- 1. Go to Supabase SQL Editor
-- 2. Paste this code and Run
-- 3. Go to Authentication -> Users -> Add User (email/password) to create your admin account.
