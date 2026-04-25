export interface TaxInput {
    grossSalary: number;
    // Common
    professionalTax: number;
    // Old Regime Specific Deductions
    hraExemption: number;
    homeLoanInterest: number; // Section 24(b) - Max 2L
    // Chapter VI-A Deductions
    section80C: number; // GPF, LIC, PPF, ELSS, SSY, etc - Max 1.5L
    section80CCD1B: number; // NPS Extra - Max 50K
    section80D: number; // Health Insurance
    otherDeductions: number; // 80G, 80E, etc
}

export interface TaxOutput {
    grossSalary: number;
    standardDeduction: number;
    totalDeductionsAllowed: number;
    taxableIncome: number;
    taxBeforeRebate: number;
    rebate87A: number;
    marginalRelief: number;
    taxAfterRebate: number;
    healthAndEducationCess: number;
    totalTaxLiability: number;
    regimeName: string;
    // Breakdown for Form 16
    hraExemption: number;
    professionalTax: number;
    homeLoanInterest: number;
    section80C: number;
    section80CCD1B: number;
    section80D: number;
    otherDeductions: number;
}

export const calculateOldRegime = (input: TaxInput): TaxOutput => {
    // 1. Gross Salary
    let gross = input.grossSalary;

    // 2. Allowances & Standard Deduction
    const standardDeduction = 50000;
    const hraAllowable = input.hraExemption;
    const profTax = input.professionalTax;

    let salaryIncome = gross - standardDeduction - hraAllowable - profTax;
    if (salaryIncome < 0) salaryIncome = 0;

    // 3. House Property Income (Loss from Home Loan Interest)
    const homeLoanRelief = Math.min(input.homeLoanInterest, 200000);
    let grossTotalIncome = salaryIncome - homeLoanRelief;
    if (grossTotalIncome < 0) grossTotalIncome = 0;

    // 4. Chapter VI-A Deductions
    const sec80C = Math.min(input.section80C, 150000);
    const sec80CCD1B = Math.min(input.section80CCD1B, 50000);
    const sec80D = input.section80D;
    const others = input.otherDeductions;

    const totalDeductionsVIA = sec80C + sec80CCD1B + sec80D + others;

    let taxableIncome = grossTotalIncome - totalDeductionsVIA;
    if (taxableIncome < 0) taxableIncome = 0;

    // Round off
    taxableIncome = Math.round(taxableIncome / 10) * 10;

    // 5. Calculate Tax (FY 2024-25 Old Regime - Age < 60)
    let tax = 0;
    if (taxableIncome > 1000000) {
        tax += (taxableIncome - 1000000) * 0.30;
        tax += 500000 * 0.20; // 5L to 10L
        tax += 250000 * 0.05; // 2.5L to 5L
    } else if (taxableIncome > 500000) {
        tax += (taxableIncome - 500000) * 0.20;
        tax += 250000 * 0.05;
    } else if (taxableIncome > 250000) {
        tax += (taxableIncome - 250000) * 0.05;
    }

    // 6. Rebate 87A (Up to 5L)
    let rebate = 0;
    if (taxableIncome <= 500000) {
        rebate = Math.min(tax, 12500);
    }

    let taxAfterRebate = tax - rebate;
    if (taxAfterRebate < 0) taxAfterRebate = 0;

    // 7. Health & Education Cess (4%)
    const cess = Math.round(taxAfterRebate * 0.04);
    const totalTax = taxAfterRebate + cess;

    return {
        grossSalary: gross,
        standardDeduction: standardDeduction,
        totalDeductionsAllowed: hraAllowable + profTax + homeLoanRelief + totalDeductionsVIA,
        taxableIncome: taxableIncome,
        taxBeforeRebate: tax,
        rebate87A: rebate,
        marginalRelief: 0,
        taxAfterRebate: taxAfterRebate,
        healthAndEducationCess: cess,
        totalTaxLiability: totalTax,
        regimeName: "Old Tax Regime",
        // Breakdown
        hraExemption: hraAllowable,
        professionalTax: profTax,
        homeLoanInterest: homeLoanRelief,
        section80C: sec80C,
        section80CCD1B: sec80CCD1B,
        section80D: sec80D,
        otherDeductions: others
    };
};

export const calculateNewRegime = (input: TaxInput): TaxOutput => {
    // 1. Gross Salary
    let gross = input.grossSalary;

    // 2. Standard Deduction (Increased to 75,000 for FY 24-25)
    // Note: Prof Tax, HRA, 80C, 80D, 24(b) are NOT ALLOWED in New Regime (except 80CCD(2) which is employer side).
    const standardDeduction = 75000;

    let taxableIncome = gross - standardDeduction;
    if (taxableIncome < 0) taxableIncome = 0;

    // Round off
    taxableIncome = Math.round(taxableIncome / 10) * 10;

    // 3. Calculate Tax
    let tax = 0;
    if (taxableIncome > 1500000) {
        tax += (taxableIncome - 1500000) * 0.30;
        tax += 300000 * 0.20; // 12L-15L
        tax += 200000 * 0.15; // 10L-12L
        tax += 300000 * 0.10; // 7L-10L
        tax += 400000 * 0.05; // 3L-7L
    } else if (taxableIncome > 1200000) {
        tax += (taxableIncome - 1200000) * 0.20;
        tax += 200000 * 0.15;
        tax += 300000 * 0.10;
        tax += 400000 * 0.05;
    } else if (taxableIncome > 1000000) {
        tax += (taxableIncome - 1000000) * 0.15;
        tax += 300000 * 0.10;
        tax += 400000 * 0.05;
    } else if (taxableIncome > 700000) {
        tax += (taxableIncome - 700000) * 0.10;
        tax += 400000 * 0.05;
    } else if (taxableIncome > 300000) {
        tax += (taxableIncome - 300000) * 0.05;
    }

    // 4. Rebate 87A (Threshold is 7L, Max Rebate 25k) & Marginal Relief
    let rebate = 0;
    let marginalRelief = 0;

    if (taxableIncome <= 700000) {
        rebate = Math.min(tax, 25000);
    } else if (taxableIncome > 700000) {
        // Marginal Relief for New Regime:
        // Tax payable should not exceed Income earned above 7,00,000
        const incomeAbove7L = taxableIncome - 700000;
        if (tax > incomeAbove7L) {
            marginalRelief = tax - incomeAbove7L;
        }
    }

    let taxAfterRebate = tax - rebate - marginalRelief;
    if (taxAfterRebate < 0) taxAfterRebate = 0;

    // 5. Cess
    const cess = Math.round(taxAfterRebate * 0.04);
    const totalTax = taxAfterRebate + cess;

    return {
        grossSalary: gross,
        standardDeduction: standardDeduction,
        totalDeductionsAllowed: 0,
        taxableIncome: taxableIncome,
        taxBeforeRebate: tax,
        rebate87A: rebate,
        marginalRelief: marginalRelief,
        taxAfterRebate: taxAfterRebate,
        healthAndEducationCess: cess,
        totalTaxLiability: totalTax,
        regimeName: "New Tax Regime",
        // Breakdown
        hraExemption: 0,
        professionalTax: 0,
        homeLoanInterest: 0,
        section80C: 0,
        section80CCD1B: 0,
        section80D: 0,
        otherDeductions: 0
    };
};
