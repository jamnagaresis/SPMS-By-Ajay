'use client';

import { useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { SessionManager } from '@/lib/security';

/**
 * Session Monitor Component
 * Tracks user activity and automatically logs out inactive users
 * Prevents unauthorized access to sensitive tax data
 */
export default function SessionMonitor() {
    const router = useRouter();
    const pathname = usePathname();
    const supabase = createClient();

    // Track user activity
    const updateActivity = useCallback(() => {
        SessionManager.updateActivity();
    }, []);

    // Check session validity
    const checkSession = useCallback(async () => {
        // Skip check on login pages
        if (pathname === '/' || pathname === '/portal/login') return;

        // Skip session boot if we are actively exchanging a Magic Link PKCE code
        if (typeof window !== 'undefined' && window.location.search.includes('code=')) return;

        // Check if session has expired
        if (SessionManager.isSessionExpired()) {
            // Clear session and redirect to appropriate login page
            await supabase.auth.signOut();
            SessionManager.clearSession();
            router.push(pathname.startsWith('/portal') ? '/portal/login?session_expired=true' : '/?session_expired=true');
            return;
        }

        // Verify with Supabase
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            router.push(pathname.startsWith('/portal') ? '/portal/login' : '/');
        }
    }, [pathname, router, supabase]);

    useEffect(() => {
        // Initial session check
        checkSession();

        // Track user activity on various events
        const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

        events.forEach(event => {
            window.addEventListener(event, updateActivity);
        });

        // Check session every minute
        const sessionCheckInterval = setInterval(checkSession, 60 * 1000);

        // Cleanup
        return () => {
            events.forEach(event => {
                window.removeEventListener(event, updateActivity);
            });
            clearInterval(sessionCheckInterval);
        };
    }, [updateActivity, checkSession]);

    // Monitor visibility changes (tab switching)
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                checkSession();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [checkSession]);

    return null; // This is a utility component, no UI
}
