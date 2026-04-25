'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import {
    SecureStorage,
    RateLimiter,
    InputValidator,
    SessionManager,
    SecureErrors
} from '@/lib/security';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [isLockedOut, setIsLockedOut] = useState(false);
    const [lockoutTime, setLockoutTime] = useState(0);
    const [remainingAttempts, setRemainingAttempts] = useState(5);
    const router = useRouter();
    const supabase = createClient();

    // Load saved email on mount (NEVER load passwords)
    useEffect(() => {
        // Clear any old insecure storage
        SecureStorage.clearCredentials();

        const loadSavedData = async () => {
            const savedEmail = await SecureStorage.getRememberedEmail();
            if (savedEmail) {
                setEmail(savedEmail);
                setRememberMe(true);
            }
        };

        loadSavedData();

        // Check if already logged in
        const checkSession = async () => {
            // If exchanging code from magic link, skip immediate redirect
            const isExchangingCode = typeof window !== 'undefined' && window.location.search.includes('code=');

            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                // Check if session is expired
                if (SessionManager.isSessionExpired()) {
                    await supabase.auth.signOut();
                    setError('Your session has expired. Please login again.');
                } else {
                    SessionManager.updateActivity();
                    router.push('/payroll');
                }
            } else if (isExchangingCode) {
                // Just wait. Supabase is doing its thing. `onAuthStateChange` will fire shortly.
                return;
            }
        };
        checkSession();

        // Listen for when Supabase finishes exchanging the code for a session
        const { data: authListener } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (event === 'SIGNED_IN') {
                    checkSession();
                }
            }
        );

        // Check lockout status
        updateLockoutStatus();

        return () => {
            if (authListener && authListener.subscription) {
                authListener.subscription.unsubscribe();
            }
        };
    }, [router, supabase]);

    // Update lockout status
    const updateLockoutStatus = () => {
        const lockoutStatus = RateLimiter.isLockedOut();
        setIsLockedOut(lockoutStatus.locked);
        if (lockoutStatus.locked && lockoutStatus.remainingTime) {
            setLockoutTime(lockoutStatus.remainingTime);
        }
        setRemainingAttempts(RateLimiter.getRemainingAttempts());
    };

    // Countdown timer for lockout
    useEffect(() => {
        if (isLockedOut && lockoutTime > 0) {
            const timer = setInterval(() => {
                setLockoutTime(prev => {
                    if (prev <= 1) {
                        updateLockoutStatus();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [isLockedOut, lockoutTime]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // Check if locked out
        const lockoutStatus = RateLimiter.isLockedOut();
        if (lockoutStatus.locked) {
            setError(`Too many failed attempts. Please wait ${Math.ceil((lockoutStatus.remainingTime || 0) / 60)} minutes.`);
            setIsLockedOut(true);
            setLockoutTime(lockoutStatus.remainingTime || 0);
            return;
        }

        // Validate and sanitize email
        const emailValidation = InputValidator.validateEmail(email);
        if (!emailValidation.valid) {
            setError(emailValidation.error || 'Invalid email');
            return;
        }

        // Validate password
        const passwordValidation = InputValidator.validatePassword(password);
        if (!passwordValidation.valid) {
            setError(passwordValidation.error || 'Invalid password');
            return;
        }

        setLoading(true);

        try {
            // Use sanitized email
            const { data, error: signInError } = await supabase.auth.signInWithPassword({
                email: emailValidation.sanitized,
                password: password, // Supabase handles password securely
            });

            if (signInError) {
                // Record failed attempt
                RateLimiter.recordAttempt(false);
                updateLockoutStatus();

                // Use safe error message that doesn't expose details
                throw new Error(SecureErrors.getSafeErrorMessage(signInError));
            }

            // Success - clear failed attempts
            RateLimiter.recordAttempt(true);

            // Save ONLY email if remember me is checked (NEVER save password)
            if (rememberMe) {
                await SecureStorage.setRememberedEmail(emailValidation.sanitized);
            } else {
                SecureStorage.clearCredentials();
            }

            // Initialize session tracking
            SessionManager.updateActivity();

            router.push('/payroll');
        } catch (err: any) {
            setError(err.message || 'Login failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
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
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/* Security indicator */}
                <div style={{
                    position: 'absolute',
                    top: '1rem',
                    right: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: 'var(--success)',
                    fontSize: '0.75rem',
                    background: 'rgba(16, 185, 129, 0.1)',
                    padding: '0.4rem 0.75rem',
                    borderRadius: '1rem',
                    border: '1px solid rgba(16, 185, 129, 0.3)'
                }}>
                    🔒 Secure Login
                </div>

                {/* Decorative gradient orb */}
                <div style={{
                    position: 'absolute',
                    top: '-100px',
                    right: '-100px',
                    width: '250px',
                    height: '250px',
                    background: 'radial-gradient(circle, rgba(59, 130, 246, 0.3), transparent 70%)',
                    borderRadius: '50%',
                    filter: 'blur(40px)',
                    pointerEvents: 'none'
                }} />

                {/* Logo/Title Section */}
                <div style={{ textAlign: 'center', marginBottom: '2.5rem', position: 'relative' }}>
                    <div style={{
                        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                        width: '80px',
                        height: '80px',
                        borderRadius: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 1.5rem',
                        fontSize: '2.5rem',
                        boxShadow: '0 8px 32px rgba(59, 130, 246, 0.3)',
                        animation: 'float 3s ease-in-out infinite'
                    }}>
                        📊
                    </div>
                    <h1 style={{
                        fontSize: '2rem',
                        fontWeight: '800',
                        marginBottom: '0.5rem',
                        background: 'linear-gradient(to right, #fff, #94a3b8)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        letterSpacing: '-0.5px'
                    }}>
                        SPMS
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                        Smart Payroll Management System by Ajay Ambaliya
                    </p>
                </div>

                {/* Lockout Warning */}
                {isLockedOut && (
                    <div style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#fca5a5',
                        padding: '1rem',
                        borderRadius: '0.5rem',
                        marginBottom: '1.5rem',
                        fontSize: '0.9rem',
                        textAlign: 'center'
                    }}>
                        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔒</div>
                        <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>Account Temporarily Locked</div>
                        <div>Too many failed attempts. Try again in {formatTime(lockoutTime)}</div>
                    </div>
                )}

                {/* Attempt Warning */}
                {!isLockedOut && remainingAttempts < 5 && remainingAttempts > 0 && (
                    <div style={{
                        background: 'rgba(251, 191, 36, 0.1)',
                        border: '1px solid rgba(251, 191, 36, 0.3)',
                        color: '#fcd34d',
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        marginBottom: '1.5rem',
                        fontSize: '0.85rem',
                        textAlign: 'center'
                    }}>
                        ⚠️ {remainingAttempts} attempt{remainingAttempts !== 1 ? 's' : ''} remaining
                    </div>
                )}

                {/* Login Form */}
                <form onSubmit={handleLogin} style={{ position: 'relative' }}>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: '0.5rem',
                            color: 'var(--text-muted)',
                            fontSize: '0.9rem',
                            fontWeight: '500'
                        }}>
                            Email Address
                        </label>
                        <input
                            type="email"
                            className="input-field"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="your.email@example.com"
                            required
                            disabled={isLockedOut}
                            autoComplete="email"
                            maxLength={100}
                            style={{
                                fontSize: '1rem',
                                padding: '0.85rem 1rem'
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: '0.5rem',
                            color: 'var(--text-muted)',
                            fontSize: '0.9rem',
                            fontWeight: '500'
                        }}>
                            Password
                        </label>
                        <input
                            type="password"
                            className="input-field"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            disabled={isLockedOut}
                            autoComplete="current-password"
                            maxLength={100}
                            style={{
                                fontSize: '1rem',
                                padding: '0.85rem 1rem'
                            }}
                        />
                    </div>

                    {/* Remember Me Checkbox */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        marginBottom: '1.5rem',
                        gap: '0.75rem'
                    }}>
                        <input
                            type="checkbox"
                            id="remember-me"
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            disabled={isLockedOut}
                            style={{
                                width: '18px',
                                height: '18px',
                                cursor: isLockedOut ? 'not-allowed' : 'pointer',
                                accentColor: 'var(--primary)'
                            }}
                        />
                        <label htmlFor="remember-me" style={{
                            color: 'var(--text-muted)',
                            fontSize: '0.9rem',
                            cursor: isLockedOut ? 'not-allowed' : 'pointer',
                            userSelect: 'none'
                        }}>
                            Remember my email (secure)
                        </label>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: '#fca5a5',
                            padding: '0.85rem 1rem',
                            borderRadius: '0.5rem',
                            marginBottom: '1.5rem',
                            fontSize: '0.9rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}>
                            <span>⚠️</span>
                            {error}
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={loading || isLockedOut}
                        className="btn btn-primary w-full"
                        style={{
                            padding: '1rem',
                            fontSize: '1rem',
                            fontWeight: '600',
                            position: 'relative',
                            overflow: 'hidden',
                            opacity: isLockedOut ? 0.5 : 1,
                            cursor: isLockedOut ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {loading ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span className="spinner" />
                                Authenticating...
                            </span>
                        ) : isLockedOut ? 'Account Locked' : 'Access Account'}
                    </button>
                </form>

                {/* Security Features Notice */}
                <div style={{
                    marginTop: '1.5rem',
                    padding: '1rem',
                    background: 'rgba(59, 130, 246, 0.05)',
                    border: '1px solid rgba(59, 130, 246, 0.1)',
                    borderRadius: '0.5rem',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)'
                }}>
                    <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#60a5fa' }}>
                        🛡️ Protected by Enterprise Security:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: '1.6' }}>
                        <li>Encrypted data transmission</li>
                        <li>Brute force protection</li>
                        <li>Session timeout monitoring</li>
                        <li>Input sanitization & validation</li>
                    </ul>
                </div>

                {/* Credit Footer */}
                <div style={{
                    marginTop: '2rem',
                    paddingTop: '1.5rem',
                    borderTop: '1px solid var(--glass-border)',
                    textAlign: 'center'
                }}>
                    <p style={{
                        color: 'var(--text-muted)',
                        fontSize: '0.85rem',
                        margin: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        flexWrap: 'wrap'
                    }}>
                        Made with <span style={{ color: '#ef4444', fontSize: '1rem' }}>❤️</span> by
                        <strong style={{ color: 'var(--foreground)' }}>Ajay Ambaliya</strong>
                        <span style={{ opacity: 0.7 }}>(Senior Clerk)</span>
                    </p>
                </div>
            </div>

            {/* Floating animation keyframes */}
            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes float {
                    0%, 100% {
                        transform: translateY(0px);
                    }
                    50% {
                        transform: translateY(-10px);
                    }
                }
                
                .spinner {
                    display: inline-block;
                    width: 16px;
                    height: 16px;
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    border-radius: 50%;
                    border-top-color: white;
                    animation: spin 0.8s linear infinite;
                }
                
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}} />
        </div>
    );
}
