import Redis from 'ioredis';

const SCAN_COUNT = 1000;

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
    const useScanType = await supportsScanType(redis);
    let cursor = '0';

    do {
        if (signal?.aborted) { break; }

        const [nextCursor, keys] = useScanType
            ? await redis.scan(cursor, 'MATCH', scanPattern, 'COUNT', String(SCAN_COUNT), 'TYPE', 'stream')
            : await redis.scan(cursor, 'MATCH', scanPattern, 'COUNT', String(SCAN_COUNT));

        if (useScanType) {
            streams.push(...keys);
        } else if (keys.length > 0) {
            streams.push(...await filterStreamKeys(redis, keys));
        }
        cursor = nextCursor;
    } while (cursor !== '0');

    // Sort alphabetically for better UX
    streams.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    return Array.from(new Set(streams));
}

async function supportsScanType(redis: Redis): Promise<boolean> {
    try {
        await redis.scan('0', 'MATCH', '__redisInspectorNeverMatches__', 'COUNT', '1', 'TYPE', 'stream');
        return true;
    } catch {
        return false;
    }
}

async function filterStreamKeys(redis: Redis, keys: string[]): Promise<string[]> {
    const pipeline = redis.pipeline();
    for (const key of keys) {
        pipeline.type(key);
    }

    const results = await pipeline.exec();
    if (!results) {
        return [];
    }
    return results
        .map((result, index) => ({ result, key: keys[index] }))
        .filter(({ result }) => result[0] == null && result[1] === 'stream')
        .map(({ key }) => key);
}
