-- ================================================================
-- PAYROLL RECORDS TABLE — Full Payroll Data from PDF Parser
-- ================================================================
-- Run this in your Supabase SQL Editor
-- This stores ALL extracted data from payroll PDFs per employee per month

-- Drop if exists (be careful in production!)
-- DROP TABLE IF EXISTS public.payroll_records;

CREATE TABLE IF NOT EXISTS public.payroll_records (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  
  -- === EMPLOYEE IDENTIFICATION ===
  hrpn text NOT NULL,                        -- 8-digit HR Payroll Number (primary identifier)
  name text NOT NULL,                        -- Full name from PDF
  designation text,                          -- Job designation

  -- === MONTH TRACKING ===
  month_year text NOT NULL,                  -- "January-2026" format from PDF
  month_date date NOT NULL,                  -- Standardized date: YYYY-MM-01

  -- === EARNING FIELDS ===
  basic numeric DEFAULT 0,                   -- Basic Pay
  da numeric DEFAULT 0,                      -- Dearness Allowance (0103)
  hra numeric DEFAULT 0,                     -- House Rent Allowance (0110)
  cla numeric DEFAULT 0,                     -- City Level Allowance (0111)
  med_allow numeric DEFAULT 0,               -- Medical Allowance (0107)
  trans_allow numeric DEFAULT 0,             -- Transport Allowance (0113)
  book_allow numeric DEFAULT 0,              -- Book Allowance (0104)
  npp_allow numeric DEFAULT 0,              -- Non Private Practice Allowance (0128)
  esis_allow numeric DEFAULT 0,              -- ESIS Allowance (0127)
  special_pay numeric DEFAULT 0,             -- Special Additional Pay
  washing_allow numeric DEFAULT 0,           -- Washing Allowance (0132)
  nursing_allow numeric DEFAULT 0,           -- Nursing Allowance (0129)
  uniform_allow numeric DEFAULT 0,           -- Uniform Allowance (0131)
  recovery_of_pay numeric DEFAULT 0,         -- Recovery of Pay (can be negative)
  slo numeric DEFAULT 0,                     -- SLO

  -- === DEDUCTION FIELDS ===
  income_tax numeric DEFAULT 0,              -- Income Tax (9510)
  prof_tax numeric DEFAULT 0,                -- Professional Tax (9570)
  gpf_reg numeric DEFAULT 0,                 -- GPF Regular (9670)
  gpf_class4 numeric DEFAULT 0,              -- GPF Class 4 (9531)
  nps_reg numeric DEFAULT 0,                 -- NPS Regular (9534)
  rnb numeric DEFAULT 0,                     -- R&B (9550)
  govt_fund numeric DEFAULT 0,               -- Government Fund (9581)
  govt_saving numeric DEFAULT 0,             -- Government Saving (9582)

  -- === SUMMARY FIELDS ===
  gross numeric DEFAULT 0,                   -- Gross Earning Amount
  total_ded numeric DEFAULT 0,               -- Total Deductions
  net_pay numeric DEFAULT 0,                 -- Net Pay

  -- === METADATA ===
  source_files text[],                       -- Array of PDF filenames used
  bill_no text,                              -- Bill number from PDF
  office text,                               -- Office name from PDF
  uploaded_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- === UNIQUE CONSTRAINT: One record per employee per month ===
  UNIQUE(hrpn, month_date)
);

-- === INDEXES for fast queries ===
CREATE INDEX IF NOT EXISTS idx_payroll_hrpn ON public.payroll_records(hrpn);
CREATE INDEX IF NOT EXISTS idx_payroll_month ON public.payroll_records(month_date);
CREATE INDEX IF NOT EXISTS idx_payroll_name ON public.payroll_records(name);

-- === ENABLE ROW LEVEL SECURITY ===
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;

-- === POLICY: Allow authenticated users full access ===
DROP POLICY IF EXISTS "Allow authenticated access" ON public.payroll_records;
CREATE POLICY "Allow authenticated access" ON public.payroll_records 
  FOR ALL USING (auth.role() = 'authenticated');

-- === UPDATED_AT TRIGGER ===
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_payroll_records_updated_at ON public.payroll_records;
CREATE TRIGGER update_payroll_records_updated_at
  BEFORE UPDATE ON public.payroll_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================================
-- INSTRUCTIONS:
-- 1. Go to Supabase SQL Editor (https://app.supabase.com)
-- 2. Paste this entire script and click "Run"
-- 3. Verify the table appears under Table Editor
-- ================================================================
