'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { generatePayslipPDF } from '@/lib/payslipGenerator';

export default function EmployeePayslips() {
    const [employee, setEmployee] = useState<any>(null);
    const [payrollRecords, setPayrollRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        const fetchSessionAndData = async () => {
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
                console.error("No employee found for this email", email);
                setLoading(false);
                return;
            }

            setEmployee(empData);

            // Fetch their Payroll Records (RLS is active, but we pass hrpn anyway)
            const { data: records, error: recordsError } = await supabase
                .from('payroll_records')
                .select('*')
                .eq('hrpn', empData.hrpn)
                .order('month_date', { ascending: false });

            if (records && !recordsError) {
                setPayrollRecords(records);
            }

            setLoading(false);
        };

        fetchSessionAndData();
    }, [router, supabase]);

    const handleDownload = async (record: any) => {
        setDownloadingId(record.id);

        try {
            // Generate PDF payslip client-side
            generatePayslipPDF(record, employee);
        } catch (error) {
            console.error("Failed to generate PDF:", error);
            alert("Error generating your payslip. Please try again.");
        } finally {
            setDownloadingId(null);
        }
    };

    if (loading) {
        return (
            <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                Loading payslip history...
            </div>
        );
    }

    if (!employee) {
        return (
            <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                Error locating payslip configuration. Please contact HR.
            </div>
        );
    }

    return (
        <div className="container animate-fade-in" style={{ paddingBottom: '4rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="page-title" style={{ textAlign: 'left', marginBottom: '0.5rem', color: '#3b82f6' }}>
                        📄 My Payslips
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                        Download official copies of your monthly salary statements.
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

            <div className="glass-panel">
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Salary Month</th>
                                <th>Gross Pay</th>
                                <th>Total Deductions</th>
                                <th>Net Pay (In Hand)</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {payrollRecords.length === 0 ? (
                                <tr>
                                    <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🗂️</div>
                                        No payslip records have been uploaded for you yet.
                                    </td>
                                </tr>
                            ) : (
                                payrollRecords.map(record => (
                                    <tr key={record.id}>
                                        <td style={{ fontWeight: '600' }}>
                                            {record.month_year}
                                        </td>
                                        <td style={{ color: '#10b981', fontFamily: 'monospace' }}>
                                            ₹{record.gross?.toLocaleString() || '0'}
                                        </td>
                                        <td style={{ color: '#ef4444', fontFamily: 'monospace' }}>
                                            -₹{record.total_ded?.toLocaleString() || '0'}
                                        </td>
                                        <td style={{ fontWeight: 'bold', fontFamily: 'monospace', fontSize: '1.05rem', color: 'var(--foreground)' }}>
                                            ₹{record.net_pay?.toLocaleString() || '0'}
                                        </td>
                                        <td>
                                            <button
                                                className="btn"
                                                onClick={() => handleDownload(record)}
                                                disabled={downloadingId === record.id}
                                                style={{
                                                    background: 'rgba(59, 130, 246, 0.1)',
                                                    border: '1px solid rgba(59, 130, 246, 0.3)',
                                                    color: '#3b82f6',
                                                    padding: '0.5rem 1rem',
                                                    fontSize: '0.85rem',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem',
                                                    opacity: downloadingId === record.id ? 0.6 : 1,
                                                    cursor: downloadingId === record.id ? 'wait' : 'pointer'
                                                }}
                                            >
                                                {downloadingId === record.id ? '⏳ Generating...' : '⬇️ Download PDF'}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                Note: These digital payslips are automatically generated from official payroll extractions. If you spot a discrepancy, please contact Human Resources.
            </div>
        </div>
    );
}
