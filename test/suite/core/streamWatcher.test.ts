import * as assert from 'assert';
import { getEventListeners } from 'events';
import { StreamWatcher } from '../../../src/core/services/streamWatcher';
import { createSearchOptions } from '../../../src/core/models/searchOptions';

class FakeWatchRedis {
    private _pollCount = 0;

    constructor(private readonly _controller: AbortController) {}

    scanStream({ match }: { match: string }) {
        return (async function* () {
            yield [match];
        })();
    }

    async type(): Promise<string> {
        return 'stream';
    }

    async xinfo(): Promise<unknown[]> {
        return ['last-generated-id', '0-0'];
    }

    async xread(): Promise<null> {
        this._pollCount += 1;
        if (this._pollCount >= 25) {
            this._controller.abort();
        }
        return null;
    }
}

describe('StreamWatcher', () => {
    it('does not leak abort listeners across repeated polls', async () => {
        const controller = new AbortController();
        const redis = new FakeWatchRedis(controller);
        const opts = createSearchOptions({
            streams: ['alpha'],
            findField: 'status',
            findEq: 'match',
            findMax: 5,
        });
        const watcher = new StreamWatcher(redis as never, opts, 1);
        let maxObservedListeners = 0;

        const listenerSampler = setInterval(() => {
            maxObservedListeners = Math.max(
                maxObservedListeners,
                getEventListeners(controller.signal, 'abort').length,
            );
        }, 1);

        try {
            for await (const _hit of watcher.watchAsync(controller.signal)) {
                assert.fail(`Expected no hits, received ${JSON.stringify(_hit)}`);
            }
        } finally {
            clearInterval(listenerSampler);
        }

        assert.strictEqual(maxObservedListeners, 1);
        assert.strictEqual(getEventListeners(controller.signal, 'abort').length, 0);
    });
});
