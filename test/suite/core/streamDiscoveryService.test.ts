import * as assert from 'assert';
import { discoverStreamsAsync } from '../../../src/core/services/streamDiscoveryService';
import { resolveStreamsAsync } from '../../../src/core/services/redisStreamResolver';

class FakePipeline {
    constructor(
        private readonly _results: Array<[Error | null, string]>,
        private readonly _counter: { execCalls: number },
    ) {}

    type(_key: string) {
        return this;
    }

    async exec(): Promise<Array<[Error | null, string]>> {
        this._counter.execCalls += 1;
        return this._results;
    }
}

class FakeDiscoveryRedis {
    public readonly scanCalls: Array<string[]> = [];
    public readonly pipelineCounter = { execCalls: 0 };
    private _scanCursor = 0;

    constructor(
        private readonly _keys: string[],
        private readonly _supportsScanType: boolean,
        private readonly _types: Record<string, string>,
    ) {}

    async scan(
        cursor: string,
        ...args: string[]
    ): Promise<[string, string[]]> {
        this.scanCalls.push(args);
        if (args.includes('TYPE') && !this._supportsScanType) {
            throw new Error('ERR syntax error');
        }

        const sentinelPatternIndex = args.indexOf('MATCH');
        if (sentinelPatternIndex >= 0 && args[sentinelPatternIndex + 1] === '__redisInspectorNeverMatches__') {
            return ['0', []];
        }

        if (cursor !== '0' || this._scanCursor > 0) {
            return ['0', []];
        }

        this._scanCursor += 1;
        if (args.includes('TYPE')) {
            return ['0', this._keys.filter((key) => this._types[key] === 'stream')];
        }

        return ['0', this._keys];
    }

    pipeline(): FakePipeline {
        return new FakePipeline(
            this._keys.map((key) => [null, this._types[key] ?? 'none']),
            this.pipelineCounter,
        );
    }
}

describe('stream discovery', () => {
    it('uses SCAN TYPE stream when available', async () => {
        const redis = new FakeDiscoveryRedis(
            ['a', 'b', 'c'],
            true,
            { a: 'stream', b: 'string', c: 'stream' },
        );

        const result = await discoverStreamsAsync(redis as never, '*');

        assert.deepStrictEqual(result, ['a', 'c']);
        assert.ok(redis.scanCalls.some((args) => args.includes('TYPE')));
        assert.strictEqual(redis.pipelineCounter.execCalls, 0);
    });

    it('falls back to batched TYPE checks when SCAN TYPE is unavailable', async () => {
        const redis = new FakeDiscoveryRedis(
            ['a', 'b', 'c'],
            false,
            { a: 'stream', b: 'string', c: 'stream' },
        );

        const result = await resolveStreamsAsync(redis as never, ['*']);

        assert.deepStrictEqual(result, ['a', 'c']);
        assert.strictEqual(redis.pipelineCounter.execCalls, 1);
    });
});
