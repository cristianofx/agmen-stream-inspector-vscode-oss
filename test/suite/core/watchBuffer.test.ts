import * as assert from 'assert';
import { createSearchHit } from '../../../src/core/models/searchHit';
import { ResultBuffer } from '../../../src/core/services/resultBuffer';

describe('ResultBuffer', () => {
    it('retains only the configured maximum number of hits and counts dropped entries', () => {
        const buffer = new ResultBuffer(2);

        buffer.push(createSearchHit('s', '1-0', { message: '{}' }, '{}'));
        buffer.push(createSearchHit('s', '2-0', { message: '{}' }, '{}'));
        buffer.push(createSearchHit('s', '3-0', { message: '{}' }, '{}'));

        assert.deepStrictEqual(buffer.items.map((hit: { id: string }) => hit.id), ['2-0', '3-0']);
        assert.strictEqual(buffer.droppedCount, 1);
    });

    it('keeps at least one result when constructed with an invalid limit', () => {
        const buffer = new ResultBuffer(0);
        buffer.push(createSearchHit('s', '1-0', { message: '{}' }, '{}'));
        buffer.push(createSearchHit('s', '2-0', { message: '{}' }, '{}'));

        assert.deepStrictEqual(buffer.items.map((hit: { id: string }) => hit.id), ['2-0']);
    });
});
