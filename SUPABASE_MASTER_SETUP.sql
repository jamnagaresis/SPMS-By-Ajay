-- ================================================================
-- SUPABASE MASTER SETUP SCRIPT
-- Project: IT Tax Analyzer (SPMS)
-- Created: 2026-02-13
-- Author: Ajay Ambaliya (Senior Clerk)
-- ================================================================
-- This script sets up the entire database architecture for a new project.
-- Run this in the Supabase SQL Editor once.
-- ================================================================

-- 0. ENABLE EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ROLE MANAGEMENT (profiles table)
-- Stores extra user data and roles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users NOT NULL PRIMARY KEY,
  email text,
  role text DEFAULT 'admin', -- 'admin' by default as this is an internal clerk tool
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (new.id, new.email, 'admin');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 2. EMPLOYEE METADATA (employees table)
-- Stores the mapping between raw names and clean names, PAN, and HRPN
CREATE TABLE IF NOT EXISTS public.employees (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  hrpn text UNIQUE,                           -- 8-digit HR Payroll Number
  original_name text NOT NULL UNIQUE,         -- Raw name from PDF
  corrected_name text NOT NULL,               -- Clean display name
  pan_number text,                            -- PAN Card Number
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Partial index for HRPN to allow nulls but enforce uniqueness when present
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_hrpn 
  ON public.employees(hrpn) WHERE hrpn IS NOT NULL;

-- 3. PAYROLL DATA (payroll_records table)
-- Stores detailed monthly payroll data extracted from PDFs
CREATE TABLE IF NOT EXISTS public.payroll_records (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  
  -- === EMPLOYEE IDENTIFICATION ===
  hrpn text NOT NULL,                        -- 8-digit HR Payroll Number (links to employees)
  name text NOT NULL,                        -- Name from PDF
  designation text,                          -- Job designation
  
  -- === MONTH TRACKING ===
  month_year text NOT NULL,                  -- "January-2026"
  month_date date NOT NULL,                  -- "2026-01-01" (for sorting/queries)
  
  -- === EARNING FIELDS ===
  basic numeric DEFAULT 0,
  da numeric DEFAULT 0,
  hra numeric DEFAULT 0,
  cla numeric DEFAULT 0,
  med_allow numeric DEFAULT 0,
  trans_allow numeric DEFAULT 0,
  book_allow numeric DEFAULT 0,
  npp_allow numeric DEFAULT 0,
  esis_allow numeric DEFAULT 0,
  special_pay numeric DEFAULT 0,
  washing_allow numeric DEFAULT 0,
  nursing_allow numeric DEFAULT 0,
  uniform_allow numeric DEFAULT 0,
  recovery_of_pay numeric DEFAULT 0,
  slo numeric DEFAULT 0,
  
  -- === DEDUCTION FIELDS ===
  income_tax numeric DEFAULT 0,
  prof_tax numeric DEFAULT 0,
  gpf_reg numeric DEFAULT 0,
  gpf_class4 numeric DEFAULT 0,
  nps_reg numeric DEFAULT 0,
  rnb numeric DEFAULT 0,
  govt_fund numeric DEFAULT 0,
  govt_saving numeric DEFAULT 0,
  
  -- === SUMMARY FIELDS ===
  gross numeric DEFAULT 0,
  total_ded numeric DEFAULT 0,
  net_pay numeric DEFAULT 0,
  
  -- === METADATA ===
  source_files text[],                       -- Array of PDF filenames
  bill_no text,                              -- Bill number from PDF
  office text,                               -- Office name from PDF
  uploaded_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  -- UNIQUE CONSTRAINT: One record per employee per month
  UNIQUE(hrpn, month_date)
);

-- 4. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_payroll_hrpn ON public.payroll_records(hrpn);
CREATE INDEX IF NOT EXISTS idx_payroll_month ON public.payroll_records(month_date);
CREATE INDEX IF NOT EXISTS idx_employees_name ON public.employees(corrected_name);

-- 5. UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

CREATE OR REPLACE TRIGGER update_payroll_records_updated_at
  BEFORE UPDATE ON public.payroll_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. SECURITY: ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;

-- Generic Policy: Allow authenticated users full access
-- This is an internal tool, so authenticated users (administrators) get full control.
CREATE POLICY "Allow authenticated access to profiles" 
  ON public.profiles FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated access to employees" 
  ON public.employees FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated access to payroll" 
  ON public.payroll_records FOR ALL USING (auth.role() = 'authenticated');

-- ================================================================
-- SETUP COMPLETE
-- ================================================================
-- INSTRUCTIONS:
-- 1. Create a new Supabase Project.
-- 2. Go to SQL Editor.
-- 3. Paste and Run this script.
-- 4. Go to Authentication -> Users -> Add User to create your first admin account.
-- 5. Use the provided credentials to login to the application.
-- ================================================================
