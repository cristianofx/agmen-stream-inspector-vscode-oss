import Redis from 'ioredis';

const SCAN_COUNT = 1000;

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
    const useScanType = await supportsScanType(redis);

    for (const item of inputs) {
        if (signal?.aborted) { break; }

        if (isPattern(item)) {
            let cursor = '0';
            do {
                if (signal?.aborted) { break; }
                const [nextCursor, batch] = useScanType
                    ? await redis.scan(cursor, 'MATCH', item, 'COUNT', String(SCAN_COUNT), 'TYPE', 'stream')
                    : await redis.scan(cursor, 'MATCH', item, 'COUNT', String(SCAN_COUNT));

                if (useScanType) {
                    for (const key of batch) {
                        keys.add(key);
                    }
                } else {
                    for (const key of await filterStreamKeys(redis, batch)) {
                        keys.add(key);
                    }
                }
                cursor = nextCursor;
            } while (cursor !== '0');
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

async function supportsScanType(redis: Redis): Promise<boolean> {
    try {
        await redis.scan('0', 'MATCH', '__redisInspectorNeverMatches__', 'COUNT', '1', 'TYPE', 'stream');
        return true;
    } catch {
        return false;
    }
}

async function filterStreamKeys(redis: Redis, keys: string[]): Promise<string[]> {
    if (keys.length === 0) {
        return [];
    }

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
