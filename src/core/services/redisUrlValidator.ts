import { parseRedisEndpoint, RedisEndpointParseError } from './redisEndpoint';

export interface ValidationResult {
    valid: boolean;
    errorMessage: string | undefined;
}

/**
 * Validates a Redis URL string.
 * Supports redis://, rediss://, and host:port formats.
 */
export function validateRedisUrl(redisUrl: string | undefined): ValidationResult {
    try {
        parseRedisEndpoint(redisUrl ?? '');
        return { valid: true, errorMessage: undefined };
    } catch (error) {
        const message = error instanceof RedisEndpointParseError
            ? error.message
            : error instanceof Error
                ? error.message
                : String(error);
        return { valid: false, errorMessage: message };
    }
}
