'use client';

import { usePathname } from 'next/navigation';

export default function Footer() {
    const pathname = usePathname();
    const isEmployeePortal = pathname?.startsWith('/portal');

    // Hide footer entirely on the employee portal to ensure a clean mobile app-like experience
    if (isEmployeePortal) {
        return null;
    }

    return (
        <footer style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '1rem 2rem',
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(12px)',
            borderTop: '1px solid var(--glass-border)',
            zIndex: 50
        }}>
            <div style={{
                maxWidth: '1200px',
                margin: '0 auto',
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
                    Made with <span style={{ color: '#ef4444', fontSize: '0.95rem' }}>❤️</span> by
                    <strong style={{ color: 'var(--foreground)' }}>Ajay Ambaliya</strong>
                    <span style={{ opacity: 0.7 }}>(Senior Clerk)</span>
                </p>
            </div>
        </footer>
    );
}
