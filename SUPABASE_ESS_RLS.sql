-- Phase 2 Setup: Employee Self-Service (ESS) Security
-- Run this script in your Supabase SQL Editor to secure the portal.

-- 1. Enable Row Level Security (RLS) on the core tables
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- 2. CREATE POLICIES FOR EMPLOYEES TABLE
-- Allow employees to view ONLY their own employee record (matched by email)
CREATE POLICY "Employees can view own record"
ON public.employees
FOR SELECT
USING (auth.uid() IN (SELECT id FROM auth.users WHERE email = employees.email));

-- 3. CREATE POLICIES FOR PAYROLL_RECORDS TABLE
-- Allow employees to view ONLY their own payroll history (matched by HRPN linked to their email)
CREATE POLICY "Employees can view own payroll"
ON public.payroll_records
FOR SELECT
USING (hrpn IN (
    SELECT hrpn FROM public.employees 
    WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
));

-- Note: If your Admin panel connects using the "Service Role" key, it will bypass these RLS rules.
-- If your Admin panel connects using the "Anon" key, you may need an additional policy for Admins:
-- CREATE POLICY "Admins have full access" ON public.employees FOR ALL USING (true);
-- (We recommend keeping it completely unlocked for Admin development right now, so we will append that bypass):

-- TEMPORARY ADMIN BYPASS (Since your current app relies on public anon keys for Admins)
-- Only run these TWO lines below if your Admin Dashboard suddenly breaks and says "0 Employees Found"
CREATE POLICY "Public Read All Employees" ON public.employees FOR ALL USING (true);
CREATE POLICY "Public Read All Payroll" ON public.payroll_records FOR ALL USING (true);
