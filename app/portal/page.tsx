'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

export default function EmployeeDashboard() {
    const [employee, setEmployee] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        let authSubscription: any;

        const fetchSessionAndData = async () => {
            // Check for PKCE flow - usually means we are actively exchanging code for session in background
            const isExchangingCode = typeof window !== 'undefined' && window.location.search.includes('code=');

            const { data: { session }, error: sessionError } = await supabase.auth.getSession();

            if (sessionError || !session) {
                if (isExchangingCode) {
                    // Just wait. Supabase is doing its thing. `onAuthStateChange` will fire shortly.
                    return;
                }
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
                // Highly unlikely unless deleted after login
                console.error("No employee found for this email", email);
            } else {
                setEmployee(empData);
            }

            setLoading(false);
        };

        fetchSessionAndData();

        // Listen for when Supabase finishes exchanging the code for a session
        const { data: authListener } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (event === 'SIGNED_IN') {
                    fetchSessionAndData();
                }
            }
        );

        authSubscription = authListener.subscription;

        return () => {
            if (authSubscription) {
                authSubscription.unsubscribe();
            }
        };
    }, [router, supabase]);

    if (loading) {
        return (
            <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                Loading your profile...
            </div>
        );
    }

    if (!employee) {
        return (
            <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                Error loading employee profile. Please contact human resources.
            </div>
        );
    }

    return (
        <div className="container animate-fade-in" style={{ paddingBottom: '4rem' }}>
            <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                <div style={{ fontSize: '3.5rem', lineHeight: '1' }}>👋</div>
                <div>
                    <h1 className="page-title" style={{ textAlign: 'left', margin: 0, color: 'white', fontSize: '2rem' }}>
                        Welcome Back,
                    </h1>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981', marginTop: '0.25rem' }}>
                        {employee.corrected_name || 'Employee'}
                    </div>
                </div>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
                Your personal digital portal. Here you can view your official payroll data, access historical payslips, and manage your tax declarations.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 1fr)', gap: '2rem' }}>

                {/* Profile Card */}
                <div className="glass-panel" style={{ borderTop: '4px solid #10b981' }}>
                    <h2 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        👤 My Digital Profile
                    </h2>

                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1rem' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.2rem' }}>Official Name on Record</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{employee.corrected_name}</div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                        <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '0.5rem' }}>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.2rem' }}>HRPN (Payroll No.)</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', fontFamily: 'monospace', color: '#60a5fa' }}>{employee.hrpn}</div>
                        </div>
                        <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '0.5rem' }}>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.2rem' }}>PAN Number</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', fontFamily: 'monospace', color: '#10b981' }}>{employee.pan_number || 'Missing'}</div>
                        </div>
                    </div>
                </div>

                {/* Quick Actions (To be built in Phase 3) */}
                <div className="glass-panel" style={{ borderTop: '4px solid #8b5cf6' }}>
                    <h2 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        ⚡ Quick Actions
                    </h2>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                        <button
                            className="btn"
                            style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', textAlign: 'left' }}
                            onClick={() => router.push('/portal/payslips')}
                        >
                            <div style={{ fontSize: '2rem' }}>📄</div>
                            <div>
                                <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'white', marginBottom: '0.2rem' }}>Download Payslips</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Get official PDF copies of your historical salary slips.</div>
                            </div>
                        </button>

                        <button
                            className="btn"
                            style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', textAlign: 'left', cursor: 'pointer' }}
                            onClick={() => router.push('/portal/tax-declarations')}
                        >
                            <div style={{ fontSize: '2rem' }}>💰</div>
                            <div>
                                <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'white', marginBottom: '0.2rem' }}>Declare Tax Savings</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Submit your HRA, LIC, and Section 80C/80D amounts.</div>
                            </div>
                        </button>

                        <button
                            className="btn"
                            style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', textAlign: 'left', cursor: 'pointer' }}
                            onClick={() => router.push('/portal/tax-projection')}
                        >
                            <div style={{ fontSize: '2rem' }}>⚖️</div>
                            <div>
                                <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'white', marginBottom: '0.2rem' }}>My Form 16 & Tax Info</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>View AI live projections and download official Form 16.</div>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
