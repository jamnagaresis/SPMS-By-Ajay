'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

export default function Navbar() {
    const pathname = usePathname();
    const router = useRouter();
    const supabase = createClient();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push(pathname.startsWith('/portal') ? '/portal/login' : '/');
    };

    const linkStyle = (active: boolean): React.CSSProperties => ({
        color: active ? 'white' : 'var(--text-muted)',
        textDecoration: 'none',
        fontSize: '0.9rem',
        fontWeight: '600',
        padding: '0.5rem 1rem',
        borderRadius: '0.5rem',
        transition: 'all 0.2s'
    });

    const isActive = (path: string) => pathname === path;

    if (pathname === '/' || pathname === '/portal/login') return null;

    const isEmployeePortal = pathname.startsWith('/portal');

    return (
        <nav className="glass-panel" style={{
            margin: '1rem',
            padding: '1rem 2rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderRadius: '1rem'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{
                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '1.2rem',
                    color: 'white'
                }}>
                    S
                </div>
                <span style={{ fontWeight: '800', fontSize: '1.2rem', letterSpacing: '-0.5px' }}>SPMS</span>
            </div>

            {/* Links Section */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
                {!isEmployeePortal ? (
                    <>
                        <Link href="/payroll" className={isActive('/payroll') ? 'btn-primary' : ''} style={linkStyle(isActive('/payroll'))}>
                            📊 Upload
                        </Link>
                        <Link href="/admin" className={isActive('/admin') ? 'btn-primary' : ''} style={linkStyle(isActive('/admin'))}>
                            👤 Employees
                        </Link>
                        <Link href="/reports" className={isActive('/reports') ? 'btn-primary' : ''} style={linkStyle(isActive('/reports'))}>
                            📑 Reports
                        </Link>
                        <Link href="/analytics" className={isActive('/analytics') ? 'btn-primary' : ''} style={linkStyle(isActive('/analytics'))}>
                            📈 Analytics
                        </Link>
                        <Link href="/approvals" className={isActive('/approvals') ? 'btn-primary' : ''} style={linkStyle(isActive('/approvals'))}>
                            ✅ Approvals
                        </Link>
                        <Link href="/tax-projection" className={isActive('/tax-projection') ? 'btn-primary' : ''} style={linkStyle(isActive('/tax-projection'))}>
                            ⚖️ Asses Tax
                        </Link>
                        <Link href="/audit" className={isActive('/audit') ? 'btn-primary' : ''} style={linkStyle(isActive('/audit'))}>
                            🛡️ Audit
                        </Link>
                    </>
                ) : (
                    <>
                        <Link href="/portal" className={isActive('/portal') ? 'btn-primary' : ''} style={linkStyle(isActive('/portal'))}>
                            🏠 My Dashboard
                        </Link>
                        <Link href="/portal/payslips" className={isActive('/portal/payslips') ? 'btn-primary' : ''} style={linkStyle(isActive('/portal/payslips'))}>
                            📄 Payslips
                        </Link>
                        <Link href="/portal/tax-projection" className={isActive('/portal/tax-projection') ? 'btn-primary' : ''} style={linkStyle(isActive('/portal/tax-projection'))}>
                            ⚖️ Form 16
                        </Link>
                    </>
                )}
            </div>

            <div>
                <button
                    onClick={handleLogout}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        fontSize: '0.9rem',
                        cursor: 'pointer'
                    }}
                >
                    Logout
                </button>
            </div>
        </nav>
    );
}
