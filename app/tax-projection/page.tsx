'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { calculateOldRegime, calculateNewRegime, TaxInput, TaxOutput } from '@/lib/taxCalculator';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

export default function TaxProjectionPage() {
    const [employees, setEmployees] = useState<any[]>([]);
    const [selectedHrpn, setSelectedHrpn] = useState('');
    const [loading, setLoading] = useState(false);
    const [fetchingEmp, setFetchingEmp] = useState(true);

    const [monthsAnalyzed, setMonthsAnalyzed] = useState(0);
    const [financialYear, setFinancialYear] = useState('2024');

    // Mined YTD Data
    const [ytdGross, setYtdGross] = useState(0);
    const [ytdProfTax, setYtdProfTax] = useState(0);
    const [ytdGPF, setYtdGPF] = useState(0);
    const [ytdNPS, setYtdNPS] = useState(0);
    const [ytdGovtSaving, setYtdGovtSaving] = useState(0);

    // Projected Data
    const [projGross, setProjGross] = useState(0);
    const [projProfTax, setProjProfTax] = useState(0);
    const [projGPF, setProjGPF] = useState(0);
    const [projNPS, setProjNPS] = useState(0);
    const [projGovtSaving, setProjGovtSaving] = useState(0);

    // Manual Overrides (Inputs)
    const [manualHra, setManualHra] = useState(0);
    const [manualHomeLoan, setManualHomeLoan] = useState(0);
    const [manual80C, setManual80C] = useState(0);
    const [manual80D, setManual80D] = useState(0);
    const [manualOther, setManualOther] = useState(0);

    // Results
    const [oldTax, setOldTax] = useState<TaxOutput | null>(null);
    const [newTax, setNewTax] = useState<TaxOutput | null>(null);
    const [recommendation, setRecommendation] = useState('');

    // UI Modals & Export State
    const [showMonthlyCalc, setShowMonthlyCalc] = useState(false);
    const [monthlyDeductionToDate, setMonthlyDeductionToDate] = useState(0);

    const supabase = createClient();

    useEffect(() => {
        fetchEmployees();
    }, []);

    const fetchEmployees = async () => {
        setFetchingEmp(true);
        const { data, error } = await supabase
            .from('employees')
            .select('*')
            .order('corrected_name', { ascending: true });

        if (!error && data) {
            setEmployees(data);
        }
        setFetchingEmp(false);
    };

    const handleAnalyze = async () => {
        if (!selectedHrpn) return;
        setLoading(true);

        try {
            // Determine the month range for the selected FY
            // E.g., for FY 2024-2025, it's April 2024 to March 2025.
            const startMonth = `${financialYear}-04`; // April
            const endMonth = `${parseInt(financialYear) + 1}-03`; // March

            // Fetch records for this employee within this FY
            const { data, error } = await supabase
                .from('payroll_records')
                .select('*')
                .eq('hrpn', selectedHrpn)
                .gte('month_date', `${startMonth}-01`)
                .lte('month_date', `${endMonth}-31`);

            if (error) throw error;

            if (!data || data.length === 0) {
                alert(`No payroll data found for this employee in FY ${financialYear}-${parseInt(financialYear) + 1}.`);
                setLoading(false);
                return;
            }

            setMonthsAnalyzed(data.length);

            // Sum up existing data
            let gross = 0;
            let profTax = 0;
            let gpf = 0;
            let nps = 0;
            let govtSaving = 0;
            let incomeTax = 0;

            data.forEach(r => {
                gross += r.gross || 0;
                profTax += r.prof_tax || 0;
                gpf += (r.gpf_reg || 0) + (r.gpf_class4 || 0);
                nps += r.nps_reg || 0;
                govtSaving += r.govt_saving || 0;
                incomeTax += r.income_tax || 0;
            });

            setYtdGross(gross);
            setYtdProfTax(profTax);
            setYtdGPF(gpf);
            setYtdNPS(nps);
            setYtdGovtSaving(govtSaving);
            setMonthlyDeductionToDate(incomeTax);

            // Projection Extrapolation
            const remainingMonths = 12 - data.length;
            const avgGross = gross / data.length;
            const avgProf = profTax / data.length;
            const avgGPF = gpf / data.length;
            const avgNPS = nps / data.length;
            const avgGovt = govtSaving / data.length;

            const projTotalGross = gross + (avgGross * remainingMonths);
            const projTotalProfTax = profTax + (avgProf * remainingMonths);
            const projTotalGPF = gpf + (avgGPF * remainingMonths);
            const projTotalNPS = nps + (avgNPS * remainingMonths);
            const projTotalGovt = govtSaving + (avgGovt * remainingMonths);

            setProjGross(projTotalGross);
            setProjProfTax(projTotalProfTax);
            setProjGPF(projTotalGPF);
            setProjNPS(projTotalNPS);
            setProjGovtSaving(projTotalGovt);

            // Fetch Approved Declarations from Employee Portal
            const { data: decData } = await supabase
                .from('tax_declarations')
                .select('*')
                .eq('hrpn', selectedHrpn)
                .eq('financial_year', financialYear)
                .eq('status', 'approved')
                .single();

            let hra = manualHra;
            let hl = manualHomeLoan;
            let m80c = manual80C;
            let m80d = manual80D;
            let moth = manualOther;

            if (decData) {
                hra = decData.hra_exemption || 0;
                hl = decData.home_loan_interest || 0;
                m80c = decData.section_80c || 0;
                m80d = decData.section_80d || 0;
                moth = decData.other_deductions || 0;

                setManualHra(hra);
                setManualHomeLoan(hl);
                setManual80C(m80c);
                setManual80D(m80d);
                setManualOther(moth);
            }

            // Re-calc
            calculateTaxes(projTotalGross, projTotalProfTax, projTotalGPF + projTotalGovt, projTotalNPS, hra, hl, m80c, m80d, moth);

        } catch (err: any) {
            alert('Error generating projection: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    // Calculate Taxes whenever inputs change
    useEffect(() => {
        if (!projGross) return;
        calculateTaxes(projGross, projProfTax, projGPF + projGovtSaving, projNPS, manualHra, manualHomeLoan, manual80C, manual80D, manualOther);
    }, [projGross, manualHra, manualHomeLoan, manual80C, manual80D, manualOther]);

    const calculateTaxes = (gross: number, profTax: number, auto80c: number, auto80ccd: number, hra: number, hl: number, man80c: number, man80d: number, other: number) => {
        const payload: TaxInput = {
            grossSalary: gross,
            professionalTax: profTax,
            hraExemption: hra || 0,
            homeLoanInterest: hl || 0,
            section80C: auto80c + (man80c || 0),
            section80CCD1B: auto80ccd || 0,
            section80D: man80d || 0,
            otherDeductions: other || 0
        };

        const oldRes = calculateOldRegime(payload);
        const newRes = calculateNewRegime(payload);

        setOldTax(oldRes);
        setNewTax(newRes);

        if (oldRes.totalTaxLiability < newRes.totalTaxLiability) {
            setRecommendation('OLD REGIME 🏆');
        } else if (newRes.totalTaxLiability < oldRes.totalTaxLiability) {
            setRecommendation('NEW REGIME 🏆');
        } else {
            setRecommendation('EITHER (SAME TAX)');
        }
    };

    const handleExportForm16 = () => {
        if (!selectedHrpn || !oldTax || !newTax) return;
        if (monthsAnalyzed < 12) {
            alert('Form 16 Data can only be explicitly exported when all 12 months of payroll are fully extracted for this financial year.');
            return;
        }

        const employeeInfo = employees.find(e => e.hrpn === selectedHrpn);
        const bestRegime = oldTax.totalTaxLiability < newTax.totalTaxLiability ? oldTax : newTax;

        const data = [
            { Field: 'HRPN', Value: selectedHrpn },
            { Field: 'Employee Name', Value: employeeInfo?.corrected_name || '' },
            { Field: 'PAN Number', Value: employeeInfo?.pan_number || '' },
            { Field: 'Financial Year', Value: `${financialYear}-${parseInt(financialYear) + 1}` },
            { Field: 'Adopted Tax Regime', Value: bestRegime.regimeName },
            { Field: '---', Value: '---' },
            { Field: 'Gross Salary (17(1))', Value: bestRegime.grossSalary },
            { Field: 'Standard Deduction 16(ia)', Value: bestRegime.standardDeduction },
            { Field: 'Professional Tax 16(iii)', Value: projProfTax },
            { Field: 'Income Chargeable under Salaries', Value: bestRegime.taxableIncome + bestRegime.totalDeductionsAllowed },
            { Field: '---', Value: '---' },
            { Field: 'Deductions u/s 80C (GPF, LIC, etc)', Value: projGPF + projGovtSaving + manual80C },
            { Field: 'Deductions u/s 80CCD(1B) (NPS)', Value: projNPS },
            { Field: 'Deductions u/s 80D (Health)', Value: manual80D },
            { Field: 'HRA Exemption (Sec 10)', Value: manualHra },
            { Field: 'Home Loan Interest 24(B)', Value: manualHomeLoan },
            { Field: 'Other Chapter VI-A Deductions', Value: manualOther },
            { Field: 'Total Allowable Deductions Applied', Value: bestRegime.totalDeductionsAllowed },
            { Field: '---', Value: '---' },
            { Field: 'Net Taxable Income', Value: bestRegime.taxableIncome },
            { Field: 'Tax on Total Income', Value: bestRegime.taxBeforeRebate },
            { Field: 'Rebate u/s 87A', Value: bestRegime.rebate87A },
            { Field: 'Health & Education Cess (4%)', Value: bestRegime.healthAndEducationCess },
            { Field: 'Total Tax Liability', Value: bestRegime.totalTaxLiability },
        ];

        const ws = XLSX.utils.json_to_sheet(data);
        ws['!cols'] = [{ wch: 40 }, { wch: 25 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Form 16 Annexure Support');

        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
        saveAs(blob, `Form16_Data_${selectedHrpn}_FY${financialYear}.xlsx`);
    };

    const formatCurrency = (val: number) => {
        if (!val) return '₹0';
        return `₹${val.toLocaleString('en-IN')}`;
    };

    return (
        <div className="container animate-fade-in" style={{ paddingBottom: '4rem' }}>
            <h1 className="page-title" style={{ textAlign: 'left', marginBottom: '1rem', color: '#10b981' }}>
                🏦 Annual Tax Projection & Form 16 Prep
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
                Select an employee to instantly extrapolate their Year-To-Date earnings and pit the Old vs New Tax Regimes (FY 2024-25 Rules) against each other to find maximum savings.
            </p>

            <div className="glass-panel" style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) minmax(150px, 1fr) auto', gap: '1.5rem', alignItems: 'flex-end' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>👨‍💼 Select Employee</label>
                        <select
                            className="input-field"
                            value={selectedHrpn}
                            onChange={e => setSelectedHrpn(e.target.value)}
                            disabled={fetchingEmp}
                        >
                            <option value="">-- Search... --</option>
                            {employees.map(e => (
                                <option key={e.id} value={e.hrpn}>{e.corrected_name} ({e.hrpn})</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>📅 Financial Year (FY)</label>
                        <select
                            className="input-field"
                            value={financialYear}
                            onChange={e => setFinancialYear(e.target.value)}
                        >
                            <option value="2023">2023 - 2024</option>
                            <option value="2024">2024 - 2025</option>
                            <option value="2025">2025 - 2026</option>
                        </select>
                    </div>
                    <button
                        onClick={handleAnalyze}
                        disabled={loading || !selectedHrpn}
                        className="btn"
                        style={{
                            padding: '0.85rem 2rem',
                            background: '#10b981',
                            color: 'white',
                            border: 'none',
                            opacity: (!selectedHrpn || loading) ? 0.5 : 1
                        }}
                    >
                        {loading ? '⏳ Calculating...' : '⚡ Generate Projection'}
                    </button>
                </div>
            </div>

            {monthsAnalyzed > 0 && oldTax && newTax && (
                <>
                    {/* Interpolation Context */}
                    <div style={{
                        background: 'rgba(59, 130, 246, 0.05)',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                        padding: '1rem 1.5rem',
                        borderRadius: '0.5rem',
                        marginBottom: '2rem',
                        color: 'var(--text-muted)',
                        fontSize: '0.9rem'
                    }}>
                        <strong>Analysis Method:</strong> Extrapolating to <strong>12 Months</strong> based on {monthsAnalyzed} months of available payroll data.
                        Automatically detected GPF, Govt Saving, NPS, and Prof Tax from payroll records.
                    </div>

                    {/* Action Bar */}
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', justifyContent: 'flex-end' }}>
                        <button
                            className="btn btn-secondary"
                            onClick={() => setShowMonthlyCalc(true)}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            🧮 Calculate Monthly IT Target
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handleExportForm16}
                            disabled={monthsAnalyzed < 12}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                opacity: monthsAnalyzed < 12 ? 0.5 : 1,
                                cursor: monthsAnalyzed < 12 ? 'not-allowed' : 'pointer',
                                background: monthsAnalyzed < 12 ? 'var(--glass-bg)' : undefined,
                                borderColor: monthsAnalyzed < 12 ? 'var(--glass-border)' : undefined,
                                color: monthsAnalyzed < 12 ? 'var(--text-muted)' : undefined
                            }}
                            title={monthsAnalyzed < 12 ? "Requires full 12 months (April - March) of data." : "Export to Excel"}
                        >
                            {monthsAnalyzed < 12 ? '🔒 Need 12 Months for Form 16' : '📥 Export Form 16 Data'}
                        </button>
                    </div>

                    {/* Manual Adjustments Form */}
                    <div className="glass-panel" style={{ marginBottom: '2rem' }}>
                        <h2 style={{ fontSize: '1.1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            ✍️ Manual Deductions Override
                        </h2>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                            <div>
                                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                                    <span>HRA Exemption (Sec 10)</span>
                                </label>
                                <input type="number" className="input-field" value={manualHra} onChange={e => setManualHra(Number(e.target.value))} />
                            </div>
                            <div>
                                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                                    <span>Home Loan 24(B)</span>
                                    <span style={{ fontSize: '0.7rem', color: '#8b5cf6' }}>Max: 2,00,000</span>
                                </label>
                                <input type="number" className="input-field" placeholder="Max: 200000" max="200000" value={manualHomeLoan} onChange={e => setManualHomeLoan(Number(e.target.value))} />
                            </div>
                            <div>
                                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                                    <span>Extra 80C (LIC, ELSS)</span>
                                    <span style={{ fontSize: '0.7rem', color: '#8b5cf6' }}>Payroll total + this ≤ 1.5L</span>
                                </label>
                                <input type="number" className="input-field" value={manual80C} onChange={e => setManual80C(Number(e.target.value))} />
                            </div>
                            <div>
                                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                                    <span>80D Health Ins.</span>
                                    <span style={{ fontSize: '0.7rem', color: '#8b5cf6' }}>Max: 25k (or 50k Sr)</span>
                                </label>
                                <input type="number" className="input-field" placeholder="Max: 75000" max="75000" value={manual80D} onChange={e => setManual80D(Number(e.target.value))} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>Other (80G, 80E, etc)</label>
                                <input type="number" className="input-field" value={manualOther} onChange={e => setManualOther(Number(e.target.value))} />
                            </div>
                        </div>
                    </div>

                    {/* Side By Side Results */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                        {/* Old Regime Card */}
                        <div className="glass-panel" style={{
                            borderTop: '4px solid #ef4444',
                            boxShadow: recommendation.includes('OLD') ? '0 0 20px rgba(16, 185, 129, 0.3)' : undefined,
                            borderColor: recommendation.includes('OLD') ? '#10b981' : '#ef4444'
                        }}>
                            <h2 style={{ fontSize: '1.2rem', textAlign: 'center', marginBottom: '1.5rem', color: recommendation.includes('OLD') ? '#10b981' : '#ef4444' }}>
                                OLD REGIME
                                {recommendation.includes('OLD') && <span style={{ display: 'block', fontSize: '0.8rem', marginTop: '0.2rem' }}>Recommended Winner</span>}
                            </h2>

                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                <tbody>
                                    <tr>
                                        <td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Gross Projected Salary</td>
                                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(oldTax.grossSalary)}</td>
                                    </tr>
                                    <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                                        <td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Standard Deduction</td>
                                        <td style={{ textAlign: 'right', color: '#ef4444' }}>-{formatCurrency(oldTax.standardDeduction)}</td>
                                    </tr>
                                    <tr>
                                        <td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Total Deductions (80C, HRA, etc)</td>
                                        <td style={{ textAlign: 'right', color: '#ef4444' }}>-{formatCurrency(oldTax.totalDeductionsAllowed)}</td>
                                    </tr>
                                    <tr style={{ borderTop: '1px solid var(--glass-border)', borderBottom: '1px solid var(--glass-border)' }}>
                                        <td style={{ padding: '0.8rem 0', fontWeight: 'bold' }}>Net Taxable Income</td>
                                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(oldTax.taxableIncome)}</td>
                                    </tr>
                                    <tr>
                                        <td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Tax Before Cess</td>
                                        <td style={{ textAlign: 'right' }}>{formatCurrency(oldTax.taxBeforeRebate)}</td>
                                    </tr>
                                    {oldTax.rebate87A > 0 && (
                                        <tr>
                                            <td style={{ padding: '0.5rem 0', color: '#10b981' }}>Rebate u/s 87A</td>
                                            <td style={{ textAlign: 'right', color: '#10b981' }}>-{formatCurrency(oldTax.rebate87A)}</td>
                                        </tr>
                                    )}
                                    <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                                        <td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Health & Ed. Cess (4%)</td>
                                        <td style={{ textAlign: 'right' }}>{formatCurrency(oldTax.healthAndEducationCess)}</td>
                                    </tr>
                                </tbody>
                            </table>

                            <div style={{ marginTop: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '0.5rem', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total Year Tax Liability</div>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: recommendation.includes('OLD') ? '#10b981' : 'var(--foreground)' }}>
                                    {formatCurrency(oldTax.totalTaxLiability)}
                                </div>
                            </div>
                        </div>

                        {/* New Regime Card */}
                        <div className="glass-panel" style={{
                            borderTop: '4px solid #3b82f6',
                            boxShadow: recommendation.includes('NEW') ? '0 0 20px rgba(16, 185, 129, 0.3)' : undefined,
                            borderColor: recommendation.includes('NEW') ? '#10b981' : '#3b82f6'
                        }}>
                            <h2 style={{ fontSize: '1.2rem', textAlign: 'center', marginBottom: '1.5rem', color: recommendation.includes('NEW') ? '#10b981' : '#3b82f6' }}>
                                NEW REGIME
                                {recommendation.includes('NEW') && <span style={{ display: 'block', fontSize: '0.8rem', marginTop: '0.2rem' }}>Recommended Winner</span>}
                            </h2>

                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                <tbody>
                                    <tr>
                                        <td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Gross Projected Salary</td>
                                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(newTax.grossSalary)}</td>
                                    </tr>
                                    <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                                        <td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Standard Deduction</td>
                                        <td style={{ textAlign: 'right', color: '#ef4444' }}>-{formatCurrency(newTax.standardDeduction)}</td>
                                    </tr>
                                    <tr>
                                        <td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Total Deductions (Not Allowed)</td>
                                        <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>₹0</td>
                                    </tr>
                                    <tr style={{ borderTop: '1px solid var(--glass-border)', borderBottom: '1px solid var(--glass-border)' }}>
                                        <td style={{ padding: '0.8rem 0', fontWeight: 'bold' }}>Net Taxable Income</td>
                                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(newTax.taxableIncome)}</td>
                                    </tr>
                                    <tr>
                                        <td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Tax Before Cess</td>
                                        <td style={{ textAlign: 'right' }}>{formatCurrency(newTax.taxBeforeRebate)}</td>
                                    </tr>
                                    {newTax.rebate87A > 0 && (
                                        <tr>
                                            <td style={{ padding: '0.5rem 0', color: '#10b981' }}>Rebate u/s 87A</td>
                                            <td style={{ textAlign: 'right', color: '#10b981' }}>-{formatCurrency(newTax.rebate87A)}</td>
                                        </tr>
                                    )}
                                    {newTax.marginalRelief > 0 && (
                                        <tr>
                                            <td style={{ padding: '0.5rem 0', color: '#10b981' }}>Marginal Relief</td>
                                            <td style={{ textAlign: 'right', color: '#10b981' }}>-{formatCurrency(newTax.marginalRelief)}</td>
                                        </tr>
                                    )}
                                    <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                                        <td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Health & Ed. Cess (4%)</td>
                                        <td style={{ textAlign: 'right' }}>{formatCurrency(newTax.healthAndEducationCess)}</td>
                                    </tr>
                                </tbody>
                            </table>

                            <div style={{ marginTop: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '0.5rem', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total Year Tax Liability</div>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: recommendation.includes('NEW') ? '#10b981' : 'var(--foreground)' }}>
                                    {formatCurrency(newTax.totalTaxLiability)}
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Monthly Deduction Target Modal */}
            {showMonthlyCalc && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '1rem'
                }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', position: 'relative' }}>
                        <button
                            onClick={() => setShowMonthlyCalc(false)}
                            style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
                        >
                            ✕
                        </button>

                        <h2 style={{ fontSize: '1.3rem', marginBottom: '1.5rem', color: 'var(--primary)' }}>🧮 Monthly Target Planner</h2>

                        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '0.5rem' }}>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Projected Total Tax Liability ({recommendation.includes('OLD') ? "Old" : "New"} Regime)</div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#10b981' }}>
                                {formatCurrency(Math.min(oldTax?.totalTaxLiability || 0, newTax?.totalTaxLiability || 0))}
                            </div>
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Total IT already deducted to date</label>
                            <input
                                type="number"
                                className="input-field"
                                placeholder="E.g., 20000"
                                value={monthlyDeductionToDate || ''}
                                onChange={e => setMonthlyDeductionToDate(Number(e.target.value))}
                                style={{ width: '100%', fontSize: '1.1rem', padding: '0.75rem' }}
                            />
                        </div>

                        {monthsAnalyzed > 0 && (
                            <div style={{
                                padding: '1rem',
                                background: 'rgba(255,255,255,0.03)',
                                borderRadius: '0.5rem',
                                borderLeft: '4px solid #8b5cf6'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Target Liability:</span>
                                    <span>{formatCurrency(Math.min(oldTax?.totalTaxLiability || 0, newTax?.totalTaxLiability || 0))}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Already Deducted:</span>
                                    <span style={{ color: '#ef4444' }}>-{formatCurrency(monthlyDeductionToDate)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--glass-border)', paddingTop: '0.5rem', marginTop: '0.5rem', fontWeight: 'bold' }}>
                                    <span>Remaining to Deduct:</span>
                                    <span>{formatCurrency(Math.max(0, Math.min(oldTax?.totalTaxLiability || 0, newTax?.totalTaxLiability || 0) - monthlyDeductionToDate))}</span>
                                </div>

                                <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                        Required deduction per month for remaining {Math.max(1, 12 - monthsAnalyzed)} months:
                                    </div>
                                    <div style={{ fontSize: '1.5rem', color: '#8b5cf6', fontWeight: 'bold' }}>
                                        {formatCurrency(Math.round(Math.max(0, Math.min(oldTax?.totalTaxLiability || 0, newTax?.totalTaxLiability || 0) - monthlyDeductionToDate) / Math.max(1, 12 - monthsAnalyzed)))} /mo
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
