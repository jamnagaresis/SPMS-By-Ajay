'use client';

import React, { useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import {
    processPayrollFromFiles,
    payrollToSupabaseRow,
    monthYearToDate,
    type PayrollRecord,
    type ProcessPayrollResult,
    type ProgressCallback
} from '@/lib/pdf-parser';

interface LogEntry {
    time: string;
    step: string;
    detail: string;
    type: 'info' | 'success' | 'error' | 'warning';
}

export default function PayrollUploadPage() {
    const [files, setFiles] = useState<File[]>([]);
    const [selectedMonth, setSelectedMonth] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isPushing, setIsPushing] = useState(false);
    const [result, setResult] = useState<ProcessPayrollResult | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [pushComplete, setPushComplete] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const supabase = createClient();

    const addLog = useCallback((step: string, detail: string, type: LogEntry['type'] = 'info') => {
        setLogs(prev => [...prev, {
            time: new Date().toLocaleTimeString(),
            step,
            detail,
            type
        }]);
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const selectedFiles = Array.from(e.target.files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
            setFiles(selectedFiles);
            setResult(null);
            setLogs([]);
            setPushComplete(false);

            if (selectedFiles.length > 0) {
                addLog('Files', `${selectedFiles.length} PDF(s) selected: ${selectedFiles.map(f => f.name).join(', ')}`, 'info');
            }
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
        setFiles(droppedFiles);
        setResult(null);
        setLogs([]);
        setPushComplete(false);

        if (droppedFiles.length > 0) {
            addLog('Files', `${droppedFiles.length} PDF(s) dropped: ${droppedFiles.map(f => f.name).join(', ')}`, 'info');
        }
    };

    const processFiles = async () => {
        if (files.length === 0) return;
        setIsProcessing(true);
        setResult(null);
        setLogs([]);
        setPushComplete(false);

        try {
            addLog('Start', 'Reading PDF files into memory...', 'info');

            // Read all files into ArrayBuffers
            const fileBuffers = await Promise.all(
                files.map(async (file) => ({
                    name: file.name,
                    buffer: await file.arrayBuffer()
                }))
            );

            addLog('Ready', `${fileBuffers.length} files loaded. Starting parser...`, 'info');

            const onProgress: ProgressCallback = (step, detail) => {
                addLog(step, detail, 'info');
            };

            const processResult = await processPayrollFromFiles(fileBuffers, onProgress);
            setResult(processResult);

            // Auto-detect month from PDF
            if (processResult.metadata.month && !selectedMonth) {
                setSelectedMonth(processResult.metadata.month);
            }

            addLog('Done', `Successfully parsed ${processResult.payroll.length} employees`, 'success');

            if (processResult.validation.errors.length > 0) {
                processResult.validation.errors.forEach(e => addLog('Error', e, 'error'));
            }
            if (processResult.validation.warnings.length > 0) {
                processResult.validation.warnings.forEach(w => addLog('Warning', w, 'warning'));
            }
        } catch (err: any) {
            addLog('Fatal', err.message || 'Unknown error', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const pushToSupabase = async () => {
        if (!result || result.payroll.length === 0) return;

        const monthYear = result.metadata.month || selectedMonth;
        if (!monthYear) {
            addLog('Error', 'No month detected. Please select a month.', 'error');
            return;
        }

        setIsPushing(true);
        addLog('Upload', 'Preparing data for Supabase...', 'info');

        try {
            const monthDate = monthYearToDate(monthYear);
            const sourceFiles = files.map(f => f.name);

            const rows = result.payroll.map(record =>
                payrollToSupabaseRow(record, monthDate, monthYear, sourceFiles, result.metadata.billNo, result.metadata.office)
            );

            addLog('Upload', `Upserting ${rows.length} records to Supabase...`, 'info');

            // Upsert in batches of 50
            const batchSize = 50;
            let successCount = 0;
            let errorCount = 0;

            for (let i = 0; i < rows.length; i += batchSize) {
                const batch = rows.slice(i, i + batchSize);
                const { error } = await supabase
                    .from('payroll_records')
                    .upsert(batch, { onConflict: 'hrpn,month_date' });

                if (error) {
                    console.error('Supabase upsert error:', error);
                    addLog('Error', `Batch ${Math.floor(i / batchSize) + 1} failed: ${error.message}`, 'error');
                    errorCount += batch.length;
                } else {
                    successCount += batch.length;
                    addLog('Upload', `Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} records saved`, 'success');
                }
            }

            if (errorCount === 0) {
                addLog('Complete', `✅ All ${successCount} records saved to Supabase for ${monthYear}!`, 'success');
                setPushComplete(true);
            } else {
                addLog('Partial', `${successCount} saved, ${errorCount} failed`, 'warning');
            }
        } catch (err: any) {
            addLog('Fatal', `Upload failed: ${err.message}`, 'error');
        } finally {
            setIsPushing(false);
        }
    };

    const formatCurrency = (val: number) => {
        if (!val && val !== 0) return '-';
        return '₹' + val.toLocaleString('en-IN');
    };

    return (
        <main className="container animate-fade-in" style={{ paddingBottom: '4rem' }}>
            <h1 className="page-title" style={{ textAlign: 'left' }}>
                📊 Payroll PDF Upload
            </h1>

            {/* Upload Section */}
            <div className="glass-panel" style={{ marginBottom: '2rem' }}>
                <h2 style={{
                    fontSize: '1.25rem', marginBottom: '1.5rem',
                    borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem',
                    display: 'flex', alignItems: 'center', gap: '0.5rem'
                }}>
                    <span style={{ fontSize: '1.4rem' }}>📄</span>
                    Upload Payroll PDFs
                </h2>

                <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                    Upload both <strong>Earning Side</strong> and <strong>Deduction Side</strong> PDFs.
                    The parser will auto-detect, merge by HRPN, and validate all data.
                </p>

                {/* Month Selection */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Month Override (auto-detected from PDF if available)
                    </label>
                    <input
                        type="month"
                        className="input-field"
                        style={{ maxWidth: '300px' }}
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        placeholder="Auto-detected from PDF"
                    />
                    {result?.metadata.month && (
                        <span style={{ marginLeft: '1rem', color: 'var(--success)', fontSize: '0.85rem' }}>
                            📅 Detected: {result.metadata.month}
                        </span>
                    )}
                </div>

                {/* Drop Zone */}
                <div
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                        border: '2px dashed var(--glass-border)',
                        borderRadius: '1rem',
                        padding: '3rem',
                        textAlign: 'center',
                        background: files.length > 0 ? 'rgba(16, 185, 129, 0.05)' : 'rgba(255,255,255,0.01)',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        position: 'relative'
                    }}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".pdf"
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                    />
                    <div style={{ pointerEvents: 'none' }}>
                        <p style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
                            {files.length > 0 ? '✅' : '📁'}
                        </p>
                        <p style={{ fontSize: '1.2rem', marginBottom: '0.5rem', fontWeight: 600 }}>
                            {files.length > 0
                                ? `${files.length} PDF(s) selected`
                                : 'Drop PDF files here or click to browse'}
                        </p>
                        {files.length > 0 && (
                            <div style={{ marginTop: '0.5rem' }}>
                                {files.map((f, i) => (
                                    <span key={i} style={{
                                        display: 'inline-block',
                                        background: 'rgba(59, 130, 246, 0.1)',
                                        border: '1px solid rgba(59, 130, 246, 0.2)',
                                        padding: '0.25rem 0.75rem',
                                        borderRadius: '2rem',
                                        margin: '0.25rem',
                                        fontSize: '0.8rem',
                                        color: '#93c5fd'
                                    }}>
                                        📄 {f.name}
                                    </span>
                                ))}
                            </div>
                        )}
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                            Supports: Pay Bill Earning & Deduction PDFs
                        </p>
                    </div>
                </div>

                {/* Action Buttons */}
                {files.length > 0 && (
                    <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button
                            onClick={processFiles}
                            disabled={isProcessing}
                            className="btn btn-primary"
                            style={{ minWidth: '200px', fontSize: '1rem', padding: '0.85rem 2rem' }}
                        >
                            {isProcessing ? (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span className="spinner"></span> Parsing PDFs...
                                </span>
                            ) : '🧠 Extract Data from PDFs'}
                        </button>

                        {result && result.payroll.length > 0 && !pushComplete && (
                            <button
                                onClick={pushToSupabase}
                                disabled={isPushing}
                                className="btn"
                                style={{
                                    minWidth: '200px',
                                    fontSize: '1rem',
                                    padding: '0.85rem 2rem',
                                    background: 'linear-gradient(135deg, #10b981, #059669)',
                                    color: 'white',
                                    border: 'none'
                                }}
                            >
                                {isPushing ? (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span className="spinner"></span> Uploading...
                                    </span>
                                ) : '🚀 Push to Supabase'}
                            </button>
                        )}

                        {pushComplete && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                background: 'rgba(16, 185, 129, 0.1)',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                padding: '0.85rem 2rem',
                                borderRadius: '0.5rem',
                                color: '#10b981',
                                fontWeight: 600
                            }}>
                                ✅ Data Saved to Supabase!
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Live Log Console */}
            {logs.length > 0 && (
                <div className="glass-panel animate-fade-in" style={{ marginBottom: '2rem' }}>
                    <h2 style={{
                        fontSize: '1.1rem', marginBottom: '1rem',
                        display: 'flex', alignItems: 'center', gap: '0.5rem'
                    }}>
                        <span>🖥️</span> Live Processing Log
                    </h2>
                    <div style={{
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: '0.5rem',
                        padding: '1rem',
                        maxHeight: '250px',
                        overflowY: 'auto',
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                        lineHeight: '1.6'
                    }}>
                        {logs.map((log, i) => (
                            <div key={i} style={{
                                color: log.type === 'success' ? '#10b981'
                                    : log.type === 'error' ? '#ef4444'
                                        : log.type === 'warning' ? '#f59e0b'
                                            : '#94a3b8'
                            }}>
                                <span style={{ opacity: 0.5 }}>[{log.time}]</span>{' '}
                                <span style={{ color: '#60a5fa', fontWeight: 600 }}>[{log.step}]</span>{' '}
                                {log.detail}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Results Summary */}
            {result && (
                <div className="animate-fade-in">
                    {/* Stats Cards */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '1rem',
                        marginBottom: '2rem'
                    }}>
                        <StatCard
                            icon="👥"
                            label="Employees"
                            value={result.payroll.length.toString()}
                            color="#3b82f6"
                        />
                        <StatCard
                            icon="💰"
                            label="Total Gross"
                            value={formatCurrency(result.validation.summary.totalGross)}
                            color="#10b981"
                        />
                        <StatCard
                            icon="📉"
                            label="Total Deductions"
                            value={formatCurrency(result.validation.summary.totalDeductions)}
                            color="#f59e0b"
                        />
                        <StatCard
                            icon="💵"
                            label="Total Net Pay"
                            value={formatCurrency(result.validation.summary.totalNetPay)}
                            color="#8b5cf6"
                        />
                        <StatCard
                            icon={result.validation.isValid ? "✅" : "⚠️"}
                            label="Validation"
                            value={`${result.validation.validRecords}/${result.validation.totalRecords} valid`}
                            color={result.validation.isValid ? '#10b981' : '#f59e0b'}
                        />
                        <StatCard
                            icon="📄"
                            label="Files Parsed"
                            value={`${result.metadata.files.length} PDFs`}
                            color="#06b6d4"
                        />
                    </div>

                    {/* Detected Meta */}
                    {result.metadata.month && (
                        <div className="glass-panel" style={{ marginBottom: '2rem', padding: '1.25rem 1.5rem' }}>
                            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', fontSize: '0.9rem' }}>
                                <div><strong style={{ color: 'var(--text-muted)' }}>Month:</strong> <span style={{ color: '#60a5fa' }}>{result.metadata.month}</span></div>
                                {result.metadata.billNo && (
                                    <div><strong style={{ color: 'var(--text-muted)' }}>Bill No:</strong> <span style={{ color: '#60a5fa' }}>{result.metadata.billNo}</span></div>
                                )}
                                {result.metadata.office && (
                                    <div><strong style={{ color: 'var(--text-muted)' }}>Office:</strong> <span style={{ color: '#60a5fa' }}>{result.metadata.office}</span></div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Employee Data Table */}
                    <div className="glass-panel">
                        <h2 style={{
                            fontSize: '1.25rem', marginBottom: '1rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                        }}>
                            <span>📋 Extracted Payroll Data ({result.payroll.length} employees)</span>
                        </h2>

                        <div className="table-container" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                            <table>
                                <thead>
                                    <tr>
                                        <th style={{ width: '50px' }}>#</th>
                                        <th>HRPN</th>
                                        <th>Name</th>
                                        <th>Designation</th>
                                        <th style={{ textAlign: 'right' }}>Gross</th>
                                        <th style={{ textAlign: 'right' }}>Income Tax</th>
                                        <th style={{ textAlign: 'right' }}>Total Ded</th>
                                        <th style={{ textAlign: 'right' }}>Net Pay</th>
                                        <th style={{ width: '60px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.payroll.map((rec, idx) => (
                                        <React.Fragment key={rec.hrpn}>
                                            <tr
                                                onClick={() => setExpandedRow(expandedRow === rec.hrpn ? null : rec.hrpn)}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <td style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                                                <td style={{ fontFamily: 'monospace', color: '#60a5fa' }}>{rec.hrpn}</td>
                                                <td style={{ fontWeight: 600 }}>{rec.name}</td>
                                                <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{rec.designation}</td>
                                                <td style={{ textAlign: 'right', color: '#10b981' }}>{formatCurrency(rec.gross)}</td>
                                                <td style={{ textAlign: 'right', color: rec.deduction.incomeTax > 0 ? '#f59e0b' : 'var(--text-muted)' }}>
                                                    {formatCurrency(rec.deduction.incomeTax || 0)}
                                                </td>
                                                <td style={{ textAlign: 'right', color: '#ef4444' }}>{formatCurrency(rec.totalDed)}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(rec.netPay)}</td>
                                                <td style={{ textAlign: 'center', fontSize: '0.75rem' }}>
                                                    {expandedRow === rec.hrpn ? '▲' : '▼'}
                                                </td>
                                            </tr>
                                            {expandedRow === rec.hrpn && (
                                                <tr>
                                                    <td colSpan={9} style={{ padding: '1rem 2rem', background: 'rgba(255,255,255,0.02)' }}>
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                                            {/* Earnings */}
                                                            <div>
                                                                <h4 style={{ color: '#10b981', marginBottom: '0.5rem', fontSize: '0.9rem' }}>💰 Earnings</h4>
                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem', fontSize: '0.8rem' }}>
                                                                    {Object.entries(rec.earning).map(([key, val]) => (
                                                                        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.15rem 0' }}>
                                                                            <span style={{ color: 'var(--text-muted)' }}>{formatFieldName(key)}</span>
                                                                            <span style={{ fontFamily: 'monospace' }}>{formatCurrency(val)}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                            {/* Deductions */}
                                                            <div>
                                                                <h4 style={{ color: '#f59e0b', marginBottom: '0.5rem', fontSize: '0.9rem' }}>📉 Deductions</h4>
                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem', fontSize: '0.8rem' }}>
                                                                    {Object.entries(rec.deduction).map(([key, val]) => (
                                                                        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.15rem 0' }}>
                                                                            <span style={{ color: 'var(--text-muted)' }}>{formatFieldName(key)}</span>
                                                                            <span style={{ fontFamily: 'monospace' }}>{formatCurrency(val)}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
        .spinner {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-radius: 50%;
          border-top-color: white;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      ` }} />
        </main>
    );
}

// ============================================================
// Sub-components
// ============================================================

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
    return (
        <div className="glass-panel" style={{
            padding: '1.25rem',
            textAlign: 'center',
            borderTop: `3px solid ${color}`
        }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{icon}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>{label}</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color }}>{value}</div>
        </div>
    );
}

function formatFieldName(key: string): string {
    const names: Record<string, string> = {
        basic: 'Basic Pay', da: 'DA', hra: 'HRA', cla: 'CLA',
        medAllow: 'Med Allow', transAllow: 'Trans Allow', bookAllow: 'Book Allow',
        nppAllow: 'NPP Allow', nppallow: 'NPP Allow', esisAllow: 'ESIS Allow',
        specialPay: 'Special Pay', washingAllow: 'Washing Allow',
        nursingAllow: 'Nursing Allow', uniformAllow: 'Uniform Allow',
        recoveryOfPay: 'Recovery of Pay', gross: 'Gross', slo: 'SLO',
        incomeTax: 'Income Tax', profTax: 'Prof Tax', gpfReg: 'GPF Reg',
        gpfClass4: 'GPF Class 4', npsReg: 'NPS Reg', rnb: 'R&B',
        govtFund: 'Govt Fund', govtSaving: 'Govt Saving',
        totalDed: 'Total Ded', netPay: 'Net Pay'
    };
    return names[key] || key;
}
