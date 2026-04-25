'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';

export default function ApprovalsPage() {
    const [declarations, setDeclarations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('pending');

    // Action Modal State
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [actionModal, setActionModal] = useState<{ isOpen: boolean; dec: any; type: 'approve' | 'reject'; notes: string }>({
        isOpen: false, dec: null, type: 'approve', notes: ''
    });

    const supabase = createClient();

    useEffect(() => {
        fetchDeclarations();
    }, [filterStatus]);

    const fetchDeclarations = async () => {
        setLoading(true);
        // Step 1: Get Declarations
        const { data: decs, error: decError } = await supabase
            .from('tax_declarations')
            .select(`*`)
            .eq('status', filterStatus)
            .order('updated_at', { ascending: false });

        if (decError) {
            console.error(decError);
            setLoading(false);
            return;
        }

        if (decs && decs.length > 0) {
            // Step 2: Grab the matching employee info (Simulating a JOIN since HR Admin might not have FK setup)
            const hrpns = decs.map(d => d.hrpn);
            const { data: emps } = await supabase
                .from('employees')
                .select('hrpn, corrected_name, email')
                .in('hrpn', hrpns);

            const empMap = new Map();
            emps?.forEach(e => empMap.set(e.hrpn, e));

            const enhancedDecs = decs.map(d => ({
                ...d,
                employeeInfo: empMap.get(d.hrpn) || { corrected_name: 'Unknown', email: 'Unknown' }
            }));

            setDeclarations(enhancedDecs);
        } else {
            setDeclarations([]);
        }

        setLoading(false);
    };

    const handleActionSubmit = async () => {
        if (!actionModal.dec) return;
        setProcessingId(actionModal.dec.id);

        try {
            const { error } = await supabase
                .from('tax_declarations')
                .update({
                    status: actionModal.type === 'approve' ? 'approved' : 'rejected',
                    admin_notes: actionModal.notes
                })
                .eq('id', actionModal.dec.id);

            if (error) throw error;

            // Remove from current view
            fetchDeclarations();
            setActionModal({ isOpen: false, dec: null, type: 'approve', notes: '' });
        } catch (err: any) {
            alert("Error saving: " + err.message);
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <div className="container animate-fade-in" style={{ paddingBottom: '4rem' }}>
            <h1 className="page-title" style={{ textAlign: 'left', marginBottom: '1rem', color: '#10b981' }}>
                ✅ Tax Declarations Approvals
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
                Review and approve external tax savings submitted by employees through the portal. Once approved, these mathematically deduct from their final Tax Liability Projections.
            </p>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                <button
                    className={`btn ${filterStatus === 'pending' ? 'btn-primary' : ''}`}
                    onClick={() => setFilterStatus('pending')}
                    style={{ background: filterStatus === 'pending' ? '#3b82f6' : 'rgba(255,255,255,0.05)', color: filterStatus === 'pending' ? 'white' : 'var(--text-muted)' }}
                >
                    ⏳ Pending Review
                </button>
                <button
                    className={`btn ${filterStatus === 'approved' ? 'btn-primary' : ''}`}
                    onClick={() => setFilterStatus('approved')}
                    style={{ background: filterStatus === 'approved' ? '#10b981' : 'rgba(255,255,255,0.05)', color: filterStatus === 'approved' ? 'white' : 'var(--text-muted)' }}
                >
                    ✅ Approved
                </button>
                <button
                    className={`btn ${filterStatus === 'rejected' ? 'btn-primary' : ''}`}
                    onClick={() => setFilterStatus('rejected')}
                    style={{ background: filterStatus === 'rejected' ? '#ef4444' : 'rgba(255,255,255,0.05)', color: filterStatus === 'rejected' ? 'white' : 'var(--text-muted)' }}
                >
                    ❌ Rejected
                </button>
            </div>

            <div className="glass-panel">
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Employee</th>
                                <th>FY</th>
                                <th>Total Savings Base</th>
                                <th>Submitted On</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>Loading data...</td></tr>
                            ) : declarations.length === 0 ? (
                                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                    No {filterStatus} declarations found right now.
                                </td></tr>
                            ) : (
                                declarations.map(dec => {
                                    const total = Number(dec.hra_exemption) + Number(dec.home_loan_interest) + Number(dec.section_80c) + Number(dec.section_80d) + Number(dec.other_deductions);
                                    return (
                                        <tr key={dec.id}>
                                            <td>
                                                <div style={{ fontWeight: 'bold' }}>{dec.employeeInfo.corrected_name}</div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>HRPN: {dec.hrpn}</div>
                                                <div style={{ fontSize: '0.8rem', color: '#60a5fa' }}>{dec.employeeInfo.email}</div>
                                            </td>
                                            <td style={{ fontWeight: 'bold' }}>{dec.financial_year}</td>
                                            <td style={{ color: '#10b981', fontFamily: 'monospace', fontSize: '1.05rem' }}>₹{total.toLocaleString()}</td>
                                            <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{new Date(dec.updated_at).toLocaleDateString()}</td>
                                            <td>
                                                <button
                                                    className="btn btn-secondary"
                                                    onClick={() => setActionModal({ isOpen: true, dec, type: filterStatus === 'approved' ? 'reject' : 'approve', notes: dec.admin_notes || '' })}
                                                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
                                                >
                                                    🔍 Review
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Review Modal */}
            {actionModal.isOpen && actionModal.dec && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, padding: '1rem'
                }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', background: '#0f172a', border: '1px solid #1e293b' }}>
                        <h2 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', borderBottom: '1px solid #334155', paddingBottom: '0.75rem' }}>
                            Review Tax Declaration
                        </h2>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '0.5rem' }}>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>HRA Exemption</div>
                                <div style={{ fontFamily: 'monospace', fontSize: '1.1rem' }}>₹{Number(actionModal.dec.hra_exemption).toLocaleString()}</div>
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Home Loan (24b)</div>
                                <div style={{ fontFamily: 'monospace', fontSize: '1.1rem' }}>₹{Number(actionModal.dec.home_loan_interest).toLocaleString()}</div>
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>80C (LIC/PPF)</div>
                                <div style={{ fontFamily: 'monospace', fontSize: '1.1rem' }}>₹{Number(actionModal.dec.section_80c).toLocaleString()}</div>
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>80D Health</div>
                                <div style={{ fontFamily: 'monospace', fontSize: '1.1rem' }}>₹{Number(actionModal.dec.section_80d).toLocaleString()}</div>
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Other Deductions</div>
                                <div style={{ fontFamily: 'monospace', fontSize: '1.1rem' }}>₹{Number(actionModal.dec.other_deductions).toLocaleString()}</div>
                            </div>
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                Action to take:
                            </label>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                    <input type="radio" name="actionType" checked={actionModal.type === 'approve'} onChange={() => setActionModal({ ...actionModal, type: 'approve' })} />
                                    <span style={{ color: '#10b981' }}>✅ Approve</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                    <input type="radio" name="actionType" checked={actionModal.type === 'reject'} onChange={() => setActionModal({ ...actionModal, type: 'reject' })} />
                                    <span style={{ color: '#ef4444' }}>❌ Reject</span>
                                </label>
                            </div>
                        </div>

                        <div style={{ marginBottom: '2rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                HR Notes (Visible to employee if rejected):
                            </label>
                            <input
                                className="input-field"
                                value={actionModal.notes}
                                onChange={e => setActionModal({ ...actionModal, notes: e.target.value })}
                                placeholder="E.g., Attach valid PAN card for landlord..."
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setActionModal({ isOpen: false, dec: null, type: 'approve', notes: '' })}
                                disabled={processingId !== null}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn"
                                onClick={handleActionSubmit}
                                disabled={processingId !== null}
                                style={{
                                    background: actionModal.type === 'approve' ? '#10b981' : '#ef4444',
                                    color: 'white', border: 'none'
                                }}
                            >
                                {processingId ? 'Processing...' : `Submit ${actionModal.type === 'approve' ? 'Approval' : 'Rejection'}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
