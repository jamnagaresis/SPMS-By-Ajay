'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';

interface Employee {
    id: string;
    original_name: string;
    corrected_name: string;
    pan_number: string;
    hrpn: string;
}

interface PayrollRecord {
    hrpn: string;
    name: string;
    designation: string;
    month_year: string;
    month_date: string;
    basic: number;
    da: number;
    hra: number;
    cla: number;
    med_allow: number;
    trans_allow: number;
    book_allow: number;
    npp_allow: number;
    esis_allow: number;
    special_pay: number;
    washing_allow: number;
    nursing_allow: number;
    uniform_allow: number;
    recovery_of_pay: number;
    slo: number;
    income_tax: number;
    prof_tax: number;
    gpf_reg: number;
    gpf_class4: number;
    nps_reg: number;
    rnb: number;
    govt_fund: number;
    govt_saving: number;
    gross: number;
    total_ded: number;
    net_pay: number;
    source_files: string[];
    bill_no: string;
    office: string;
}

type ReportType = 'employee' | 'monthly' | 'it_summary' | 'full_summary';

export default function ReportsPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [activeReport, setActiveReport] = useState<ReportType>('employee');
    const [availableMonths, setAvailableMonths] = useState<string[]>([]);

    // Employee Report State
    const [selectedHrpn, setSelectedHrpn] = useState('');
    const [empFromMonth, setEmpFromMonth] = useState('');
    const [empToMonth, setEmpToMonth] = useState('');

    // Monthly Report State
    const [monthlyMonth, setMonthlyMonth] = useState('');

    // IT Summary State
    const [itFromMonth, setItFromMonth] = useState('');
    const [itToMonth, setItToMonth] = useState('');

    // Full Summary State
    const [fullMonth, setFullMonth] = useState('');

    // Status
    const [statusMsg, setStatusMsg] = useState('');
    const [statusType, setStatusType] = useState<'success' | 'error' | 'info'>('info');

    const supabase = createClient();

    useEffect(() => {
        fetchEmployees();
        fetchAvailableMonths();
    }, []);

    const fetchEmployees = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('employees')
            .select('*')
            .order('corrected_name', { ascending: true });

        if (!error && data) setEmployees(data);
        setLoading(false);
    };

    const fetchAvailableMonths = async () => {
        const { data, error } = await supabase
            .from('payroll_records')
            .select('month_date, month_year')
            .order('month_date', { ascending: false });

        if (!error && data) {
            const uniqueMonths = [...new Set(data.map(r => r.month_date))];
            setAvailableMonths(uniqueMonths);
        }
    };

    const showStatus = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
        setStatusMsg(msg);
        setStatusType(type);
        if (type === 'success') {
            setTimeout(() => setStatusMsg(''), 5000);
        }
    };

    const formatMonthLabel = (dateStr: string): string => {
        if (!dateStr) return '';
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    };

    const dateToMonthInput = (dateStr: string): string => {
        if (!dateStr) return '';
        return dateStr.substring(0, 7); // "2026-01-01" -> "2026-01"
    };

    const monthInputToDate = (monthStr: string): string => {
        if (!monthStr) return '';
        return `${monthStr}-01`; // "2026-01" -> "2026-01-01"
    };

    // ================================================================
    // REPORT 1: Employee History (All months for one employee, with month range)
    // ================================================================
    const generateEmployeeReport = async () => {
        if (!selectedHrpn) return showStatus('Please select an employee.', 'error');
        setGenerating(true);
        showStatus('Fetching employee data...', 'info');

        try {
            let query = supabase
                .from('payroll_records')
                .select('*')
                .eq('hrpn', selectedHrpn)
                .order('month_date', { ascending: true });

            if (empFromMonth) {
                query = query.gte('month_date', monthInputToDate(empFromMonth));
            }
            if (empToMonth) {
                query = query.lte('month_date', monthInputToDate(empToMonth));
            }

            const { data, error } = await query;

            if (error) throw error;
            if (!data || data.length === 0) {
                showStatus('No records found for this employee in the selected period.', 'error');
                setGenerating(false);
                return;
            }

            const employee = employees.find(e => e.hrpn === selectedHrpn);
            const empName = employee?.corrected_name || data[0]?.name || 'Employee';
            const panNumber = employee?.pan_number || 'N/A';

            // Create Excel with all details
            const excelData = data.map((rec: PayrollRecord, idx: number) => ({
                'Sr. No.': idx + 1,
                'Month': formatMonthLabel(rec.month_date),
                'Designation': rec.designation || '',
                // Earnings
                'Basic': rec.basic || 0,
                'DA': rec.da || 0,
                'HRA': rec.hra || 0,
                'CLA': rec.cla || 0,
                'Medical Allow': rec.med_allow || 0,
                'Transport Allow': rec.trans_allow || 0,
                'Book Allow': rec.book_allow || 0,
                'NPP Allow': rec.npp_allow || 0,
                'ESIS Allow': rec.esis_allow || 0,
                'Special Pay': rec.special_pay || 0,
                'Washing Allow': rec.washing_allow || 0,
                'Nursing Allow': rec.nursing_allow || 0,
                'Uniform Allow': rec.uniform_allow || 0,
                'Recovery of Pay': rec.recovery_of_pay || 0,
                'SLO': rec.slo || 0,
                'GROSS': rec.gross || 0,
                // Deductions
                'Income Tax': rec.income_tax || 0,
                'Prof Tax': rec.prof_tax || 0,
                'GPF Reg': rec.gpf_reg || 0,
                'GPF Class 4': rec.gpf_class4 || 0,
                'NPS Reg': rec.nps_reg || 0,
                'R&B': rec.rnb || 0,
                'Govt Fund': rec.govt_fund || 0,
                'Govt Saving': rec.govt_saving || 0,
                'TOTAL DEDUCTIONS': rec.total_ded || 0,
                'NET PAY': rec.net_pay || 0,
            }));

            // Add totals row
            const totals: any = { 'Sr. No.': '', 'Month': 'TOTAL', 'Designation': '' };
            const numericKeys = Object.keys(excelData[0]).filter(k => !['Sr. No.', 'Month', 'Designation'].includes(k));
            numericKeys.forEach(key => {
                totals[key] = excelData.reduce((sum: number, row: any) => sum + (row[key] || 0), 0);
            });
            excelData.push(totals);

            // Create a summary sheet
            const summaryData = [
                { 'Field': 'Employee Name', 'Value': empName },
                { 'Field': 'HRPN', 'Value': selectedHrpn },
                { 'Field': 'PAN Number', 'Value': panNumber },
                { 'Field': 'Period', 'Value': `${empFromMonth ? formatMonthLabel(monthInputToDate(empFromMonth)) : 'Start'} to ${empToMonth ? formatMonthLabel(monthInputToDate(empToMonth)) : 'Latest'}` },
                { 'Field': 'Total Months', 'Value': data.length },
                { 'Field': 'Total Gross Earnings', 'Value': totals['GROSS'] || 0 },
                { 'Field': 'Total Income Tax Paid', 'Value': totals['Income Tax'] || 0 },
                { 'Field': 'Total Deductions', 'Value': totals['TOTAL DEDUCTIONS'] || 0 },
                { 'Field': 'Total Net Pay', 'Value': totals['NET PAY'] || 0 },
            ];

            const wb = XLSX.utils.book_new();

            // Summary sheet
            const wsSummary = XLSX.utils.json_to_sheet(summaryData);
            wsSummary['!cols'] = [{ wch: 25 }, { wch: 40 }];
            XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

            // Detailed sheet
            const wsDetail = XLSX.utils.json_to_sheet(excelData);
            XLSX.utils.book_append_sheet(wb, wsDetail, 'Monthly Details');

            const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
            const fileName = `Employee_${empName.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedHrpn}.xlsx`;
            saveAs(blob, fileName);

            showStatus(`✅ Report downloaded: ${fileName} (${data.length} months)`, 'success');
        } catch (err: any) {
            showStatus(`❌ Error: ${err.message}`, 'error');
        } finally {
            setGenerating(false);
        }
    };

    // ================================================================
    // REPORT 2: Monthly Report (All employees for one month)
    // ================================================================
    const generateMonthlyReport = async () => {
        if (!monthlyMonth) return showStatus('Please select a month.', 'error');
        setGenerating(true);
        showStatus('Fetching monthly data...', 'info');

        try {
            const monthDate = monthInputToDate(monthlyMonth);

            const { data, error } = await supabase
                .from('payroll_records')
                .select('*')
                .eq('month_date', monthDate)
                .order('name', { ascending: true });

            if (error) throw error;
            if (!data || data.length === 0) {
                showStatus('No records found for this month.', 'error');
                setGenerating(false);
                return;
            }

            // Enrich with PAN from employees table
            const hrpnToPan = new Map(employees.filter(e => e.hrpn && e.pan_number).map(e => [e.hrpn, e.pan_number]));
            const hrpnToName = new Map(employees.filter(e => e.hrpn).map(e => [e.hrpn, e.corrected_name]));

            const excelData = data.map((rec: PayrollRecord, idx: number) => ({
                'Sr. No.': idx + 1,
                'HRPN': rec.hrpn,
                'Employee Name': hrpnToName.get(rec.hrpn) || rec.name,
                'Designation': rec.designation || '',
                'PAN': hrpnToPan.get(rec.hrpn) || 'N/A',
                // --- Earnings ---
                'Basic': rec.basic || 0,
                'DA': rec.da || 0,
                'HRA': rec.hra || 0,
                'CLA': rec.cla || 0,
                'Medical Allow': rec.med_allow || 0,
                'Transport Allow': rec.trans_allow || 0,
                'Book Allow': rec.book_allow || 0,
                'NPP Allow': rec.npp_allow || 0,
                'ESIS Allow': rec.esis_allow || 0,
                'Special Pay': rec.special_pay || 0,
                'Washing Allow': rec.washing_allow || 0,
                'Nursing Allow': rec.nursing_allow || 0,
                'Uniform Allow': rec.uniform_allow || 0,
                'Recovery of Pay': rec.recovery_of_pay || 0,
                'SLO': rec.slo || 0,
                'GROSS': rec.gross || 0,
                // --- Deductions ---
                'Income Tax': rec.income_tax || 0,
                'Prof Tax': rec.prof_tax || 0,
                'GPF Reg': rec.gpf_reg || 0,
                'GPF Class 4': rec.gpf_class4 || 0,
                'NPS Reg': rec.nps_reg || 0,
                'R&B': rec.rnb || 0,
                'Govt Fund': rec.govt_fund || 0,
                'Govt Saving': rec.govt_saving || 0,
                'TOTAL DEDUCTIONS': rec.total_ded || 0,
                'NET PAY': rec.net_pay || 0,
            }));

            // Add totals
            const totals: any = { 'Sr. No.': '', 'HRPN': '', 'Employee Name': 'TOTAL', 'Designation': '', 'PAN': '' };
            const numericKeys = Object.keys(excelData[0]).filter(k => !['Sr. No.', 'HRPN', 'Employee Name', 'Designation', 'PAN'].includes(k));
            numericKeys.forEach(key => {
                totals[key] = excelData.reduce((sum: number, row: any) => sum + (row[key] || 0), 0);
            });
            excelData.push(totals);

            const ws = XLSX.utils.json_to_sheet(excelData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Monthly Report');

            const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
            const fileName = `Monthly_Report_${monthlyMonth}.xlsx`;
            saveAs(blob, fileName);

            showStatus(`✅ Report downloaded: ${fileName} (${data.length} employees)`, 'success');
        } catch (err: any) {
            showStatus(`❌ Error: ${err.message}`, 'error');
        } finally {
            setGenerating(false);
        }
    };

    // ================================================================
    // REPORT 3: IT Summary (Name, Designation, Gross, Total IT, PAN)
    // ================================================================
    const generateITSummary = async () => {
        setGenerating(true);
        showStatus('Fetching IT summary data for all employees...', 'info');

        try {
            let query = supabase
                .from('payroll_records')
                .select('hrpn, name, designation, gross, income_tax, month_date')
                .order('hrpn');

            if (itFromMonth) {
                query = query.gte('month_date', monthInputToDate(itFromMonth));
            }
            if (itToMonth) {
                query = query.lte('month_date', monthInputToDate(itToMonth));
            }

            const { data, error } = await query;

            if (error) throw error;
            if (!data || data.length === 0) {
                showStatus('No records found for the selected period.', 'error');
                setGenerating(false);
                return;
            }

            // Aggregate by HRPN
            const aggregated = new Map<string, {
                hrpn: string;
                name: string;
                designation: string;
                totalGross: number;
                totalIT: number;
                monthCount: number;
            }>();

            data.forEach((rec: any) => {
                const existing = aggregated.get(rec.hrpn);
                if (existing) {
                    existing.totalGross += rec.gross || 0;
                    existing.totalIT += rec.income_tax || 0;
                    existing.monthCount += 1;
                    // Keep longest name
                    if (rec.name.length > existing.name.length) existing.name = rec.name;
                    if (rec.designation && rec.designation.length > (existing.designation || '').length) {
                        existing.designation = rec.designation;
                    }
                } else {
                    aggregated.set(rec.hrpn, {
                        hrpn: rec.hrpn,
                        name: rec.name,
                        designation: rec.designation || '',
                        totalGross: rec.gross || 0,
                        totalIT: rec.income_tax || 0,
                        monthCount: 1
                    });
                }
            });

            // Enrich with corrected name and PAN from employees table
            const hrpnToPan = new Map(employees.filter(e => e.hrpn && e.pan_number).map(e => [e.hrpn, e.pan_number]));
            const hrpnToName = new Map(employees.filter(e => e.hrpn).map(e => [e.hrpn, e.corrected_name]));

            const sorted = Array.from(aggregated.values()).sort((a, b) => a.name.localeCompare(b.name));

            const excelData = sorted.map((emp, idx) => ({
                'Sr. No.': idx + 1,
                'HRPN': emp.hrpn,
                'Employee Name': hrpnToName.get(emp.hrpn) || emp.name,
                'Designation': emp.designation,
                'PAN Number': hrpnToPan.get(emp.hrpn) || 'N/A',
                'Total Gross Earnings': Math.round(emp.totalGross * 100) / 100,
                'Total Income Tax Paid': Math.round(emp.totalIT * 100) / 100,
                'Months Covered': emp.monthCount,
            }));

            // Add grand total
            const grandTotal: any = {
                'Sr. No.': '', 'HRPN': '', 'Employee Name': 'GRAND TOTAL',
                'Designation': '', 'PAN Number': '',
                'Total Gross Earnings': excelData.reduce((s, r) => s + r['Total Gross Earnings'], 0),
                'Total Income Tax Paid': excelData.reduce((s, r) => s + r['Total Income Tax Paid'], 0),
                'Months Covered': ''
            };
            excelData.push(grandTotal);

            const ws = XLSX.utils.json_to_sheet(excelData);
            ws['!cols'] = [
                { wch: 8 }, { wch: 12 }, { wch: 30 }, { wch: 25 },
                { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 15 }
            ];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'IT Summary');

            const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
            const periodStr = `${itFromMonth || 'all'}_to_${itToMonth || 'all'}`;
            const fileName = `IT_Summary_${periodStr}.xlsx`;
            saveAs(blob, fileName);

            showStatus(`✅ IT Summary downloaded: ${fileName} (${sorted.length} employees)`, 'success');
        } catch (err: any) {
            showStatus(`❌ Error: ${err.message}`, 'error');
        } finally {
            setGenerating(false);
        }
    };

    // ================================================================
    // REPORT 4: Full Payroll Summary (All employees, all details for a month)
    // ================================================================
    const generateFullSummary = async () => {
        if (!fullMonth) return showStatus('Please select a month.', 'error');
        setGenerating(true);
        showStatus('Fetching complete payroll data...', 'info');

        try {
            const monthDate = monthInputToDate(fullMonth);

            const { data, error } = await supabase
                .from('payroll_records')
                .select('*')
                .eq('month_date', monthDate)
                .order('name', { ascending: true });

            if (error) throw error;
            if (!data || data.length === 0) {
                showStatus('No records found for this month.', 'error');
                setGenerating(false);
                return;
            }

            const hrpnToPan = new Map(employees.filter(e => e.hrpn && e.pan_number).map(e => [e.hrpn, e.pan_number]));
            const hrpnToName = new Map(employees.filter(e => e.hrpn).map(e => [e.hrpn, e.corrected_name]));

            const excelData = data.map((rec: PayrollRecord, idx: number) => ({
                'Sr. No.': idx + 1,
                'HRPN': rec.hrpn,
                'Employee Name': hrpnToName.get(rec.hrpn) || rec.name,
                'Designation': rec.designation || '',
                'PAN': hrpnToPan.get(rec.hrpn) || 'N/A',
                // All Earnings
                'Basic': rec.basic || 0,
                'DA': rec.da || 0,
                'HRA': rec.hra || 0,
                'CLA': rec.cla || 0,
                'Medical Allow': rec.med_allow || 0,
                'Transport Allow': rec.trans_allow || 0,
                'Book Allow': rec.book_allow || 0,
                'NPP Allow': rec.npp_allow || 0,
                'ESIS Allow': rec.esis_allow || 0,
                'Special Pay': rec.special_pay || 0,
                'Washing Allow': rec.washing_allow || 0,
                'Nursing Allow': rec.nursing_allow || 0,
                'Uniform Allow': rec.uniform_allow || 0,
                'Recovery of Pay': rec.recovery_of_pay || 0,
                'SLO': rec.slo || 0,
                'GROSS': rec.gross || 0,
                // All Deductions
                'Income Tax': rec.income_tax || 0,
                'Prof Tax': rec.prof_tax || 0,
                'GPF Reg': rec.gpf_reg || 0,
                'GPF Class 4': rec.gpf_class4 || 0,
                'NPS Reg': rec.nps_reg || 0,
                'R&B': rec.rnb || 0,
                'Govt Fund': rec.govt_fund || 0,
                'Govt Saving': rec.govt_saving || 0,
                'TOTAL DEDUCTIONS': rec.total_ded || 0,
                'NET PAY': rec.net_pay || 0,
            }));

            // Totals row
            const totals: any = { 'Sr. No.': '', 'HRPN': '', 'Employee Name': 'TOTAL', 'Designation': '', 'PAN': '' };
            const numericKeys = Object.keys(excelData[0]).filter(k => !['Sr. No.', 'HRPN', 'Employee Name', 'Designation', 'PAN'].includes(k));
            numericKeys.forEach(key => {
                totals[key] = Math.round(excelData.reduce((sum: number, row: any) => sum + (row[key] || 0), 0) * 100) / 100;
            });
            excelData.push(totals);

            const ws = XLSX.utils.json_to_sheet(excelData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Full Payroll');

            const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
            const fileName = `Full_Payroll_${fullMonth}.xlsx`;
            saveAs(blob, fileName);

            showStatus(`✅ Full payroll downloaded: ${fileName} (${data.length} employees)`, 'success');
        } catch (err: any) {
            showStatus(`❌ Error: ${err.message}`, 'error');
        } finally {
            setGenerating(false);
        }
    };

    const reportTabs: { key: ReportType; label: string; icon: string; desc: string }[] = [
        { key: 'employee', label: 'Employee Report', icon: '👤', desc: 'Single employee salary history with month range selection' },
        { key: 'monthly', label: 'Monthly Report', icon: '📅', desc: 'All employees for a specific month' },
        { key: 'it_summary', label: 'IT Summary', icon: '🧾', desc: 'Income Tax summary: Name, PAN, Gross, Total IT' },
        { key: 'full_summary', label: 'Full Payroll', icon: '📊', desc: 'Complete payroll data with all fields for a month' },
    ];

    return (
        <div className="container animate-fade-in" style={{ paddingBottom: '4rem' }}>
            <h1 className="page-title" style={{ textAlign: 'left', marginBottom: '1rem' }}>
                📑 Generate Reports
            </h1>

            {/* Report Type Tabs */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '0.75rem',
                marginBottom: '2rem'
            }}>
                {reportTabs.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveReport(tab.key)}
                        className="glass-panel"
                        style={{
                            cursor: 'pointer',
                            padding: '1.25rem',
                            textAlign: 'center',
                            border: activeReport === tab.key
                                ? '2px solid var(--primary)'
                                : '1px solid var(--glass-border)',
                            background: activeReport === tab.key
                                ? 'rgba(59, 130, 246, 0.1)'
                                : 'var(--glass-bg)',
                            transition: 'all 0.2s',
                            color: 'inherit'
                        }}
                    >
                        <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{tab.icon}</div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.25rem' }}>{tab.label}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{tab.desc}</div>
                    </button>
                ))}
            </div>

            {/* Status Message */}
            {statusMsg && (
                <div style={{
                    marginBottom: '1.5rem',
                    padding: '0.85rem 1.25rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.9rem',
                    background: statusType === 'success' ? 'rgba(16, 185, 129, 0.1)'
                        : statusType === 'error' ? 'rgba(239, 68, 68, 0.1)'
                            : 'rgba(59, 130, 246, 0.1)',
                    color: statusType === 'success' ? '#10b981'
                        : statusType === 'error' ? '#ef4444'
                            : '#60a5fa',
                    border: `1px solid ${statusType === 'success' ? 'rgba(16, 185, 129, 0.3)'
                        : statusType === 'error' ? 'rgba(239, 68, 68, 0.3)'
                            : 'rgba(59, 130, 246, 0.3)'}`
                }}>
                    {statusMsg}
                </div>
            )}

            {/* ================================================ */}
            {/* REPORT 1: Employee History */}
            {/* ================================================ */}
            {activeReport === 'employee' && (
                <div className="glass-panel">
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        👤 Employee Salary History Report
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                        Generate a detailed Excel with all earnings + deductions for each month.
                        Includes a separate Summary sheet with totals.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                Select Employee *
                            </label>
                            <select
                                className="input-field"
                                value={selectedHrpn}
                                onChange={e => setSelectedHrpn(e.target.value)}
                            >
                                <option value="">-- Select Employee --</option>
                                {employees.filter(e => e.hrpn).map(e => (
                                    <option key={e.id} value={e.hrpn}>
                                        {e.corrected_name} ({e.hrpn})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                From Month (optional)
                            </label>
                            <input
                                type="month"
                                className="input-field"
                                value={empFromMonth}
                                onChange={e => setEmpFromMonth(e.target.value)}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                To Month (optional)
                            </label>
                            <input
                                type="month"
                                className="input-field"
                                value={empToMonth}
                                onChange={e => setEmpToMonth(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Quick month range buttons */}
                    {availableMonths.length > 0 && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginRight: '0.75rem' }}>Available months:</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                                {availableMonths.map(m => (
                                    <span key={m} style={{
                                        display: 'inline-block',
                                        padding: '0.2rem 0.6rem',
                                        borderRadius: '2rem',
                                        fontSize: '0.75rem',
                                        background: 'rgba(59, 130, 246, 0.1)',
                                        border: '1px solid rgba(59, 130, 246, 0.2)',
                                        color: '#93c5fd'
                                    }}>
                                        {formatMonthLabel(m)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    <button
                        onClick={generateEmployeeReport}
                        disabled={generating}
                        className="btn btn-primary"
                        style={{ fontSize: '1rem', padding: '0.85rem 2.5rem' }}
                    >
                        {generating ? '⏳ Generating...' : '📥 Download Employee Report'}
                    </button>
                </div>
            )}

            {/* ================================================ */}
            {/* REPORT 2: Monthly Report */}
            {/* ================================================ */}
            {activeReport === 'monthly' && (
                <div className="glass-panel">
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        📅 Monthly Payroll Report
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                        Generate a consolidated report for all employees for a specific month.
                        Includes key earnings, deductions, and PAN numbers.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                Select Month *
                            </label>
                            <input
                                type="month"
                                className="input-field"
                                value={monthlyMonth}
                                onChange={e => setMonthlyMonth(e.target.value)}
                            />
                        </div>
                        <div>
                            {availableMonths.length > 0 && (
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                        Quick Select
                                    </label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                        {availableMonths.map(m => (
                                            <button
                                                key={m}
                                                className="btn btn-secondary"
                                                onClick={() => setMonthlyMonth(dateToMonthInput(m))}
                                                style={{
                                                    fontSize: '0.75rem',
                                                    padding: '0.3rem 0.75rem',
                                                    background: monthlyMonth === dateToMonthInput(m) ? 'rgba(59, 130, 246, 0.2)' : undefined,
                                                    borderColor: monthlyMonth === dateToMonthInput(m) ? 'var(--primary)' : undefined
                                                }}
                                            >
                                                {formatMonthLabel(m)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <button
                        onClick={generateMonthlyReport}
                        disabled={generating}
                        className="btn btn-primary"
                        style={{ fontSize: '1rem', padding: '0.85rem 2.5rem' }}
                    >
                        {generating ? '⏳ Generating...' : '📥 Download Monthly Report'}
                    </button>
                </div>
            )}

            {/* ================================================ */}
            {/* REPORT 3: IT Summary */}
            {/* ================================================ */}
            {activeReport === 'it_summary' && (
                <div className="glass-panel">
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        🧾 Income Tax Summary Report
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                        Generate a summary with each employee&apos;s <strong>Name</strong>, <strong>Designation</strong>,
                        <strong> Total Gross Earnings</strong>, <strong>Total Income Tax Paid</strong>, and <strong>PAN Number</strong>.
                        Aggregated across the selected month range.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                From Month (optional — blank = all time)
                            </label>
                            <input
                                type="month"
                                className="input-field"
                                value={itFromMonth}
                                onChange={e => setItFromMonth(e.target.value)}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                To Month (optional — blank = all time)
                            </label>
                            <input
                                type="month"
                                className="input-field"
                                value={itToMonth}
                                onChange={e => setItToMonth(e.target.value)}
                            />
                        </div>
                    </div>

                    <button
                        onClick={generateITSummary}
                        disabled={generating}
                        className="btn"
                        style={{
                            fontSize: '1rem',
                            padding: '0.85rem 2.5rem',
                            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                            color: 'white',
                            border: 'none'
                        }}
                    >
                        {generating ? '⏳ Generating...' : '📥 Download IT Summary'}
                    </button>
                </div>
            )}

            {/* ================================================ */}
            {/* REPORT 4: Full Payroll Summary */}
            {/* ================================================ */}
            {activeReport === 'full_summary' && (
                <div className="glass-panel">
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        📊 Full Payroll Data Export
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                        Export the complete payroll data for a month — includes all 15+ earning fields,
                        8+ deduction fields, PAN, HRPN, and totals row.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                Select Month *
                            </label>
                            <input
                                type="month"
                                className="input-field"
                                value={fullMonth}
                                onChange={e => setFullMonth(e.target.value)}
                            />
                        </div>
                        <div>
                            {availableMonths.length > 0 && (
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                        Quick Select
                                    </label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                        {availableMonths.map(m => (
                                            <button
                                                key={m}
                                                className="btn btn-secondary"
                                                onClick={() => setFullMonth(dateToMonthInput(m))}
                                                style={{
                                                    fontSize: '0.75rem',
                                                    padding: '0.3rem 0.75rem',
                                                    background: fullMonth === dateToMonthInput(m) ? 'rgba(59, 130, 246, 0.2)' : undefined,
                                                    borderColor: fullMonth === dateToMonthInput(m) ? 'var(--primary)' : undefined
                                                }}
                                            >
                                                {formatMonthLabel(m)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <button
                        onClick={generateFullSummary}
                        disabled={generating}
                        className="btn"
                        style={{
                            fontSize: '1rem',
                            padding: '0.85rem 2.5rem',
                            background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
                            color: 'white',
                            border: 'none'
                        }}
                    >
                        {generating ? '⏳ Generating...' : '📥 Download Full Payroll'}
                    </button>
                </div>
            )}

            {/* Info Section */}
            <div className="glass-panel" style={{ marginTop: '2rem', padding: '1.25rem 1.5rem' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: 'var(--text-muted)' }}>💡 Tips</h3>
                <ul style={{ color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: 1.8, paddingLeft: '1.5rem' }}>
                    <li><strong>Employee Report:</strong> Leave month range blank to get all available months</li>
                    <li><strong>IT Summary:</strong> Best used for financial year — e.g. April 2025 to March 2026</li>
                    <li><strong>PAN numbers</strong> are pulled from the Employee Database. Make sure to fill them in!</li>
                    <li><strong>Names</strong> use corrected names from Employee Database where available</li>
                    <li>All reports include a <strong>totals row</strong> at the bottom</li>
                </ul>
            </div>
        </div>
    );
}
