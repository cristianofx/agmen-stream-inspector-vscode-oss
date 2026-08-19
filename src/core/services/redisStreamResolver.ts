import Redis from 'ioredis';

/**
 * Checks if the input string contains glob pattern characters.
 */
export function isPattern(input: string): boolean {
    return /[*?[\]]/.test(input);
}

/**
 * Resolves stream names from explicit keys or glob patterns.
 * Returns a list of unique stream keys.
 */
export async function resolveStreamsAsync(
    redis: Redis,
    inputs: string[],
    signal?: AbortSignal,
): Promise<string[]> {
    const keys = new Set<string>();

    for (const item of inputs) {
        if (signal?.aborted) { break; }

        if (isPattern(item)) {
            const stream = redis.scanStream({ match: item, count: 1000 });
            for await (const batch of stream) {
                if (signal?.aborted) { break; }
                for (const k of batch as string[]) {
                    if (await isStreamAsync(redis, k)) {
                        keys.add(k);
                    }
                }
            }
        } else {
            if (await isStreamAsync(redis, item)) {
                keys.add(item);
            }
        }
    }

    return Array.from(keys);
}

async function isStreamAsync(redis: Redis, key: string): Promise<boolean> {
    try {
        const type = await redis.type(key);
        return type === 'stream';
    } catch {
        return false;
    }
}
