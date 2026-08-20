import * as assert from 'assert';
import { validateRedisUrl } from '../../../src/core/services/redisUrlValidator';

describe('redis endpoint validation', () => {
    it('rejects ambiguous host:port:port input', () => {
        const result = validateRedisUrl('localhost:6379:6380');
        assert.strictEqual(result.valid, false);
    });

    it('rejects malformed IPv6 host and port input', () => {
        const result = validateRedisUrl('::1:6379');
        assert.strictEqual(result.valid, false);
    });

    it('accepts bracketed IPv6 host and port input', () => {
        const result = validateRedisUrl('[::1]:6379');
        assert.strictEqual(result.valid, true);
    });
});
