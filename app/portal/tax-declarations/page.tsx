'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

export default function EmployeeTaxDeclarations() {
    const [employee, setEmployee] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Declaration State
    const [financialYear, setFinancialYear] = useState('2024');
    const [status, setStatus] = useState<string | null>(null);
    const [adminNotes, setAdminNotes] = useState('');

    const [hra, setHra] = useState(0);
    const [homeLoan, setHomeLoan] = useState(0);
    const [sec80c, set80C] = useState(0);
    const [sec80d, set80D] = useState(0);
    const [other, setOther] = useState(0);

    const [message, setMessage] = useState('');

    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        fetchData();
    }, [financialYear]);

    const fetchData = async () => {
        setLoading(true);
        setMessage('');
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

        // Fetch their existing declaration for the selected FY
        const { data: decData } = await supabase
            .from('tax_declarations')
            .select('*')
            .eq('hrpn', empData.hrpn)
            .eq('financial_year', financialYear)
            .single();

        if (decData) {
            setHra(decData.hra_exemption || 0);
            setHomeLoan(decData.home_loan_interest || 0);
            set80C(decData.section_80c || 0);
            set80D(decData.section_80d || 0);
            setOther(decData.other_deductions || 0);
            setStatus(decData.status);
            setAdminNotes(decData.admin_notes || '');
        } else {
            // Reset for new creation
            setHra(0);
            setHomeLoan(0);
            set80C(0);
            set80D(0);
            setOther(0);
            setStatus(null);
            setAdminNotes('');
        }

        setLoading(false);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage('');

        try {
            const payload = {
                hrpn: employee.hrpn,
                financial_year: financialYear,
                hra_exemption: hra,
                home_loan_interest: homeLoan,
                section_80c: sec80c,
                section_80d: sec80d,
                other_deductions: other,
                status: 'pending' // Re-flag as pending whenever they edit it
            };

            const { error } = await supabase
                .from('tax_declarations')
                .upsert(payload, { onConflict: 'hrpn,financial_year' });

            if (error) throw error;

            setMessage('✅ Declarations securely submitted for HR approval!');
            setStatus('pending');
            setAdminNotes('');
        } catch (err: any) {
            console.error(err);
            setMessage(`❌ Error saving: ${err.message}`);
        } finally {
            setSaving(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    if (loading && !employee) {
        return <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
    }

    const isLocked = status === 'approved';

    return (
        <div className="container animate-fade-in" style={{ paddingBottom: '4rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="page-title" style={{ textAlign: 'left', marginBottom: '0.5rem', color: '#8b5cf6' }}>
                        💰 Tax Savings Declarations
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                        Submit your external investments and deductions. This mathematically updates your tax liability.
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
                    <label style={{ fontWeight: 'bold' }}>📅 Financial Year:</label>
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

            {message && (
                <div style={{ padding: '1rem', borderRadius: '0.5rem', marginBottom: '2rem', background: message.includes('✅') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: message.includes('✅') ? '#10b981' : '#ef4444' }}>
                    {message}
                </div>
            )}

            {status && (
                <div style={{
                    padding: '1.5rem',
                    borderRadius: '0.5rem',
                    marginBottom: '2rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    background: status === 'approved' ? 'rgba(16, 185, 129, 0.1)' : status === 'rejected' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                    borderLeft: `4px solid ${status === 'approved' ? '#10b981' : status === 'rejected' ? '#ef4444' : '#3b82f6'}`
                }}>
                    <div style={{ fontSize: '2rem' }}>
                        {status === 'approved' ? '✅' : status === 'rejected' ? '❌' : '⏳'}
                    </div>
                    <div>
                        <h3 style={{ margin: 0, color: status === 'approved' ? '#10b981' : status === 'rejected' ? '#ef4444' : '#3b82f6' }}>
                            Status: {status.charAt(0).toUpperCase() + status.slice(1)}
                        </h3>
                        {status === 'approved' && <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>These deductions have been verified by HR and are now actively applied to your projected tax liability. You cannot edit them.</p>}
                        {status === 'pending' && <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Currently under review by HR. You may still make edits before final approval.</p>}
                        {status === 'rejected' && <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>HR has returned this declaration for corrections. Please review the notes below and resubmit.</p>}

                        {adminNotes && (
                            <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '0.25rem', fontSize: '0.85rem' }}>
                                <strong>HR Notes:</strong> {adminNotes}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <form onSubmit={handleSave} className="glass-panel" style={{ opacity: isLocked ? 0.7 : 1 }}>
                <h2 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                    Declaration Form (FY {financialYear}-{parseInt(financialYear) + 1})
                </h2>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                            HRA Exemption (Sec 10)
                        </label>
                        <input type="number" className="input-field" value={hra} onChange={e => setHra(Number(e.target.value))} disabled={isLocked} />
                        <div style={{ fontSize: '0.75rem', color: '#60a5fa', marginTop: '0.25rem' }}>Only applies if you live in a rented house.</div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                            Home Loan Interest 24(B)
                        </label>
                        <input type="number" className="input-field" value={homeLoan} onChange={e => setHomeLoan(Number(e.target.value))} placeholder="Max: 200000" max="200000" disabled={isLocked} />
                        <div style={{ fontSize: '0.75rem', color: '#60a5fa', marginTop: '0.25rem' }}>Maximum allowed is ₹2,00,000.</div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                            Extra 80C (LIC, ELSS, PPF)
                        </label>
                        <input type="number" className="input-field" value={sec80c} onChange={e => set80C(Number(e.target.value))} disabled={isLocked} />
                        <div style={{ fontSize: '0.75rem', color: '#60a5fa', marginTop: '0.25rem' }}>Max ₹1.5L (combined with your payroll GPF).</div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                            80D Health Insurance Premium
                        </label>
                        <input type="number" className="input-field" value={sec80d} onChange={e => set80D(Number(e.target.value))} placeholder="Max: 75000" max="75000" disabled={isLocked} />
                        <div style={{ fontSize: '0.75rem', color: '#60a5fa', marginTop: '0.25rem' }}>Premium paid for Medical Insurance.</div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                            Other Deductions (80G, 80E, etc)
                        </label>
                        <input type="number" className="input-field" value={other} onChange={e => setOther(Number(e.target.value))} disabled={isLocked} />
                        <div style={{ fontSize: '0.75rem', color: '#60a5fa', marginTop: '0.25rem' }}>Education loan interest, Donations.</div>
                    </div>
                </div>

                {!isLocked && (
                    <button type="submit" className="btn btn-primary" disabled={saving || isLocked} style={{ background: '#8b5cf6', padding: '1rem 2rem', fontSize: '1rem' }}>
                        {saving ? '⏳ Submitting...' : '📩 Submit for HR Approval'}
                    </button>
                )}
            </form>
        </div>
    );
}
