-- Add gross_pay to monthly_records
ALTER TABLE public.monthly_records 
ADD COLUMN IF NOT EXISTS gross_pay numeric default 0;

-- Instructions:
-- 1. Go to Supabase SQL Editor
-- 2. Paste this code and Run
