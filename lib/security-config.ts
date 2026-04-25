/**
 * Security Configuration
 * Central configuration for all security settings
 */

export const SecurityConfig = {
    // Session Settings
    SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes in milliseconds
    SESSION_WARNING_TIME: 5 * 60 * 1000, // Warn 5 minutes before timeout

    // Rate Limiting
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
    ATTEMPT_WINDOW: 5 * 60 * 1000, // 5 minutes

    // Password Policy
    MIN_PASSWORD_LENGTH: 8,
    MAX_PASSWORD_LENGTH: 100,
    REQUIRE_UPPERCASE: false, // Supabase handles this
    REQUIRE_LOWERCASE: false,
    REQUIRE_NUMBERS: false,
    REQUIRE_SPECIAL_CHARS: false,

    // Input Validation
    MAX_EMAIL_LENGTH: 100,
    MAX_INPUT_LENGTH: 1000,

    // Encryption
    ENCRYPTION_ALGORITHM: 'AES-GCM',
    KEY_VERSION: 'v1',

    // Storage Keys (all prefixed for namespace isolation)
    STORAGE_PREFIX: 'tax-analyzer-',
    KEYS: {
        USER_EMAIL: 'tax-analyzer-user',
        REMEMBER_FLAG: 'tax-analyzer-remember',
        LAST_ACTIVITY: 'tax-analyzer-last-activity',
        LOGIN_ATTEMPTS: 'tax-analyzer-attempts',
        LOCKOUT_END: 'tax-analyzer-lockout',
        // Old keys to be cleaned up
        OLD_EMAIL: 'tax-analyzer-email',
        OLD_PASSWORD: 'tax-analyzer-password',
    },

    // Security Headers (for future server-side implementation)
    SECURITY_HEADERS: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    },

    // Environment Validation
    REQUIRED_ENV_VARS: [
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ],

    // Error Messages (safe, non-revealing)
    ERROR_MESSAGES: {
        INVALID_CREDENTIALS: 'Invalid email or password',
        ACCOUNT_LOCKED: 'Too many failed attempts. Account temporarily locked',
        SESSION_EXPIRED: 'Your session has expired. Please login again',
        NETWORK_ERROR: 'Network error. Please check your connection',
        VALIDATION_ERROR: 'Invalid input detected',
        GENERIC_ERROR: 'An error occurred. Please try again',
    },

    // Allowed origins for CORS (for future API implementation)
    ALLOWED_ORIGINS: [
        'https://spms-ochre.vercel.app',
        'http://localhost:3000',
    ],

    // Content Security Policy
    CSP_DIRECTIVES: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Next.js requires these
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'https:'],
        'font-src': ["'self'", 'data:'],
        'connect-src': ["'self'", 'https://*.supabase.co'],
    }
};

/**
 * Validate environment variables on startup
 */
export function validateEnvironment(): { valid: boolean; missing: string[] } {
    const missing: string[] = [];

    SecurityConfig.REQUIRED_ENV_VARS.forEach(envVar => {
        if (!process.env[envVar]) {
            missing.push(envVar);
        }
    });

    return {
        valid: missing.length === 0,
        missing
    };
}

/**
 * Get security headers as object
 */
export function getSecurityHeaders(): Record<string, string> {
    return SecurityConfig.SECURITY_HEADERS;
}

/**
 * Build Content Security Policy header value
 */
export function buildCSPHeader(): string {
    return Object.entries(SecurityConfig.CSP_DIRECTIVES)
        .map(([directive, values]) => `${directive} ${values.join(' ')}`)
        .join('; ');
}
