-- ================================================================
-- FIXED MERGE SCRIPT - HANDLES UNIQUE CONSTRAINT
-- ================================================================

-- 1. Create a temporary table to store the merges we want to perform
CREATE TEMP TABLE merch_candidates AS
SELECT 
    old_emp.id AS old_id,
    new_emp.id AS new_id,
    new_emp.hrpn AS hrpn_to_copy,
    new_emp.original_name AS original_name_to_copy
FROM employees old_emp
JOIN employees new_emp 
    ON LOWER(REPLACE(REPLACE(REPLACE(REPLACE(old_emp.corrected_name, ' ', ''), '.', ''), ',', ''), '''', ''))
     = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(new_emp.corrected_name, ' ', ''), '.', ''), ',', ''), '''', ''))
WHERE old_emp.id != new_emp.id
  AND old_emp.pan_number IS NOT NULL      -- Old record has PAN
  AND (old_emp.hrpn IS NULL OR old_emp.hrpn = '') -- But no HRPN
  AND new_emp.hrpn IS NOT NULL            -- New record has HRPN
  AND new_emp.hrpn != ''
  AND (new_emp.pan_number IS NULL OR new_emp.pan_number = ''); -- But no PAN

-- 2. Delete the NEW records (the duplicates) first to free up the HRPN
DELETE FROM employees
WHERE id IN (SELECT new_id FROM merch_candidates);

-- 3. Update the OLD records with the HRPN from the deleted records
UPDATE employees
SET 
    hrpn = mc.hrpn_to_copy,
    original_name = COALESCE(NULLIF(employees.original_name, employees.corrected_name), mc.original_name_to_copy)
FROM merch_candidates mc
WHERE employees.id = mc.old_id;

-- 4. Clean up
DROP TABLE merch_candidates;

-- ================================================================
-- PART 2: Try matching via 'original_name' (Fallback for tricky names)
-- ================================================================

CREATE TEMP TABLE merch_candidates_v2 AS
SELECT 
    old_emp.id AS old_id,
    new_emp.id AS new_id,
    new_emp.hrpn AS hrpn_to_copy
FROM employees old_emp
JOIN employees new_emp 
    ON LOWER(REPLACE(REPLACE(REPLACE(REPLACE(old_emp.original_name, ' ', ''), '.', ''), ',', ''), '''', ''))
     = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(new_emp.original_name, ' ', ''), '.', ''), ',', ''), '''', ''))
WHERE old_emp.id != new_emp.id
  AND old_emp.pan_number IS NOT NULL 
  AND (old_emp.hrpn IS NULL OR old_emp.hrpn = '')
  AND new_emp.hrpn IS NOT NULL 
  AND new_emp.hrpn != ''
  AND (new_emp.pan_number IS NULL OR new_emp.pan_number = '');

DELETE FROM employees
WHERE id IN (SELECT new_id FROM merch_candidates_v2);

UPDATE employees
SET hrpn = mc.hrpn_to_copy
FROM merch_candidates_v2 mc
WHERE employees.id = mc.old_id;

DROP TABLE merch_candidates_v2;

-- ================================================================
-- FINAL CHECK
-- ================================================================
SELECT 
    COUNT(*) as total_employees, 
    COUNT(hrpn) as with_hrpn, 
    COUNT(pan_number) as with_pan 
FROM employees;
