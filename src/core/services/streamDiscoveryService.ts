import Redis from 'ioredis';

/**
 * Discovers all stream keys from a Redis server.
 */
export async function discoverStreamsAsync(
    redis: Redis,
    pattern?: string,
    signal?: AbortSignal,
): Promise<string[]> {
    const scanPattern = pattern?.trim() || '*';
    const streams: string[] = [];

    const stream = redis.scanStream({ match: scanPattern, count: 1000 });

    for await (const keys of stream) {
        if (signal?.aborted) { break; }

        for (const key of keys as string[]) {
            if (signal?.aborted) { break; }
            try {
                const type = await redis.type(key);
                if (type === 'stream') {
                    streams.push(key);
                }
            } catch {
                // Skip keys that fail TYPE check
            }
        }
    }

    // Sort alphabetically for better UX
    streams.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    return streams;
}
