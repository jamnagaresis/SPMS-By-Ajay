'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

export default function EmployeeLoginPage() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const supabase = createClient();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setLoading(true);

        try {
            // First, Verify this email actually belongs to an active employee
            const { data: empData, error: empError } = await supabase
                .from('employees')
                .select('id, corrected_name')
                .ilike('email', email)
                .single();

            if (empError || !empData) {
                setError('Sorry, we could not find an employee record linked to this email address. Please contact HR.');
                setLoading(false);
                return;
            }

            // If employee exists, send them a Magic Link
            const { error: signInError } = await supabase.auth.signInWithOtp({
                email: email,
                options: {
                    emailRedirectTo: `https://spms-ochre.vercel.app/auth/callback?next=/portal`
                }
            });

            if (signInError) throw signInError;

            setMessage(`Magic link sent! Please check your email (${email}) to securely log in.`);
        } catch (err: any) {
            setError(err.message || 'Error sending login link');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem'
        }}>
            <div className="glass-panel animate-fade-in" style={{
                maxWidth: '450px',
                width: '100%',
                position: 'relative'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{
                        background: 'linear-gradient(135deg, #10b981, #3b82f6)',
                        width: '70px',
                        height: '70px',
                        borderRadius: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 1rem',
                        fontSize: '2rem',
                    }}>
                        🏢
                    </div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>SPMS Employee Portal</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Secure Self-Service Access</p>
                </div>

                {message ? (
                    <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '0.5rem', color: '#10b981' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📧</div>
                        <h3 style={{ marginBottom: '0.5rem' }}>Check Your Inbox</h3>
                        <p style={{ fontSize: '0.9rem' }}>{message}</p>
                    </div>
                ) : (
                    <form onSubmit={handleLogin}>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Work Email Address</label>
                            <input
                                type="email"
                                className="input-field"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@hospital.com"
                                required
                            />
                        </div>

                        {error && (
                            <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                                ⚠️ {error}
                            </div>
                        )}

                        <button type="submit" className="btn btn-primary w-full" disabled={loading} style={{ background: '#10b981' }}>
                            {loading ? 'Sending Link...' : 'Send Magic Link'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
