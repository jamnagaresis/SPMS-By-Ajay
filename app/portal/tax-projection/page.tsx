'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { calculateOldRegime, calculateNewRegime, TaxInput, TaxOutput } from '@/lib/taxCalculator';
import { generateForm16PDF } from '@/lib/form16Generator';

export default function EmployeeTaxProjectionPage() {
    const [employee, setEmployee] = useState<any>(null);
    const [loading, setLoading] = useState(true);

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

    // Manual Overrides (Inputs from Declarations)
    const [manualHra, setManualHra] = useState(0);
    const [manualHomeLoan, setManualHomeLoan] = useState(0);
    const [manual80C, setManual80C] = useState(0);
    const [manual80D, setManual80D] = useState(0);
    const [manualOther, setManualOther] = useState(0);

    // Results
    const [oldTax, setOldTax] = useState<TaxOutput | null>(null);
    const [newTax, setNewTax] = useState<TaxOutput | null>(null);
    const [recommendation, setRecommendation] = useState('');

    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        fetchSessionAndAnalyze();
    }, [financialYear]);

    const fetchSessionAndAnalyze = async () => {
        setLoading(true);
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !session) {
            router.push('/portal/login');
            return;
        }

        const email = session.user.email;

        // Get Employee Data
        const { data: empData, error: empError } = await supabase
            .from('employees')
            .select('*')
            .eq('email', email)
            .single();

        if (empError || !empData) {
            setLoading(false);
            return;
        }

        setEmployee(empData);

        try {
            // Determine the month range for the selected FY
            const startMonth = `${financialYear}-04`; // April
            const endMonth = `${parseInt(financialYear) + 1}-03`; // March

            const { data, error } = await supabase
                .from('payroll_records')
                .select('*')
                .eq('hrpn', empData.hrpn)
                .gte('month_date', `${startMonth}-01`)
                .lte('month_date', `${endMonth}-31`);

            if (error) throw error;

            if (!data || data.length === 0) {
                setMonthsAnalyzed(0);
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

            data.forEach(r => {
                gross += r.gross || 0;
                profTax += r.prof_tax || 0;
                gpf += (r.gpf_reg || 0) + (r.gpf_class4 || 0);
                nps += r.nps_reg || 0;
                govtSaving += r.govt_saving || 0;
            });

            setYtdGross(gross);
            setYtdProfTax(profTax);
            setYtdGPF(gpf);
            setYtdNPS(nps);
            setYtdGovtSaving(govtSaving);

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
                .eq('hrpn', empData.hrpn)
                .eq('financial_year', financialYear)
                .eq('status', 'approved')
                .single();

            let hra = 0, hl = 0, m80c = 0, m80d = 0, moth = 0;
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

            // Calculate Taxes
            calculateTaxes(projTotalGross, projTotalProfTax, projTotalGPF + projTotalGovt, projTotalNPS, hra, hl, m80c, m80d, moth);

        } catch (err: any) {
            console.error('Error generating projection: ', err.message);
        } finally {
            setLoading(false);
        }
    };

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

    const handleDownloadForm16 = () => {
        if (!employee || !oldTax || !newTax) return;

        // Always download best regime representation
        const bestRegime = oldTax.totalTaxLiability < newTax.totalTaxLiability ? oldTax : newTax;
        generateForm16PDF(bestRegime, employee, financialYear, monthsAnalyzed);
    };

    const formatCurrency = (val: number) => {
        if (!val) return '₹0';
        return `₹${val.toLocaleString('en-IN')}`;
    };

    if (loading) {
        return <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading your tax profile...</div>;
    }

    if (!employee) {
        return <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>Unauthorized or invalid employee profile.</div>;
    }

    return (
        <div className="container animate-fade-in" style={{ paddingBottom: '4rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="page-title" style={{ textAlign: 'left', marginBottom: '0.5rem', color: '#10b981' }}>
                        ⚖️ My Tax & Form 16
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                        View your live AI extrapolated tax projection and download your official Form 16.
                    </p>
                </div>
                <button
                    className="btn btn-secondary"
                    onClick={() => router.push('/portal')}
                    style={{ fontSize: '0.85rem' }}
                >
                    ⬅️ Back to Dashboard
                </button>
            </div>

            <div className="glass-panel" style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <label style={{ fontWeight: 'bold' }}>📅 Financial Year (FY):</label>
                    <select
                        className="input-field"
                        value={financialYear}
                        onChange={(e) => setFinancialYear(e.target.value)}
                        style={{ maxWidth: '200px' }}
                    >
                        <option value="2023">2023 - 2024</option>
                        <option value="2024">2024 - 2025</option>
                        <option value="2025">2025 - 2026</option>
                    </select>
                </div>
            </div>

            {monthsAnalyzed === 0 ? (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📁</div>
                    No payroll data found for you in this Financial Year.
                </div>
            ) : oldTax && newTax ? (
                <>
                    {/* Status Note */}
                    <div style={{
                        background: 'rgba(59, 130, 246, 0.05)',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                        padding: '1rem 1.5rem',
                        borderRadius: '0.5rem',
                        marginBottom: '2rem',
                        color: 'var(--text-muted)',
                        fontSize: '0.9rem'
                    }}>
                        <strong>Live Projection:</strong> Based on <strong>{monthsAnalyzed}/12</strong> months of your parsed payroll data for this year, combined with your HR-approved tax declarations.
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1.5fr) minmax(300px, 1fr) minmax(300px, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                        {/* Summary Column */}
                        <div className="glass-panel" style={{ background: '#0f172a' }}>
                            <h3 style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', margin: '0 0 1rem 0' }}>Annual Projection Support</h3>

                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Projected Gross (17(1))</span>
                                <span style={{ fontWeight: 'bold' }}>{formatCurrency(projGross)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Projected Professional Tax</span>
                                <span style={{ fontWeight: 'bold', color: '#ef4444' }}>- {formatCurrency(projProfTax)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Auto GPF / Govt Fund</span>
                                <span style={{ fontWeight: 'bold' }}>{formatCurrency(projGPF + projGovtSaving)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Auto NPS</span>
                                <span style={{ fontWeight: 'bold' }}>{formatCurrency(projNPS)}</span>
                            </div>

                            <h4 style={{ fontSize: '0.9rem', color: '#3b82f6', marginBottom: '0.5rem' }}>HR Approved Declarations</h4>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>HRA Exemption</span>
                                <span>{formatCurrency(manualHra)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Home Loan Interest</span>
                                <span>{formatCurrency(manualHomeLoan)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Extra 80C</span>
                                <span>{formatCurrency(manual80C)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>80D Health</span>
                                <span>{formatCurrency(manual80D)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Other Deductions</span>
                                <span>{formatCurrency(manualOther)}</span>
                            </div>

                            <button
                                className="btn btn-primary"
                                style={{ width: '100%', background: '#10b981', color: 'white' }}
                                onClick={handleDownloadForm16}
                            >
                                ⬇️ Download Form 16 PDF
                            </button>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.5rem' }}>
                                Generates a secure, digital PDF of your Form 16 Annexure Support based on the optimal regime.
                            </div>
                        </div>

                        {/* OLD REGIME */}
                        <div className="glass-panel" style={{ borderTop: recommendation.includes('OLD') ? '4px solid #10b981' : '1px solid var(--glass-border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <h2 style={{ fontSize: '1.2rem', margin: 0, color: 'white' }}>Old Regime</h2>
                                {recommendation.includes('OLD') && <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.8rem', fontWeight: 'bold' }}>RECOMMENDED</span>}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '0.5rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Gross Salary</span>
                                <span>{formatCurrency(oldTax.grossSalary)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '0.5rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Standard Ded.</span>
                                <span>- {formatCurrency(oldTax.standardDeduction)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '0.5rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Deductions Allowed</span>
                                <span style={{ color: '#10b981' }}>- {formatCurrency(oldTax.totalDeductionsAllowed)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '0.5rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Net Taxable </span>
                                <span style={{ fontWeight: 'bold' }}>{formatCurrency(oldTax.taxableIncome)}</span>
                            </div>

                            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '0.5rem', marginTop: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Tax Amount</span>
                                    <span>{formatCurrency(oldTax.taxBeforeRebate)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Cess (4%)</span>
                                    <span>{formatCurrency(oldTax.healthAndEducationCess)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                                    <strong>Total Liability</strong>
                                    <strong style={{ color: '#ef4444' }}>{formatCurrency(oldTax.totalTaxLiability)}</strong>
                                </div>
                            </div>
                        </div>

                        {/* NEW REGIME */}
                        <div className="glass-panel" style={{ borderTop: recommendation.includes('NEW') ? '4px solid #10b981' : '1px solid var(--glass-border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <h2 style={{ fontSize: '1.2rem', margin: 0, color: 'white' }}>New Regime</h2>
                                {recommendation.includes('NEW') && <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.8rem', fontWeight: 'bold' }}>RECOMMENDED</span>}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '0.5rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Gross Salary</span>
                                <span>{formatCurrency(newTax.grossSalary)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '0.5rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Standard Ded.</span>
                                <span>- {formatCurrency(newTax.standardDeduction)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '0.5rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Deductions Allowed</span>
                                <span style={{ color: '#10b981' }}>- {formatCurrency(newTax.totalDeductionsAllowed)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '0.5rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Net Taxable </span>
                                <span style={{ fontWeight: 'bold' }}>{formatCurrency(newTax.taxableIncome)}</span>
                            </div>

                            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '0.5rem', marginTop: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Tax Amount</span>
                                    <span>{formatCurrency(newTax.taxBeforeRebate)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Cess (4%)</span>
                                    <span>{formatCurrency(newTax.healthAndEducationCess)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                                    <strong>Total Liability</strong>
                                    <strong style={{ color: '#ef4444' }}>{formatCurrency(newTax.totalTaxLiability)}</strong>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    );
}
