import * as assert from 'assert';
import { createSearchHit } from '../../../src/core/models/searchHit';
import {
    ReplayExecutionError,
    ReplayService,
    ReplayResultEntry,
} from '../../../src/core/services/replayService';

type PipelineResult = [Error | null, unknown];

class FakePipeline {
    private readonly _commands: Array<{ stream: string; args: string[] }> = [];

    constructor(
        private readonly _state: FakeReplayRedisState,
        private readonly _batchIndex: number,
    ) {}

    xadd(stream: string, _id: string, ...args: string[]): this {
        this._commands.push({ stream, args });
        return this;
    }

    async exec(): Promise<PipelineResult[]> {
        this._state.executedBatches.push(this._commands.map((command) => command.stream));
        const planned = this._state.batchPlans[this._batchIndex];
        if (planned instanceof Error) {
            throw planned;
        }
        return planned ?? this._commands.map(() => [null, 'OK']);
    }
}

interface FakeReplayRedisState {
    batchPlans: Array<PipelineResult[] | Error | undefined>;
    executedBatches: string[][];
}

class FakeReplayRedis {
    private _pipelineIndex = 0;

    constructor(private readonly _state: FakeReplayRedisState) {}

    pipeline(): FakePipeline {
        return new FakePipeline(this._state, this._pipelineIndex++);
    }

    get executedBatches(): string[][] {
        return this._state.executedBatches;
    }
}

function createHit(stream: string, id: string, value: string) {
    return createSearchHit(stream, id, { message: value, state: value }, value);
}

function summarize(entries: ReplayResultEntry[]): string[] {
    return entries.map((entry) => `${entry.hit.stream}:${entry.hit.id}:${entry.status}:${entry.error ?? ''}`);
}

describe('ReplayService', () => {
    it('replays in bounded batches and records exact per-hit successes and failures', async () => {
        const redis = new FakeReplayRedis({
            batchPlans: [
                [[null, '1-0'], [new Error('NOAUTH'), null]],
                [[null, '2-0']],
            ],
            executedBatches: [],
        });
        const hits = [
            createHit('alpha', '1-0', '{"value":1}'),
            createHit('alpha', '2-0', '{"value":2}'),
            createHit('beta', '3-0', '{"value":3}'),
        ];

        const result = await new ReplayService().replayAsync(redis as never, hits, { batchSize: 2 });

        assert.deepStrictEqual(redis.executedBatches, [['alpha', 'alpha'], ['beta']]);
        assert.deepStrictEqual(result.entries.length, 3);
        assert.deepStrictEqual(result.succeeded, 2);
        assert.deepStrictEqual(result.failed, 1);
        assert.deepStrictEqual(result.canceled, false);
        assert.deepStrictEqual(result.errorMessage, undefined);
        assert.deepStrictEqual(summarize(result.entries), [
            'alpha:1-0:succeeded:',
            'alpha:2-0:failed:NOAUTH',
            'beta:3-0:succeeded:',
        ]);
    });

    it('stops before the next batch when canceled and reports only attempted hits', async () => {
        const controller = new AbortController();
        const state: FakeReplayRedisState = {
            batchPlans: [
                [[null, '1-0'], [null, '2-0']],
                [[null, '3-0'], [null, '4-0']],
            ],
            executedBatches: [],
        };
        const redis = new FakeReplayRedis(state);
        const hits = [
            createHit('alpha', '1-0', '{"value":1}'),
            createHit('alpha', '2-0', '{"value":2}'),
            createHit('beta', '3-0', '{"value":3}'),
            createHit('beta', '4-0', '{"value":4}'),
        ];

        const result = await new ReplayService().replayAsync(redis as never, hits, {
            batchSize: 2,
            signal: controller.signal,
            onBatchComplete: () => controller.abort(),
        });

        assert.deepStrictEqual(state.executedBatches, [['alpha', 'alpha']]);
        assert.strictEqual(result.canceled, true);
        assert.strictEqual(result.succeeded, 2);
        assert.strictEqual(result.failed, 0);
        assert.deepStrictEqual(summarize(result.entries), [
            'alpha:1-0:succeeded:',
            'alpha:2-0:succeeded:',
        ]);
    });

    it('throws a partial report when pipeline execution fails after prior successes', async () => {
        const state: FakeReplayRedisState = {
            batchPlans: [
                [[null, '1-0'], [null, '2-0']],
                new Error('socket closed'),
            ],
            executedBatches: [],
        };
        const redis = new FakeReplayRedis(state);
        const hits = [
            createHit('alpha', '1-0', '{"value":1}'),
            createHit('alpha', '2-0', '{"value":2}'),
            createHit('beta', '3-0', '{"value":3}'),
        ];

        await assert.rejects(
            async () => new ReplayService().replayAsync(redis as never, hits, { batchSize: 2 }),
            (error: unknown) => {
                assert.ok(error instanceof ReplayExecutionError);
                const replayError = error as ReplayExecutionError;
                assert.strictEqual(replayError.message, 'socket closed');
                assert.strictEqual(replayError.report.succeeded, 2);
                assert.strictEqual(replayError.report.failed, 0);
                assert.deepStrictEqual(summarize(replayError.report.entries), [
                    'alpha:1-0:succeeded:',
                    'alpha:2-0:succeeded:',
                ]);
                return true;
            },
        );
    });
});
