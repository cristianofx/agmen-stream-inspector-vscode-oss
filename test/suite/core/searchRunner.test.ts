import * as assert from 'assert';
import { SearchRunner } from '../../../src/core/services/searchRunner';
import { createSearchOptions } from '../../../src/core/models/searchOptions';

type StreamEntry = [string, string[]];

class FakeRedis {
    constructor(
        private readonly _entriesByStream: Record<string, StreamEntry[]>,
    ) {}

    scanStream({ match }: { match: string }) {
        const matching = Object.keys(this._entriesByStream).filter((key) => key === match);
        return (async function* () {
            yield matching;
        })();
    }

    async type(key: string): Promise<string> {
        return this._entriesByStream[key] ? 'stream' : 'none';
    }

    async xrange(stream: string): Promise<StreamEntry[]> {
        return this._entriesByStream[stream] ?? [];
    }

    async xrevrange(stream: string): Promise<StreamEntry[]> {
        return [...(this._entriesByStream[stream] ?? [])].reverse();
    }
}

function createEntry(id: string, value: string): StreamEntry {
    return [id, ['message', JSON.stringify({ status: value })]];
}

async function collectIds(runner: SearchRunner): Promise<string[]> {
    const ids: string[] = [];
    for await (const hit of runner.runAsync()) {
        ids.push(`${hit.stream}:${hit.id}`);
    }
    return ids;
}

describe('SearchRunner', () => {
    it('enforces findMax globally across ascending multi-stream scans', async () => {
        const redis = new FakeRedis({
            alpha: [createEntry('1-0', 'match')],
            beta: [createEntry('2-0', 'match')],
        });

        const runner = new SearchRunner(
            redis as never,
            createSearchOptions({
                streams: ['alpha', 'beta'],
                findField: 'status',
                findEq: 'match',
                findMax: 1,
                findPage: 10,
            }),
        );

        const ids = await collectIds(runner);
        assert.deepStrictEqual(ids, ['alpha:1-0']);
    });

    it('enforces findMax globally across descending multi-stream scans', async () => {
        const redis = new FakeRedis({
            alpha: [createEntry('1-0', 'match')],
            beta: [createEntry('2-0', 'match')],
        });

        const runner = new SearchRunner(
            redis as never,
            createSearchOptions({
                streams: ['alpha', 'beta'],
                findField: 'status',
                findEq: 'match',
                findMax: 1,
                findPage: 10,
                newestFirst: true,
            }),
        );

        const ids = await collectIds(runner);
        assert.deepStrictEqual(ids, ['alpha:1-0']);
    });

    it('enforces findMax globally across tail scans', async () => {
        const redis = new FakeRedis({
            alpha: [createEntry('1-0', 'match')],
            beta: [createEntry('2-0', 'match')],
        });

        const runner = new SearchRunner(
            redis as never,
            createSearchOptions({
                streams: ['alpha', 'beta'],
                findField: 'status',
                findEq: 'match',
                findMax: 1,
                findLast: 10,
                findPage: 10,
            }),
        );

        const ids = await collectIds(runner);
        assert.deepStrictEqual(ids, ['alpha:1-0']);
    });
});
