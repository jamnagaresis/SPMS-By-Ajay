'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    BarChart,
    Bar,
    Legend
} from 'recharts';

export default function AnalyticsPage() {
    const [loading, setLoading] = useState(true);
    const [trendData, setTrendData] = useState<any[]>([]);
    const [designationData, setDesignationData] = useState<any[]>([]);
    const [latestMonthLabel, setLatestMonthLabel] = useState('');
    const [taxData, setTaxData] = useState<any[]>([]);

    const supabase = createClient();
    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('payroll_records')
                .select('month_date, gross, net_pay, total_ded, income_tax, prof_tax, designation')
                .order('month_date', { ascending: true });

            if (error) throw error;
            if (!data || data.length === 0) {
                setLoading(false);
                return;
            }

            // 1. Process Trend Data (Group by Month)
            const monthMap = new Map<string, any>();
            data.forEach((r) => {
                if (!monthMap.has(r.month_date)) {
                    monthMap.set(r.month_date, {
                        month: formatMonthLabel(r.month_date),
                        gross: 0,
                        net: 0,
                        deductions: 0,
                        incomeTax: 0,
                        recordDate: new Date(r.month_date).getTime()
                    });
                }
                const m = monthMap.get(r.month_date);
                m.gross += r.gross || 0;
                m.net += r.net_pay || 0;
                m.deductions += r.total_ded || 0;
                m.incomeTax += r.income_tax || 0;
            });

            // Convert to array and sort cronologically
            const aggregatedTrends = Array.from(monthMap.values()).sort((a, b) => a.recordDate - b.recordDate);
            setTrendData(aggregatedTrends);

            // 2. Process Designation Data (For the latest month only to show current composition)
            if (aggregatedTrends.length > 0) {
                const latestMonth = data.filter(r => r.month_date === data[data.length - 1].month_date);
                setLatestMonthLabel(formatMonthLabel(data[data.length - 1].month_date));

                const desMap = new Map<string, number>();
                let totalTax = 0;
                let totalProfTax = 0;

                latestMonth.forEach(r => {
                    const des = r.designation || 'Other';
                    desMap.set(des, (desMap.get(des) || 0) + 1);

                    totalTax += r.income_tax || 0;
                    totalProfTax += r.prof_tax || 0;
                });

                const sortedDes = Array.from(desMap.entries())
                    .map(([name, value]) => ({ name, value }))
                    .sort((a, b) => b.value - a.value);

                setDesignationData(sortedDes);

                setTaxData([
                    { name: 'Income Tax', value: totalTax, fill: '#ef4444' },
                    { name: 'Prof Tax', value: totalProfTax, fill: '#f59e0b' }
                ]);
            }

        } catch (error: any) {
            console.error('Error fetching analytics:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatMonthLabel = (dateStr: string): string => {
        if (!dateStr) return '';
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    };

    const formatCurrency = (val: number) => {
        if (val === 0) return '₹0';
        if (val > 100000) return `₹${(val / 100000).toFixed(1)}L`;
        if (val > 1000) return `₹${(val / 1000).toFixed(1)}k`;
        return `₹${val}`;
    };

    if (loading) {
        return <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>Loading visualizations...</div>;
    }

    if (trendData.length === 0) {
        return <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>No payroll data available yet. Please upload PDFs first.</div>;
    }

    // Calc totals for KPI
    const latestKPI = trendData[trendData.length - 1];
    const prevKPI = trendData.length > 1 ? trendData[trendData.length - 2] : null;

    const calcGrowth = (curr: number, prev: number) => {
        if (!prev) return 0;
        return ((curr - prev) / prev) * 100;
    };

    return (
        <div className="container animate-fade-in" style={{ paddingBottom: '4rem' }}>
            <h1 className="page-title" style={{ textAlign: 'left', marginBottom: '1rem', color: '#8b5cf6' }}>
                📈 Analytics & Executive Dashboard
            </h1>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                <div className="glass-panel" style={{ borderTop: '4px solid #3b82f6' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Total Gross Payroll ({latestMonthLabel})</div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#3b82f6' }}>₹{latestKPI.gross.toLocaleString('en-IN')}</div>
                    {prevKPI && (
                        <div style={{ fontSize: '0.85rem', color: calcGrowth(latestKPI.gross, prevKPI.gross) > 0 ? '#ef4444' : '#10b981', marginTop: '0.5rem', fontWeight: 'bold' }}>
                            {calcGrowth(latestKPI.gross, prevKPI.gross) > 0 ? '↑' : '↓'} {Math.abs(calcGrowth(latestKPI.gross, prevKPI.gross)).toFixed(1)}% vs Last Month
                        </div>
                    )}
                </div>

                <div className="glass-panel" style={{ borderTop: '4px solid #10b981' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Total Net Payout</div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>₹{latestKPI.net.toLocaleString('en-IN')}</div>
                    {prevKPI && (
                        <div style={{ fontSize: '0.85rem', color: calcGrowth(latestKPI.net, prevKPI.net) > 0 ? '#ef4444' : '#10b981', marginTop: '0.5rem', fontWeight: 'bold' }}>
                            {calcGrowth(latestKPI.net, prevKPI.net) > 0 ? '↑' : '↓'} {Math.abs(calcGrowth(latestKPI.net, prevKPI.net)).toFixed(1)}% vs Last Month
                        </div>
                    )}
                </div>

                <div className="glass-panel" style={{ borderTop: '4px solid #ef4444' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Total Deducted Tax</div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ef4444' }}>₹{latestKPI.incomeTax.toLocaleString('en-IN')}</div>
                    {prevKPI && (
                        <div style={{ fontSize: '0.85rem', color: calcGrowth(latestKPI.incomeTax, prevKPI.incomeTax) > 0 ? '#10b981' : '#f59e0b', marginTop: '0.5rem', fontWeight: 'bold' }}>
                            {calcGrowth(latestKPI.incomeTax, prevKPI.incomeTax) > 0 ? '↑' : '↓'} {Math.abs(calcGrowth(latestKPI.incomeTax, prevKPI.incomeTax)).toFixed(1)}% vs Last Month
                        </div>
                    )}
                </div>
            </div>

            {/* Charts Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
                {/* Historical Trend Line */}
                <div className="glass-panel">
                    <h2 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', color: 'var(--foreground)' }}>12-Month Payroll Trend</h2>
                    <div style={{ height: '350px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trendData.slice(-12)}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                                <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={12} tickLine={false} />
                                <YAxis tickFormatter={formatCurrency} stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                                <Tooltip
                                    contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'var(--foreground)' }}
                                    formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, '']}
                                />
                                <Legend />
                                <Line type="monotone" dataKey="gross" name="Gross Pay" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                <Line type="monotone" dataKey="net" name="Net Payout" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Composition */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <div className="glass-panel">
                        <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: 'var(--foreground)' }}>Workforce Breakdown</h2>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1rem' }}>Active composition for {latestMonthLabel}</div>
                        <div style={{ height: '220px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={designationData}
                                        innerRadius={60}
                                        outerRadius={90}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {designationData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '8px' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ marginTop: '2rem' }}>
                <div className="glass-panel">
                    <h2 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', color: 'var(--foreground)' }}>Combined Tax Summary ({latestMonthLabel})</h2>
                    <div style={{ height: '300px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={taxData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                                <XAxis type="number" tickFormatter={formatCurrency} stroke="var(--text-muted)" fontSize={12} />
                                <YAxis dataKey="name" type="category" stroke="var(--text-muted)" fontSize={12} width={100} />
                                <Tooltip
                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                    contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '8px' }}
                                    formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, 'Amount']}
                                />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                    {taxData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
}
