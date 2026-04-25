'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';

interface PayrollRecord {
    hrpn: string;
    name: string;
    designation: string;
    month_date: string;
    basic: number;
    gross: number;
    total_ded: number;
    net_pay: number;
    gpf_reg: number;
    nps_reg: number;
    income_tax: number;
}

interface Discrepancy {
    hrpn: string;
    name: string;
    type: 'warning' | 'error' | 'info';
    message: string;
    currValue?: number;
    prevValue?: number;
}

export default function AuditPage() {
    const [availableMonths, setAvailableMonths] = useState<string[]>([]);
    const [currentMonth, setCurrentMonth] = useState('');
    const [previousMonth, setPreviousMonth] = useState('');

    const [loading, setLoading] = useState(false);
    const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
    const [stats, setStats] = useState({
        totalCompared: 0,
        newEmployees: 0,
        missingEmployees: 0
    });

    const supabase = createClient();

    useEffect(() => {
        fetchAvailableMonths();
    }, []);

    const fetchAvailableMonths = async () => {
        const { data, error } = await supabase
            .from('payroll_records')
            .select('month_date')
            .order('month_date', { ascending: false });

        if (!error && data) {
            const uniqueMonths = [...new Set(data.map(r => r.month_date))];
            setAvailableMonths(uniqueMonths);
            if (uniqueMonths.length >= 2) {
                setCurrentMonth(uniqueMonths[0]);
                setPreviousMonth(uniqueMonths[1]);
            } else if (uniqueMonths.length === 1) {
                setCurrentMonth(uniqueMonths[0]);
            }
        }
    };

    const formatMonthLabel = (dateStr: string): string => {
        if (!dateStr) return '';
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    };

    const runAudit = async () => {
        if (!currentMonth || !previousMonth) {
            alert('Please select both a current and previous month to compare.');
            return;
        }
        if (currentMonth === previousMonth) {
            alert('Current and previous month cannot be the same.');
            return;
        }

        setLoading(true);
        setDiscrepancies([]);

        try {
            // Fetch records for both months
            const { data: currData, error: currErr } = await supabase
                .from('payroll_records')
                .select('*')
                .eq('month_date', currentMonth);

            const { data: prevData, error: prevErr } = await supabase
                .from('payroll_records')
                .select('*')
                .eq('month_date', previousMonth);

            if (currErr) throw currErr;
            if (prevErr) throw prevErr;

            const currMap = new Map((currData || []).map(r => [r.hrpn, r as PayrollRecord]));
            const prevMap = new Map((prevData || []).map(r => [r.hrpn, r as PayrollRecord]));

            const foundDiscrepancies: Discrepancy[] = [];
            let newEmp = 0;
            let missingEmp = 0;

            // 1. Check current month against previous
            currMap.forEach((curr, hrpn) => {
                const prev = prevMap.get(hrpn);

                if (!prev) {
                    newEmp++;
                    foundDiscrepancies.push({
                        hrpn,
                        name: curr.name,
                        type: 'info',
                        message: 'New employee or joined this month.'
                    });
                    return;
                }

                // --- Auditing Rules ---

                // 1. Gross Pay Variance > 10%
                if (curr.gross !== prev.gross) {
                    const diff = Math.abs(curr.gross - prev.gross);
                    const percentage = (diff / prev.gross) * 100;
                    if (percentage > 10) {
                        foundDiscrepancies.push({
                            hrpn,
                            name: curr.name,
                            type: percentage > 30 ? 'error' : 'warning',
                            message: `Gross Pay changed by ${percentage.toFixed(1)}%`,
                            currValue: curr.gross,
                            prevValue: prev.gross
                        });
                    }
                }

                // 2. Net Pay Variance > 20%
                if (curr.net_pay !== prev.net_pay) {
                    const diff = Math.abs(curr.net_pay - prev.net_pay);
                    const percentage = prev.net_pay === 0 ? 100 : (diff / prev.net_pay) * 100;
                    if (percentage > 20) {
                        foundDiscrepancies.push({
                            hrpn,
                            name: curr.name,
                            type: 'warning',
                            message: `Net Pay changed by ${percentage.toFixed(1)}%`,
                            currValue: curr.net_pay,
                            prevValue: prev.net_pay
                        });
                    }
                }

                // 3. GPF Started or Stopped
                if (curr.gpf_reg > 0 && prev.gpf_reg === 0) {
                    foundDiscrepancies.push({
                        hrpn, name: curr.name, type: 'info',
                        message: `GPF Registration Deductions STARTED`,
                        currValue: curr.gpf_reg, prevValue: 0
                    });
                } else if (curr.gpf_reg === 0 && prev.gpf_reg > 0) {
                    foundDiscrepancies.push({
                        hrpn, name: curr.name, type: 'error',
                        message: `GPF Registration Deductions STOPPED abruptly`,
                        currValue: 0, prevValue: prev.gpf_reg
                    });
                }

                // 4. NPS Started or Stopped
                if (curr.nps_reg > 0 && prev.nps_reg === 0) {
                    foundDiscrepancies.push({
                        hrpn, name: curr.name, type: 'info',
                        message: `NPS Deductions STARTED`
                    });
                } else if (curr.nps_reg === 0 && prev.nps_reg > 0) {
                    foundDiscrepancies.push({
                        hrpn, name: curr.name, type: 'error',
                        message: `NPS Deductions STOPPED abruptly`
                    });
                }

                // 5. Income Tax Fluctuations (If drops to 0 suddenly)
                if (curr.income_tax === 0 && prev.income_tax > 0) {
                    foundDiscrepancies.push({
                        hrpn, name: curr.name, type: 'warning',
                        message: `Income Tax deduction dropped to 0`,
                        currValue: 0, prevValue: prev.income_tax
                    });
                }
            });

            // 2. Check previous month against current (Missing employees)
            prevMap.forEach((prev, hrpn) => {
                if (!currMap.has(hrpn)) {
                    missingEmp++;
                    foundDiscrepancies.push({
                        hrpn,
                        name: prev.name,
                        type: 'error',
                        message: 'Employee was present last month but is MISSING this month.'
                    });
                }
            });

            // Sort discrepancies: Errors first, then warnings, then info
            foundDiscrepancies.sort((a, b) => {
                const weight = { 'error': 3, 'warning': 2, 'info': 1 };
                return weight[b.type] - weight[a.type];
            });

            setDiscrepancies(foundDiscrepancies);
            setStats({
                totalCompared: currMap.size,
                newEmployees: newEmp,
                missingEmployees: missingEmp
            });

        } catch (error: any) {
            alert('Audit failed: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container animate-fade-in" style={{ paddingBottom: '4rem' }}>
            <h1 className="page-title" style={{ textAlign: 'left', marginBottom: '1rem', color: '#ef4444' }}>
                🛡️ Automated Audit & Discrepancy Dashboard
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
                Automatically compare this month's payroll against the previous month to instantly spot missing employees, huge salary jumps, or accidentally dropped deductions (like GPF or NPS stopping) before dispensing money!
            </p>

            <div className="glass-panel" style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>🎯 Current Month (To Check)</label>
                        <select
                            className="input-field"
                            value={currentMonth}
                            onChange={e => setCurrentMonth(e.target.value)}
                        >
                            <option value="">-- Select --</option>
                            {availableMonths.map(m => (
                                <option key={m} value={m}>{formatMonthLabel(m)}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>⏮️ Baseline Month (Previous)</label>
                        <select
                            className="input-field"
                            value={previousMonth}
                            onChange={e => setPreviousMonth(e.target.value)}
                        >
                            <option value="">-- Select --</option>
                            {availableMonths.map(m => (
                                <option key={m} value={m}>{formatMonthLabel(m)}</option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={runAudit}
                        disabled={loading}
                        className="btn btn-primary"
                        style={{ padding: '0.85rem 2rem' }}
                    >
                        {loading ? '⏳ Analyzing DB...' : '🔍 Run Deep Audit'}
                    </button>
                </div>
            </div>

            {/* Results */}
            {discrepancies.length > 0 && (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                        <div className="glass-panel" style={{ textAlign: 'center', borderTop: '3px solid #3b82f6' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3b82f6' }}>{stats.totalCompared}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Employees Checked</div>
                        </div>
                        <div className="glass-panel" style={{ textAlign: 'center', borderTop: '3px solid #f59e0b' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>{discrepancies.length}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Flags Found</div>
                        </div>
                        <div className="glass-panel" style={{ textAlign: 'center', borderTop: '3px solid #ef4444' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ef4444' }}>{stats.missingEmployees}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Missing Employees</div>
                        </div>
                    </div>

                    <div className="glass-panel">
                        <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Audit Findings</h2>
                        <div className="table-container" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Severity</th>
                                        <th>HRPN</th>
                                        <th>Employee Name</th>
                                        <th>Discrepancy Detail</th>
                                        <th>Prev Value</th>
                                        <th>Curr Value</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {discrepancies.map((d, i) => (
                                        <tr key={i} style={{
                                            background: d.type === 'error' ? 'rgba(239, 68, 68, 0.05)' :
                                                d.type === 'warning' ? 'rgba(245, 158, 11, 0.05)' : 'transparent'
                                        }}>
                                            <td>
                                                {d.type === 'error' && <span style={{ color: '#ef4444', fontWeight: 'bold' }}>🔴 CRITICAL</span>}
                                                {d.type === 'warning' && <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>🟡 WARNING</span>}
                                                {d.type === 'info' && <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>🔵 INFO</span>}
                                            </td>
                                            <td style={{ fontFamily: 'monospace' }}>{d.hrpn}</td>
                                            <td style={{ fontWeight: '500' }}>{d.name}</td>
                                            <td>{d.message}</td>
                                            <td style={{ color: 'var(--text-muted)' }}>
                                                {d.prevValue !== undefined ? d.prevValue.toLocaleString('en-IN') : '-'}
                                            </td>
                                            <td style={{ fontWeight: 'bold' }}>
                                                {d.currValue !== undefined ? d.currValue.toLocaleString('en-IN') : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {!loading && discrepancies.length === 0 && stats.totalCompared > 0 && (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem', borderTop: '4px solid #10b981' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
                    <h2 style={{ color: '#10b981', marginBottom: '0.5rem' }}>Audit Passed Successfully!</h2>
                    <p style={{ color: 'var(--text-muted)' }}>
                        We compared {stats.totalCompared} records between {formatMonthLabel(currentMonth)} and {formatMonthLabel(previousMonth)}. Absolutely zero catastrophic anomalies were detected. It's safe to proceed with payroll execution!
                    </p>
                </div>
            )}
        </div>
    );
}
