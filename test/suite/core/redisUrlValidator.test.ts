import * as assert from 'assert';
import { validateRedisUrl } from '../../../src/core/services/redisUrlValidator';

describe('redisUrlValidator', () => {
    it('validates redis:// scheme', () => {
        const result = validateRedisUrl('redis://localhost:6379');
        assert.strictEqual(result.valid, true);
    });

    it('validates rediss:// scheme', () => {
        const result = validateRedisUrl('rediss://redis.example.com:6380');
        assert.strictEqual(result.valid, true);
    });

    it('validates host:port format', () => {
        const result = validateRedisUrl('localhost:6379');
        assert.strictEqual(result.valid, true);
    });

    it('validates host-only format', () => {
        const result = validateRedisUrl('localhost');
        assert.strictEqual(result.valid, true);
    });

    it('rejects empty string', () => {
        const result = validateRedisUrl('');
        assert.strictEqual(result.valid, false);
        assert.ok(result.errorMessage?.includes('required'));
    });

    it('rejects undefined', () => {
        const result = validateRedisUrl(undefined);
        assert.strictEqual(result.valid, false);
    });

    it('rejects port out of range', () => {
        const result = validateRedisUrl('localhost:99999');
        assert.strictEqual(result.valid, false);
        assert.ok(result.errorMessage?.includes('out of range'));
    });

    it('rejects non-numeric port', () => {
        const result = validateRedisUrl('localhost:abc');
        assert.strictEqual(result.valid, false);
        assert.ok(result.errorMessage?.includes('number'));
    });

    it('validates redis:// with no port', () => {
        const result = validateRedisUrl('redis://myhost');
        assert.strictEqual(result.valid, true);
    });

    it('rejects redis:// with port > 65535', () => {
        const result = validateRedisUrl('redis://localhost:70000');
        assert.strictEqual(result.valid, false);
    });
});
