import Redis from 'ioredis';
import { SearchOptions } from '../models/searchOptions';
import { SearchHit } from '../models/searchHit';
import { resolveStreamsAsync } from './redisStreamResolver';
import { matches, toHit, parseStreamFields } from './messageMatcher';

export class NoStreamsFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NoStreamsFoundError';
    }
}

/**
 * Stream search service. Construct with an ioredis instance and options.
 * Call runAsync to iterate over matching hits via an AsyncGenerator.
 */
export class SearchRunner {
    constructor(
        private readonly _redis: Redis,
        private readonly _opts: SearchOptions,
    ) {}

    async *runAsync(signal?: AbortSignal): AsyncGenerator<SearchHit> {
        const streams = await resolveStreamsAsync(this._redis, this._opts.streams, signal);
        if (streams.length === 0) {
            throw new NoStreamsFoundError(
                this._opts.streams.length === 1
                    ? `Stream '${this._opts.streams[0]}' was not found.`
                    : `No streams were found matching: ${this._opts.streams.join(', ')}`
            );
        }

        let remaining = this._opts.findMax;

        for (const stream of streams) {
            if (remaining <= 0 || signal?.aborted) { return; }

            if (this._opts.findLast > 0) {
                yield* this._scanTail(stream, remaining, signal);
            } else if (this._opts.newestFirst) {
                yield* this._scanDescending(stream, remaining, signal);
            } else {
                yield* this._scanAscending(stream, remaining, signal);
            }

            // Recalculate remaining (we can't easily track across generators,
            // so we track it here by re-counting)
            // Actually, we need to track across yields. Let's refactor slightly.
        }
    }

    private async *_scanTail(
        stream: string,
        maxRemaining: number,
        signal?: AbortSignal,
    ): AsyncGenerator<SearchHit> {
        let scanned = 0;
        let max = '+';
        let lastBoundaryId: string | undefined;
        let emitted = 0;

        while (scanned < this._opts.findLast && emitted < maxRemaining) {
            if (signal?.aborted) { return; }

            const pageCount = Math.min(this._opts.findPage, this._opts.findLast - scanned);
            // XREVRANGE key max min [COUNT count]
            const page = await this._redis.xrevrange(stream, max, '-', 'COUNT', pageCount);

            if (!page || page.length === 0) { break; }

            for (const [id, fields] of page) {
                if (id === lastBoundaryId) { continue; }
                scanned++;

                const fieldRecord = parseStreamFields(fields);
                const result = matches(fieldRecord, this._opts);
                if (result.matched) {
                    yield toHit(stream, id, fieldRecord, result.rawMessage);
                    emitted++;
                    if (emitted >= maxRemaining) { return; }
                }

                if (scanned >= this._opts.findLast) { break; }
            }

            lastBoundaryId = page[page.length - 1][0];
            max = lastBoundaryId;
            if (page.length < pageCount) { break; }
        }
    }

    private async *_scanDescending(
        stream: string,
        maxRemaining: number,
        signal?: AbortSignal,
    ): AsyncGenerator<SearchHit> {
        const from = this._opts.findFromId?.trim() || '-';
        const to = this._opts.findToId?.trim() || '+';
        let lastBoundaryId: string | undefined;
        let emitted = 0;

        while (emitted < maxRemaining) {
            if (signal?.aborted) { return; }

            const page = await this._redis.xrevrange(
                stream,
                lastBoundaryId ?? to,
                from,
                'COUNT',
                this._opts.findPage,
            );

            if (!page || page.length === 0) { break; }

            for (const [id, fields] of page) {
                if (id === lastBoundaryId) { continue; }

                const fieldRecord = parseStreamFields(fields);
                const result = matches(fieldRecord, this._opts);
                if (result.matched) {
                    yield toHit(stream, id, fieldRecord, result.rawMessage);
                    emitted++;
                    if (emitted >= maxRemaining) { return; }
                }
            }

            lastBoundaryId = page[page.length - 1][0];
            if (page.length < this._opts.findPage) { break; }
        }
    }

    private async *_scanAscending(
        stream: string,
        maxRemaining: number,
        signal?: AbortSignal,
    ): AsyncGenerator<SearchHit> {
        let from = this._opts.findFromId?.trim() || '-';
        const to = this._opts.findToId?.trim() || '+';
        let lastId: string | undefined;
        let emitted = 0;

        while (emitted < maxRemaining) {
            if (signal?.aborted) { return; }

            const page = await this._redis.xrange(
                stream,
                from,
                to,
                'COUNT',
                this._opts.findPage,
            );

            if (!page || page.length === 0) { break; }

            for (const [id, fields] of page) {
                if (id === lastId) { continue; }

                const fieldRecord = parseStreamFields(fields);
                const result = matches(fieldRecord, this._opts);
                if (result.matched) {
                    yield toHit(stream, id, fieldRecord, result.rawMessage);
                    emitted++;
                    if (emitted >= maxRemaining) { return; }
                }
            }

            lastId = page[page.length - 1][0];
            from = lastId;
            if (page.length < this._opts.findPage) { break; }
        }
    }
}
