-- Phase 1 Migration: Add employee emails and set up ESS
-- Run this in the Supabase SQL Editor

-- 1. Add email column to employees tracking table
ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS email text UNIQUE;

-- 2. Optional: enable RLS to prepare for secure employee login
-- ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;

-- 3. Optional: Create RLS policy for employee portal
-- CREATE POLICY "Employees can only view their own payroll" 
-- ON public.payroll_records FOR SELECT 
-- USING (auth.uid() IN (
--   SELECT id FROM auth.users WHERE email IN (
--     SELECT email FROM public.employees WHERE hrpn = payroll_records.hrpn
--   )
-- ));
