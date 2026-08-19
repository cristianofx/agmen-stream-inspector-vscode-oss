import * as assert from 'assert';
import { toUtc, toUtcDateTime } from '../../../src/core/services/redisStreamId';

describe('redisStreamId', () => {
    it('parses standard stream ID to UTC date', () => {
        // 1700000000000 = 2023-11-14T22:13:20.000Z
        const result = toUtc('1700000000000-0');
        assert.ok(result !== undefined);
        assert.strictEqual(result!.getTime(), 1700000000000);
    });

    it('returns undefined for invalid ID', () => {
        const result = toUtc('not-a-stream-id');
        assert.strictEqual(result, undefined);
    });

    it('returns undefined for empty string', () => {
        const result = toUtc('');
        assert.strictEqual(result, undefined);
    });

    it('formats datetime', () => {
        const result = toUtcDateTime('1700000000000-0');
        assert.ok(result !== undefined);
        assert.ok(result!.toISOString().includes('2023'));
    });

    it('returns undefined for special IDs', () => {
        assert.strictEqual(toUtc('-'), undefined);
        assert.strictEqual(toUtc('+'), undefined);
    });
});
