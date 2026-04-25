'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import * as XLSX from 'xlsx';

interface Employee {
    id: string;
    original_name: string;
    corrected_name: string;
    pan_number: string;
    hrpn: string;
    email?: string;
}

export default function AdminPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [syncing, setSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState('');

    // Month deletion state
    const [availableMonths, setAvailableMonths] = useState<string[]>([]);
    const [deleteMonth, setDeleteMonth] = useState('');
    const [isDeletingMonth, setIsDeletingMonth] = useState(false);
    const [deleteMonthMsg, setDeleteMonthMsg] = useState('');

    // Form State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        original_name: '',
        corrected_name: '',
        pan_number: '',
        hrpn: '',
        email: ''
    });

    const supabase = createClient();

    useEffect(() => {
        fetchEmployees();
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
        }
    };

    const fetchEmployees = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('employees')
            .select('*')
            .order('corrected_name', { ascending: true });

        if (error) {
            console.error('Error fetching employees:', error);
            alert('Error fetching data');
        } else {
            setEmployees(data || []);
        }
        setLoading(false);
    };

    const validatePan = (pan: string) => {
        if (!pan) return true;
        if (pan.length !== 10) return false;
        const numericPart = pan.substring(5, 9);
        return /^\d{4}$/.test(numericPart);
    };

    const validateHrpn = (hrpn: string) => {
        if (!hrpn) return true;
        return /^\d{8}$/.test(hrpn);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.corrected_name) {
            alert("Employee name is required");
            return;
        }

        if (formData.pan_number && !validatePan(formData.pan_number)) {
            alert("Wrong PAN Number! Must be 10 characters long and characters 6-9 must be digits (e.g., XXXXX1234X).");
            return;
        }

        if (formData.hrpn && !validateHrpn(formData.hrpn)) {
            alert("HRPN must be exactly 8 digits (e.g., 00125678).");
            return;
        }

        try {
            const saveData: any = {
                corrected_name: formData.corrected_name,
                pan_number: formData.pan_number || null,
                hrpn: formData.hrpn || null,
                email: formData.email ? formData.email.toLowerCase() : null,
                original_name: formData.original_name || formData.corrected_name
            };

            if (editingId) {
                const { error } = await supabase
                    .from('employees')
                    .update(saveData)
                    .eq('id', editingId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('employees')
                    .insert([saveData]);
                if (error) throw error;
            }

            setFormData({ original_name: '', corrected_name: '', pan_number: '', hrpn: '', email: '' });
            setEditingId(null);
            fetchEmployees();
        } catch (error: any) {
            alert('Error saving: ' + error.message);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this employee? This will NOT delete their payroll records.")) return;

        const { error } = await supabase.from('employees').delete().eq('id', id);
        if (error) alert('Error deleting: ' + error.message);
        else fetchEmployees();
    };

    const handleEdit = (emp: Employee) => {
        setEditingId(emp.id);
        setFormData({
            original_name: emp.original_name || '',
            corrected_name: emp.corrected_name,
            pan_number: emp.pan_number || '',
            hrpn: emp.hrpn || '',
            email: emp.email || ''
        });
        // Scroll to top on mobile
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = event.target?.result;
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);

                const validRows: any[] = [];

                json.forEach((row: any) => {
                    const normalized: any = {};
                    Object.keys(row).forEach(k => {
                        const key = k.toLowerCase().trim();
                        if (key.includes('original') || key === 'raw name') normalized.original_name = String(row[k]);
                        if (key.includes('corrected') || key.includes('employee name') || key === 'name') normalized.corrected_name = String(row[k]);
                        if (key.includes('pan')) normalized.pan_number = String(row[k]);
                        if (key.includes('hrpn') || key.includes('payroll number') || key.includes('hr number')) normalized.hrpn = String(row[k]);
                    });

                    if (normalized.corrected_name) {
                        if (!normalized.original_name) normalized.original_name = normalized.corrected_name;
                        validRows.push(normalized);
                    }
                });

                if (validRows.length === 0) {
                    alert("No valid rows found. Ensure the file has 'Name', 'PAN', 'HRPN' columns.");
                    return;
                }

                const { error } = await supabase.from('employees').upsert(validRows, { onConflict: 'original_name' });

                if (error) {
                    console.error('Import error:', error);
                    alert("Error importing: " + error.message);
                } else {
                    alert(`Successfully imported/updated ${validRows.length} records.`);
                    fetchEmployees();
                }
            } catch (err: any) {
                console.error(err);
                alert("Error parsing file: " + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    // ================================================================
    // DELETE MONTH DATA
    // ================================================================
    const formatMonthLabel = (dateStr: string): string => {
        if (!dateStr) return '';
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    };

    const handleDeleteMonthData = async () => {
        if (!deleteMonth) {
            alert('Please select a month to delete.');
            return;
        }

        if (!confirm(`Are you absolutely sure you want to delete ALL payroll records for ${formatMonthLabel(deleteMonth)}? This cannot be undone.`)) {
            return;
        }

        setIsDeletingMonth(true);
        setDeleteMonthMsg('');

        try {
            const { error } = await supabase
                .from('payroll_records')
                .delete()
                .eq('month_date', deleteMonth);

            if (error) throw error;

            setDeleteMonthMsg(`✅ Successfully deleted all records for ${formatMonthLabel(deleteMonth)}.`);
            setDeleteMonth('');
            fetchAvailableMonths(); // refresh list
        } catch (error: any) {
            setDeleteMonthMsg(`❌ Error deleting records: ${error.message}`);
        } finally {
            setIsDeletingMonth(false);
        }
    };

    // ================================================================
    // AUTO-SYNC: Pull unique employees from payroll_records into employees table
    // This finds HRPNs in payroll_records that don't exist in employees yet
    // ================================================================
    const syncFromPayroll = async () => {
        setSyncing(true);
        setSyncMessage('');

        try {
            // Get all unique HRPN from payroll_records
            const { data: payrollEmployees, error: fetchError } = await supabase
                .from('payroll_records')
                .select('hrpn, name, designation')
                .order('hrpn');

            if (fetchError) throw fetchError;
            if (!payrollEmployees || payrollEmployees.length === 0) {
                setSyncMessage('No payroll records found.');
                setSyncing(false);
                return;
            }

            // Get unique HRPNs with best name (longest name is usually most complete)
            const hrpnMap = new Map<string, { name: string; designation: string }>();
            payrollEmployees.forEach(r => {
                if (!hrpnMap.has(r.hrpn) || r.name.length > (hrpnMap.get(r.hrpn)?.name.length || 0)) {
                    hrpnMap.set(r.hrpn, { name: r.name, designation: r.designation || '' });
                }
            });

            // Get existing HRPNs in employees table
            const existingHrpns = new Set(employees.filter(e => e.hrpn).map(e => e.hrpn));

            // Find new HRPNs
            const newEmployees: any[] = [];
            hrpnMap.forEach((info, hrpn) => {
                if (!existingHrpns.has(hrpn)) {
                    newEmployees.push({
                        hrpn,
                        original_name: info.name,
                        corrected_name: info.name,
                        pan_number: null,
                        email: null
                    });
                }
            });

            if (newEmployees.length === 0) {
                setSyncMessage(`✅ All ${hrpnMap.size} employees already synced. No new records.`);
                setSyncing(false);
                return;
            }

            // Insert new employees
            const { error: insertError } = await supabase
                .from('employees')
                .insert(newEmployees);

            if (insertError) throw insertError;

            setSyncMessage(`✅ Synced ${newEmployees.length} new employees from payroll data! (${existingHrpns.size} already existed)`);
            fetchEmployees();
        } catch (err: any) {
            setSyncMessage(`❌ Error: ${err.message}`);
        } finally {
            setSyncing(false);
        }
    };

    const filteredEmployees = employees.filter(e => {
        const term = searchTerm.toLowerCase();
        return (
            (e.corrected_name || '').toLowerCase().includes(term) ||
            (e.original_name || '').toLowerCase().includes(term) ||
            (e.hrpn || '').includes(term) ||
            (e.pan_number || '').toLowerCase().includes(term) ||
            (e.email || '').toLowerCase().includes(term)
        );
    });

    const employeesWithoutPan = employees.filter(e => !e.pan_number);
    const employeesWithoutHrpn = employees.filter(e => !e.hrpn);

    return (
        <div className="container animate-fade-in" style={{ paddingBottom: '4rem' }}>
            <h1 className="page-title" style={{ textAlign: 'left', marginBottom: '1rem' }}>
                👤 Employee Database
            </h1>

            {/* Quick Stats */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '1rem',
                marginBottom: '2rem'
            }}>
                <div className="glass-panel" style={{ padding: '1rem', textAlign: 'center', borderTop: '3px solid #3b82f6' }}>
                    <div style={{ fontSize: '1.5rem' }}>👥</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Total Employees</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#3b82f6' }}>{employees.length}</div>
                </div>
                <div className="glass-panel" style={{ padding: '1rem', textAlign: 'center', borderTop: '3px solid #10b981' }}>
                    <div style={{ fontSize: '1.5rem' }}>🔗</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>With HRPN</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#10b981' }}>{employees.length - employeesWithoutHrpn.length}</div>
                </div>
                <div className="glass-panel" style={{ padding: '1rem', textAlign: 'center', borderTop: employeesWithoutPan.length > 0 ? '3px solid #f59e0b' : '3px solid #10b981' }}>
                    <div style={{ fontSize: '1.5rem' }}>{employeesWithoutPan.length > 0 ? '⚠️' : '✅'}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Missing PAN</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: employeesWithoutPan.length > 0 ? '#f59e0b' : '#10b981' }}>
                        {employeesWithoutPan.length}
                    </div>
                </div>
                <div className="glass-panel" style={{ padding: '1rem', textAlign: 'center', borderTop: employeesWithoutHrpn.length > 0 ? '3px solid #f59e0b' : '3px solid #10b981' }}>
                    <div style={{ fontSize: '1.5rem' }}>{employeesWithoutHrpn.length > 0 ? '⚠️' : '✅'}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Missing HRPN</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: employeesWithoutHrpn.length > 0 ? '#f59e0b' : '#10b981' }}>
                        {employeesWithoutHrpn.length}
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2.5fr', gap: '2rem' }}>
                {/* Form */}
                <div>
                    <div className="glass-panel" style={{ height: 'fit-content', marginBottom: '1rem' }}>
                        <h2 style={{ fontSize: '1.15rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                            {editingId ? '✏️ Edit Employee' : '➕ Add New Employee'}
                        </h2>
                        <form onSubmit={handleSave} className="flex-col gap-4">
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    HRPN (8-digit Payroll Number)
                                </label>
                                <input
                                    className="input-field"
                                    value={formData.hrpn}
                                    onChange={e => setFormData({ ...formData, hrpn: e.target.value })}
                                    placeholder="e.g. 00125678"
                                    maxLength={8}
                                    style={{ fontFamily: 'monospace', letterSpacing: '2px' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    Employee Name *
                                </label>
                                <input
                                    className="input-field"
                                    value={formData.corrected_name}
                                    onChange={e => setFormData({ ...formData, corrected_name: e.target.value })}
                                    placeholder="e.g. Dr. Chirag B. Pandya"
                                    required
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    Original Name (from PDF)
                                </label>
                                <input
                                    className="input-field"
                                    value={formData.original_name}
                                    onChange={e => setFormData({ ...formData, original_name: e.target.value })}
                                    placeholder="Auto-filled if blank"
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    PAN Number
                                </label>
                                <input
                                    className="input-field"
                                    value={formData.pan_number}
                                    onChange={e => setFormData({ ...formData, pan_number: e.target.value.toUpperCase() })}
                                    placeholder="ABCDE1234F"
                                    maxLength={10}
                                    style={{ fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '2px' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    Email Address (For Portal Login)
                                </label>
                                <input
                                    type="email"
                                    className="input-field"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    placeholder="employee@ssgh.com"
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                                <button type="submit" className="btn btn-primary w-full">
                                    {editingId ? 'Update' : 'Add Employee'}
                                </button>
                                {editingId && (
                                    <button type="button" className="btn btn-secondary" onClick={() => {
                                        setEditingId(null);
                                        setFormData({ original_name: '', corrected_name: '', pan_number: '', hrpn: '', email: '' });
                                    }}>
                                        Cancel
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>

                    {/* Sync from Payroll */}
                    <div className="glass-panel" style={{ borderTop: '3px solid #8b5cf6' }}>
                        <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            🔄 Auto-Sync from Payroll
                        </h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1rem' }}>
                            Pull all employees from uploaded payroll data. New HRPNs will be added automatically.
                        </p>
                        <button
                            onClick={syncFromPayroll}
                            disabled={syncing}
                            className="btn btn-primary w-full"
                            style={{ fontSize: '0.9rem' }}
                        >
                            {syncing ? '⏳ Syncing...' : '🔄 Sync Now'}
                        </button>
                        {syncMessage && (
                            <div style={{
                                marginTop: '0.75rem',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '0.5rem',
                                fontSize: '0.8rem',
                                background: syncMessage.includes('✅') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                color: syncMessage.includes('✅') ? '#10b981' : '#ef4444'
                            }}>
                                {syncMessage}
                            </div>
                        )}
                    </div>

                    {/* Delete Payroll Data */}
                    <div className="glass-panel" style={{ borderTop: '3px solid #ef4444', marginTop: '1rem' }}>
                        <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ef4444' }}>
                            ⚠️ Delete Month Data
                        </h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1rem' }}>
                            If data was extracted incorrectly, you can delete all records for a specific month and re-upload.
                        </p>

                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <select
                                className="input-field"
                                value={deleteMonth}
                                onChange={(e) => setDeleteMonth(e.target.value)}
                                style={{ flex: 1, padding: '0.5rem', appearance: 'auto' }}
                            >
                                <option value="">-- Select Month to Delete --</option>
                                {availableMonths.map(m => (
                                    <option key={m} value={m}>{formatMonthLabel(m)}</option>
                                ))}
                            </select>
                            <button
                                onClick={handleDeleteMonthData}
                                disabled={isDeletingMonth || !deleteMonth}
                                className="btn"
                                style={{
                                    background: '#ef4444',
                                    color: 'white',
                                    border: 'none',
                                    opacity: (isDeletingMonth || !deleteMonth) ? 0.5 : 1,
                                    padding: '0.5rem 1rem'
                                }}
                            >
                                {isDeletingMonth ? '⏳...' : '🗑️ Delete'}
                            </button>
                        </div>

                        {deleteMonthMsg && (
                            <div style={{
                                padding: '0.5rem 0.75rem',
                                borderRadius: '0.5rem',
                                fontSize: '0.8rem',
                                background: deleteMonthMsg.includes('✅') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                color: deleteMonthMsg.includes('✅') ? '#10b981' : '#ef4444'
                            }}>
                                {deleteMonthMsg}
                            </div>
                        )}
                    </div>
                </div>

                {/* Employee List */}
                <div className="glass-panel">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <h2 style={{ fontSize: '1.15rem', margin: 0 }}>
                            Employee Records ({filteredEmployees.length})
                        </h2>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <input
                                type="file"
                                id="csv-upload"
                                accept=".csv, .xlsx, .xls"
                                style={{ display: 'none' }}
                                onChange={handleImportCSV}
                            />
                            <button
                                className="btn btn-secondary"
                                onClick={() => document.getElementById('csv-upload')?.click()}
                                style={{ fontSize: '0.8rem', padding: '0.5rem 1rem' }}
                            >
                                📥 Import CSV
                            </button>
                            <input
                                className="input-field"
                                style={{ width: '250px' }}
                                placeholder="Search name, HRPN, PAN..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="table-container" style={{ maxHeight: '650px', overflowY: 'auto' }}>
                        <table>
                            <thead>
                                <tr>
                                    <th style={{ width: '50px' }}>#</th>
                                    <th>HRPN</th>
                                    <th>Employee Name</th>
                                    <th>PAN Number</th>
                                    <th style={{ width: '120px' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>Loading...</td></tr>
                                ) : filteredEmployees.length === 0 ? (
                                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                        {searchTerm ? 'No matching employees found' : 'No employees yet. Add one or sync from payroll data.'}
                                    </td></tr>
                                ) : (
                                    filteredEmployees.map((e, idx) => (
                                        <tr key={e.id}>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{idx + 1}</td>
                                            <td>
                                                {e.hrpn ? (
                                                    <span style={{ fontFamily: 'monospace', color: '#60a5fa', fontSize: '0.9rem' }}>{e.hrpn}</span>
                                                ) : (
                                                    <span style={{ color: '#f59e0b', fontSize: '0.8rem' }}>⚠️ Missing</span>
                                                )}
                                            </td>
                                            <td>
                                                <div style={{ fontWeight: 600 }}>{e.corrected_name}</div>
                                                {e.email && (
                                                    <div style={{ color: '#10b981', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem', marginTop: '0.2rem' }}>
                                                        📧 {e.email}
                                                    </div>
                                                )}
                                                {e.original_name && e.original_name !== e.corrected_name && (
                                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '0.2rem' }}>
                                                        PDF: {e.original_name}
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                {e.pan_number ? (
                                                    <span style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{e.pan_number}</span>
                                                ) : (
                                                    <span style={{ color: '#f59e0b', fontSize: '0.8rem' }}>⚠️ Missing</span>
                                                )}
                                            </td>
                                            <td>
                                                <button
                                                    onClick={() => handleEdit(e)}
                                                    style={{ color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', marginRight: '0.75rem', fontSize: '0.85rem' }}
                                                >
                                                    ✏️ Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(e.id)}
                                                    style={{ color: 'var(--error)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
                                                >
                                                    🗑️
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
