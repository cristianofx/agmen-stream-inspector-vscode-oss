import type { RedisOptions } from 'ioredis';
import { parseRedisEndpoint } from './redisEndpoint';

export const DEFAULT_CONNECT_TIMEOUT_MS = 5000;
export const DEFAULT_SYNC_TIMEOUT_MS = 5000;

export interface SshTunnelInfo {
    localHost: string;
    localPort: number;
}

/**
 * Builds ioredis connection options from a Redis URL string.
 * Supports redis://, rediss://, and host:port formats.
 */
export function buildRedisOptions(
    redisUrl: string,
    tunnel?: SshTunnelInfo,
    sslHostOverride?: string,
    connectTimeoutMs?: number,
    _syncTimeoutMs?: number,
    redisUserOverride?: string,
    redisPasswordOverride?: string,
): RedisOptions {
    const opts: RedisOptions = {
        connectTimeout: connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
        commandTimeout: _syncTimeoutMs ?? DEFAULT_SYNC_TIMEOUT_MS,
        keepAlive: 10000,
        lazyConnect: true,
        retryStrategy(times: number) {
            return Math.min(times * 1000, 5000);
        },
    };

    const endpoint = parseRedisEndpoint(redisUrl);
    const urlHost = endpoint.host;
    const urlPort = endpoint.port;
    const useTls = endpoint.tls;
    const redisPassword = endpoint.password;
    const redisUser = endpoint.username;

    if (tunnel) {
        opts.host = tunnel.localHost;
        opts.port = tunnel.localPort;
    } else {
        opts.host = urlHost || '127.0.0.1';
        opts.port = urlPort > 0 ? urlPort : 6379;
    }

    if (useTls) {
        const sslHost = sslHostOverride || (urlHost && !isLocal(urlHost) ? urlHost : undefined);
        opts.tls = sslHost ? { servername: sslHost } : {};
    }

    if (redisPasswordOverride) {
        opts.password = redisPasswordOverride;
    } else if (redisPassword) {
        opts.password = redisPassword;
    }

    if (redisUserOverride) {
        opts.username = redisUserOverride;
    } else if (redisUser) {
        opts.username = redisUser;
    }

    return opts;
}

function isLocal(host: string): boolean {
    return host.toLowerCase() === 'localhost' || host === '127.0.0.1' || host === '::1';
}
