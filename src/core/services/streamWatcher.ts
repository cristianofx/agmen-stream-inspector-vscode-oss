import Redis from 'ioredis';
import { SearchOptions } from '../models/searchOptions';
import { SearchHit } from '../models/searchHit';
import { resolveStreamsAsync } from './redisStreamResolver';
import { matches, toHit, parseStreamFields } from './messageMatcher';

/**
 * Monitors Redis streams for new messages in real-time.
 * Polls at a configurable interval and yields matching hits.
 */
export class StreamWatcher {
    constructor(
        private readonly _redis: Redis,
        private readonly _opts: SearchOptions,
        private readonly _pollIntervalMs: number = 100,
    ) {}

    async *watchAsync(signal?: AbortSignal): AsyncGenerator<SearchHit> {
        const streams = await resolveStreamsAsync(this._redis, this._opts.streams, signal);
        if (streams.length === 0) { return; }

        // Initialize last seen IDs to current stream heads
        const lastIds = new Map<string, string>();
        for (const stream of streams) {
            const info = await this._redis.xinfo('STREAM', stream) as unknown[];
            // xinfo returns a flat array like ['length', 5, 'last-generated-id', '123-0', ...]
            const lastGenIdx = (info as string[]).indexOf('last-generated-id');
            if (lastGenIdx >= 0 && lastGenIdx + 1 < info.length) {
                lastIds.set(stream, String(info[lastGenIdx + 1]));
            } else {
                throw new Error(`Could not determine the latest entry id for stream '${stream}'.`);
            }
        }

        while (!signal?.aborted) {
            for (const stream of streams) {
                if (signal?.aborted) { return; }

                const lastId = lastIds.get(stream) || '0-0';
                try {
                    // XREAD COUNT 100 STREAMS key lastId
                    const result = await this._redis.xread(
                        'COUNT', 100,
                        'STREAMS', stream, lastId,
                    );

                    if (result) {
                        for (const [, entries] of result) {
                            for (const [id, fields] of entries) {
                                lastIds.set(stream, id);
                                const fieldRecord = parseStreamFields(fields);
                                const matchResult = matches(fieldRecord, this._opts);
                                if (matchResult.matched) {
                                    yield toHit(stream, id, fieldRecord, matchResult.rawMessage);
                                }
                            }
                        }
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    throw new Error(`Watch failed for stream '${stream}': ${message}`);
                }
            }

            // Wait before next poll
            if (signal?.aborted) { return; }
            await new Promise<void>((resolve) => {
                let onAbort = (): void => undefined;
                const timer = setTimeout(() => {
                    if (signal) {
                        signal.removeEventListener('abort', onAbort);
                    }
                    resolve();
                }, this._pollIntervalMs);
                if (signal) {
                    onAbort = () => {
                        clearTimeout(timer);
                        signal.removeEventListener('abort', onAbort);
                        resolve();
                    };
                    signal.addEventListener('abort', onAbort, { once: true });
                }
            });
        }
    }
}
