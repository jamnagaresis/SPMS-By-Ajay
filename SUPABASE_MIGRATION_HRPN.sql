-- ================================================================
-- ADD HRPN to employees TABLE
-- ================================================================
-- Run this in Supabase SQL Editor AFTER the initial SUPABASE_SETUP.sql

-- Add HRPN column to employees
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS hrpn text;

-- Create unique index on HRPN (nullable, so partial index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_hrpn 
  ON public.employees(hrpn) WHERE hrpn IS NOT NULL;

-- ================================================================
-- INSTRUCTIONS:
-- 1. Go to Supabase SQL Editor
-- 2. Run this migration
-- 3. This adds 'hrpn' to your employees table so payroll records
--    can be linked via HRPN number
-- ================================================================
