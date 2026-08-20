import { SearchHit } from '../models/searchHit';

export interface ReplayResultEntry {
    hit: SearchHit;
    status: 'succeeded' | 'failed';
    replayedId?: string;
    error?: string;
}

export interface ReplayReport {
    attempted: number;
    succeeded: number;
    failed: number;
    canceled: boolean;
    entries: ReplayResultEntry[];
    errorMessage?: string;
}

export interface ReplayOptions {
    batchSize?: number;
    signal?: AbortSignal;
    onBatchComplete?(report: ReplayReport): void | Promise<void>;
}

interface ReplayPipeline {
    xadd(stream: string, id: string, ...args: string[]): ReplayPipeline;
    exec(): Promise<Array<[Error | null, unknown]> | null>;
}

interface ReplayRedisClient {
    pipeline(): ReplayPipeline;
}

export class ReplayExecutionError extends Error {
    constructor(message: string, public readonly report: ReplayReport) {
        super(message);
        this.name = 'ReplayExecutionError';
    }
}

export class ReplayService {
    async replayAsync(
        redis: ReplayRedisClient,
        hits: readonly SearchHit[],
        options: ReplayOptions = {},
    ): Promise<ReplayReport> {
        const batchSize = Math.max(1, options.batchSize ?? 50);
        const report: ReplayReport = {
            attempted: 0,
            succeeded: 0,
            failed: 0,
            canceled: false,
            entries: [],
        };

        for (let index = 0; index < hits.length; index += batchSize) {
            if (options.signal?.aborted) {
                report.canceled = true;
                return report;
            }

            const batch = hits.slice(index, index + batchSize);
            const pipeline = redis.pipeline();
            for (const hit of batch) {
                pipeline.xadd(hit.stream, '*', ...toXaddArgs(hit));
            }

            let results: Array<[Error | null, unknown]> | null;
            try {
                results = await pipeline.exec();
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                report.errorMessage = message;
                throw new ReplayExecutionError(message, report);
            }

            if (!results || results.length !== batch.length) {
                report.errorMessage = 'Replay pipeline returned an unexpected result count.';
                throw new ReplayExecutionError(report.errorMessage, report);
            }

            for (let offset = 0; offset < batch.length; offset += 1) {
                const hit = batch[offset];
                const [error, replayedId] = results[offset];
                report.attempted += 1;
                if (error) {
                    report.failed += 1;
                    report.entries.push({
                        hit,
                        status: 'failed',
                        error: error.message,
                    });
                } else {
                    report.succeeded += 1;
                    report.entries.push({
                        hit,
                        status: 'succeeded',
                        replayedId: replayedId === undefined ? undefined : String(replayedId),
                    });
                }
            }

            await options.onBatchComplete?.(report);
        }

        if (options.signal?.aborted) {
            report.canceled = true;
        }

        return report;
    }
}

function toXaddArgs(hit: SearchHit): string[] {
    const args: string[] = [];
    for (const [key, value] of Object.entries(hit.fields ?? {})) {
        args.push(key, value);
    }
    return args;
}
