import * as assert from 'assert';
import { matches, parseStreamFields } from '../../../src/core/services/messageMatcher';
import { createSearchOptions } from '../../../src/core/models/searchOptions';

function opts(overrides: Partial<ReturnType<typeof createSearchOptions>> = {}) {
    return createSearchOptions({
        streams: ['s'],
        findField: undefined,
        findEq: undefined,
        jsonField: 'message',
        findLast: 0,
        findMax: 100,
        newestFirst: false,
        findCaseInsensitive: false,
        messageOnly: false,
        ...overrides,
    });
}

describe('messageMatcher', () => {
    describe('parseStreamFields', () => {
        it('parses flat key-value array', () => {
            const result = parseStreamFields(['a', '1', 'b', '2']);
            assert.deepStrictEqual(result, { a: '1', b: '2' });
        });

        it('returns empty for empty input', () => {
            const result = parseStreamFields([]);
            assert.deepStrictEqual(result, {});
        });
    });

    describe('matches', () => {
        it('matches JSON object in message field', () => {
            const fields = { message: '{"type":"order","id":123}' };
            const result = matches(fields, opts());
            assert.strictEqual(result.matched, true);
        });

        it('does not match when message field is missing', () => {
            const fields = { data: '{"type":"order"}' };
            const result = matches(fields, opts());
            assert.strictEqual(result.matched, false);
        });

        it('matches with custom jsonField', () => {
            const fields = { data: '{"type":"order"}' };
            const result = matches(fields, opts({ jsonField: 'data' }));
            assert.strictEqual(result.matched, true);
        });

        it('matches findField by key', () => {
            const fields = { message: '{"type":"order","status":"shipped"}' };
            const result = matches(fields, opts({ findField: 'type' }));
            assert.strictEqual(result.matched, true);
        });

        it('matches findField + findEq', () => {
            const fields = { message: '{"type":"order","status":"shipped"}' };
            const result = matches(fields, opts({ findField: 'type', findEq: 'order' }));
            assert.strictEqual(result.matched, true);
        });

        it('does not match findField + findEq when value differs', () => {
            const fields = { message: '{"type":"order","status":"shipped"}' };
            const result = matches(fields, opts({ findField: 'type', findEq: 'payment' }));
            assert.strictEqual(result.matched, false);
        });

        it('matches case-insensitively', () => {
            const fields = { message: '{"Type":"Order"}' };
            const result = matches(fields, opts({
                findField: 'type',
                findEq: 'order',
                findCaseInsensitive: true,
            }));
            assert.strictEqual(result.matched, true);
        });

        it('handles double-encoded JSON', () => {
            const inner = JSON.stringify({ type: 'order' });
            const outer = JSON.stringify(inner); // double-encoded
            const fields = { message: outer };
            const result = matches(fields, opts({ findField: 'type', findEq: 'order' }));
            assert.strictEqual(result.matched, true);
        });

        it('handles nested JSON objects', () => {
            const fields = { message: '{"data":{"nested":{"deep":"value"}}}' };
            const result = matches(fields, opts({ findField: 'deep', findEq: 'value' }));
            assert.strictEqual(result.matched, true);
        });

        it('handles JSON array values', () => {
            const fields = { message: '{"items":[{"name":"A"},{"name":"B"}]}' };
            const result = matches(fields, opts({ findField: 'name', findEq: 'A' }));
            assert.strictEqual(result.matched, true);
        });

        it('returns rawMessage when matched', () => {
            const fields = { message: '{"type":"order"}' };
            const result = matches(fields, opts());
            assert.strictEqual(result.matched, true);
            assert.ok(result.rawMessage !== undefined);
        });

        it('uses jsonPath for dot-separated paths', () => {
            const fields = { message: '{"data":{"items":[{"id":1},{"id":2}]}}' };
            const result = matches(fields, opts({ jsonPath: 'data.items[0].id' }));
            assert.strictEqual(result.matched, true);
        });

        it('matches findEq as contains when no field specified', () => {
            const fields = { message: '{"type":"order_created","id":42}' };
            const result = matches(fields, opts({ findEq: 'order_created' }));
            assert.strictEqual(result.matched, true);
        });

        it('does not match empty message field', () => {
            const fields = { message: '   ' };
            const result = matches(fields, opts());
            assert.strictEqual(result.matched, false);
        });

        it('does not match invalid JSON', () => {
            const fields = { message: 'not json at all' };
            const result = matches(fields, opts({ findField: 'type' }));
            assert.strictEqual(result.matched, false);
        });
    });
});
