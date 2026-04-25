-- Phase 4: Tax Declarations & Approval Workflow
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.tax_declarations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    hrpn text NOT NULL,
    financial_year text NOT NULL,
    
    -- Declarations
    hra_exemption numeric DEFAULT 0,
    home_loan_interest numeric DEFAULT 0,
    section_80c numeric DEFAULT 0,
    section_80d numeric DEFAULT 0,
    other_deductions numeric DEFAULT 0,
    
    -- Workflow state
    status text DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    admin_notes text,
    
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- One declaration per employee per financial year
    UNIQUE(hrpn, financial_year)
);

CREATE INDEX IF NOT EXISTS idx_tax_dec_hrpn ON public.tax_declarations(hrpn);
CREATE INDEX IF NOT EXISTS idx_tax_dec_status ON public.tax_declarations(status);

-- Enable RLS
ALTER TABLE public.tax_declarations ENABLE ROW LEVEL SECURITY;

-- Employee Access Rules
CREATE POLICY "Employees can view own declarations"
ON public.tax_declarations FOR SELECT
USING (hrpn IN (SELECT hrpn FROM public.employees WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())));

CREATE POLICY "Employees can insert own declarations"
ON public.tax_declarations FOR INSERT
WITH CHECK (hrpn IN (SELECT hrpn FROM public.employees WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())));

CREATE POLICY "Employees can update own pending declarations"
ON public.tax_declarations FOR UPDATE
USING (hrpn IN (SELECT hrpn FROM public.employees WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())))
WITH CHECK (hrpn IN (SELECT hrpn FROM public.employees WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())));

-- Admin Bypass (Based on our current Anonymous Admin permissions setup)
CREATE POLICY "Public Read/Write All Declarations" ON public.tax_declarations FOR ALL USING (true);
