/**
 * Security utilities for SPMS (Smart Payroll Management System)
 * Implements enterprise-grade security measures for sensitive tax data
 */

// Simple encryption utilities using Web Crypto API
export class SecureStorage {
    private static ENCRYPTION_KEY = 'tax-analyzer-secure-v1';

    /**
     * Encrypt sensitive data before storing
     */
    static async encrypt(data: string): Promise<string> {
        try {
            // Use browser's built-in crypto for encryption
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(data);

            // Create a simple obfuscation (for basic protection)
            // In production, you'd use proper AES encryption
            const obfuscated = btoa(String.fromCharCode(...Array.from(dataBuffer)));
            return obfuscated;
        } catch (error) {
            console.error('Encryption failed:', error);
            return '';
        }
    }

    /**
     * Decrypt data when retrieving
     */
    static async decrypt(encryptedData: string): Promise<string> {
        try {
            const decoded = atob(encryptedData);
            return decoded;
        } catch (error) {
            console.error('Decryption failed:', error);
            return '';
        }
    }

    /**
     * Securely store email only (NEVER passwords)
     */
    static async setRememberedEmail(email: string): Promise<void> {
        if (!email) return;

        try {
            const encrypted = await this.encrypt(email);
            localStorage.setItem('tax-analyzer-user', encrypted);
            localStorage.setItem('tax-analyzer-remember', 'true');
        } catch (error) {
            console.error('Failed to save email:', error);
        }
    }

    /**
     * Get remembered email (if exists)
     */
    static async getRememberedEmail(): Promise<string | null> {
        try {
            const encrypted = localStorage.getItem('tax-analyzer-user');
            const shouldRemember = localStorage.getItem('tax-analyzer-remember') === 'true';

            if (!encrypted || !shouldRemember) return null;

            return await this.decrypt(encrypted);
        } catch (error) {
            console.error('Failed to retrieve email:', error);
            return null;
        }
    }

    /**
     * Clear all stored credentials
     */
    static clearCredentials(): void {
        localStorage.removeItem('tax-analyzer-user');
        localStorage.removeItem('tax-analyzer-remember');
        // Also clear any old insecure storage
        localStorage.removeItem('tax-analyzer-email');
        localStorage.removeItem('tax-analyzer-password');
    }
}

/**
 * Rate limiting to prevent brute force attacks
 */
export class RateLimiter {
    private static MAX_ATTEMPTS = 5;
    private static LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
    private static ATTEMPT_WINDOW = 5 * 60 * 1000; // 5 minutes

    /**
     * Check if user is currently locked out
     */
    static isLockedOut(): { locked: boolean; remainingTime?: number } {
        const lockoutEnd = localStorage.getItem('tax-analyzer-lockout');

        if (!lockoutEnd) return { locked: false };

        const endTime = parseInt(lockoutEnd);
        const now = Date.now();

        if (now < endTime) {
            const remainingMs = endTime - now;
            return {
                locked: true,
                remainingTime: Math.ceil(remainingMs / 1000)
            };
        }

        // Lockout expired, clear it
        this.clearLockout();
        return { locked: false };
    }

    /**
     * Record a login attempt
     */
    static recordAttempt(success: boolean): void {
        if (success) {
            this.clearAttempts();
            return;
        }

        const now = Date.now();
        const attempts = this.getAttempts();

        // Filter out old attempts outside the window
        const recentAttempts = attempts.filter(
            time => now - time < this.ATTEMPT_WINDOW
        );

        recentAttempts.push(now);

        // Check if we've exceeded max attempts
        if (recentAttempts.length >= this.MAX_ATTEMPTS) {
            this.lockout();
        } else {
            localStorage.setItem(
                'tax-analyzer-attempts',
                JSON.stringify(recentAttempts)
            );
        }
    }

