export interface ValidationResult {
    valid: boolean;
    errorMessage: string | undefined;
}

/**
 * Validates a Redis URL string.
 * Supports redis://, rediss://, and host:port formats.
 */
export function validateRedisUrl(redisUrl: string | undefined): ValidationResult {
    const s = redisUrl?.trim();

    if (!s) {
        return { valid: false, errorMessage: 'Redis URL is required.' };
    }

    // URI format: redis:// or rediss://
    if (s.toLowerCase().startsWith('redis://') || s.toLowerCase().startsWith('rediss://')) {
        try {
            const u = new URL(s);
            if (!u.hostname) {
                return { valid: false, errorMessage: 'URI must include host (e.g., redis://localhost:6379).' };
            }
            const port = u.port ? parseInt(u.port, 10) : -1;
            if (port > 65535) {
                return { valid: false, errorMessage: 'Port out of range.' };
            }
            return { valid: true, errorMessage: undefined };
        } catch (ex: unknown) {
            const msg = ex instanceof Error ? ex.message : String(ex);
            return { valid: false, errorMessage: `Invalid Redis URI. ${msg}` };
        }
    }

    // Simple form: host[:port]
    const parts = s.split(':').map(p => p.trim()).filter(p => p.length > 0);
    const urlHost = parts.length > 0 ? parts[0] : undefined;

    if (!urlHost) {
        return { valid: false, errorMessage: 'Host is required (e.g., localhost or localhost:6379).' };
    }

    if (parts.length > 1) {
        const portValue = parseInt(parts[1], 10);
        if (isNaN(portValue)) {
            return { valid: false, errorMessage: 'Port must be a number.' };
        }
        if (portValue < 0 || portValue > 65535) {
            return { valid: false, errorMessage: 'Port out of range.' };
        }
    }

    return { valid: true, errorMessage: undefined };
}
