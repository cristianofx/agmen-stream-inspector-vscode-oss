import * as assert from 'assert';
import { createSearchHit } from '../../../src/core/models/searchHit';
import { WatchResultBuffer } from '../../../src/core/services/watchResultBuffer';

describe('WatchResultBuffer', () => {
    it('retains only the configured maximum number of hits and counts dropped entries', () => {
        const buffer = new WatchResultBuffer(2);

        buffer.push(createSearchHit('s', '1-0', { message: '{}' }, '{}'));
        buffer.push(createSearchHit('s', '2-0', { message: '{}' }, '{}'));
        buffer.push(createSearchHit('s', '3-0', { message: '{}' }, '{}'));

        assert.deepStrictEqual(buffer.items.map((hit: { id: string }) => hit.id), ['2-0', '3-0']);
        assert.strictEqual(buffer.droppedCount, 1);
    });
});