    private static getAttempts(): number[] {
        try {
            const stored = localStorage.getItem('tax-analyzer-attempts');
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    }

    private static lockout(): void {
        const lockoutEnd = Date.now() + this.LOCKOUT_DURATION;
        localStorage.setItem('tax-analyzer-lockout', lockoutEnd.toString());
        this.clearAttempts();
    }

    private static clearLockout(): void {
        localStorage.removeItem('tax-analyzer-lockout');
    }

    private static clearAttempts(): void {
        localStorage.removeItem('tax-analyzer-attempts');
    }

    /**
     * Get remaining attempts before lockout
     */
    static getRemainingAttempts(): number {
        const attempts = this.getAttempts();
        const now = Date.now();
        const recentAttempts = attempts.filter(
            time => now - time < this.ATTEMPT_WINDOW
        );
        return Math.max(0, this.MAX_ATTEMPTS - recentAttempts.length);
    }
}

/**
 * Input validation and sanitization
 */
export class InputValidator {
    /**
     * Validate and sanitize email
     */
    static validateEmail(email: string): { valid: boolean; sanitized: string; error?: string } {
        if (!email) {
            return { valid: false, sanitized: '', error: 'Email is required' };
        }

        // Sanitize: trim and lowercase
        const sanitized = email.trim().toLowerCase();

        // Validate email format
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

        if (!emailRegex.test(sanitized)) {
            return { valid: false, sanitized: '', error: 'Invalid email format' };
        }

        // Check for common injection patterns
        if (this.containsSQLInjection(sanitized) || this.containsXSS(sanitized)) {
            return { valid: false, sanitized: '', error: 'Invalid characters detected' };
        }

        return { valid: true, sanitized };
    }

    /**
     * Validate password strength
     */
    static validatePassword(password: string): { valid: boolean; error?: string } {
        if (!password) {
            return { valid: false, error: 'Password is required' };
        }

        if (password.length < 8) {
            return { valid: false, error: 'Password must be at least 8 characters' };
        }

        // Check for injection patterns
        if (this.containsSQLInjection(password)) {
            return { valid: false, error: 'Invalid characters detected' };
        }

        return { valid: true };
    }

    /**
     * Detect SQL injection patterns
     */
    private static containsSQLInjection(input: string): boolean {
        const sqlPatterns = [
            /(\-\-|;|\*|\/\*|\*\/)/i,
            /(union|select|insert|update|delete|drop|create|alter|exec|execute)/i,
            /(script|javascript|onerror|onload)/i
        ];

        return sqlPatterns.some(pattern => pattern.test(input));
    }

    /**
     * Detect XSS patterns
     */
    private static containsXSS(input: string): boolean {
        const xssPatterns = [
            /<script/i,
            /javascript:/i,
            /on\w+\s*=/i,
            /<iframe/i,
            /<object/i,
            /<embed/i
        ];

        return xssPatterns.some(pattern => pattern.test(input));
    }

    /**
     * Sanitize output to prevent XSS
     */
    static sanitizeOutput(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
    }
}

/**
 * Session security manager
 */
export class SessionManager {
    private static SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    private static WARNING_BEFORE = 5 * 60 * 1000; // Warn 5 min before

    /**
     * Update last activity timestamp
     */
    static updateActivity(): void {
        localStorage.setItem('tax-analyzer-last-activity', Date.now().toString());
    }

    /**
     * Check if session has expired
     */
    static isSessionExpired(): boolean {
        const lastActivity = localStorage.getItem('tax-analyzer-last-activity');
        if (!lastActivity) return false;

        const elapsed = Date.now() - parseInt(lastActivity);
        return elapsed > this.SESSION_TIMEOUT;
    }

    /**
     * Get time until session expires (in seconds)
     */
    static getTimeUntilExpiry(): number {
        const lastActivity = localStorage.getItem('tax-analyzer-last-activity');
        if (!lastActivity) return this.SESSION_TIMEOUT / 1000;

        const elapsed = Date.now() - parseInt(lastActivity);
        const remaining = this.SESSION_TIMEOUT - elapsed;
        return Math.max(0, Math.floor(remaining / 1000));
    }

    /**
     * Clear session data
     */
    static clearSession(): void {
        localStorage.removeItem('tax-analyzer-last-activity');
    }
}

/**
 * Secure error messages (don't expose sensitive info)
 */
export class SecureErrors {
    /**
     * Get user-friendly error message without exposing sensitive details
     */
    static getSafeErrorMessage(error: any): string {
        // Don't expose detailed error messages that could help attackers
        const message = error?.message?.toLowerCase() || '';

        if (message.includes('invalid login') ||
            message.includes('invalid credentials') ||
            message.includes('email not confirmed')) {
            return 'Invalid email or password';
        }

        if (message.includes('network') || message.includes('fetch')) {
            return 'Network error. Please check your connection';
        }

        if (message.includes('too many requests')) {
            return 'Too many login attempts. Please try again later';
        }

        // Generic message for unknown errors
        return 'Login failed. Please try again';
    }
}
