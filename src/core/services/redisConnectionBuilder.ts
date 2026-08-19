import type { RedisOptions } from 'ioredis';

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

    const uriLike = redisUrl.toLowerCase().startsWith('redis://') ||
                    redisUrl.toLowerCase().startsWith('rediss://');

    let useTls = false;
    let redisPassword: string | undefined;
    let redisUser: string | undefined;
    let urlHost: string | undefined;
    let urlPort = -1;

    if (uriLike) {
        const u = new URL(redisUrl);
        urlHost = u.hostname || undefined;
        urlPort = u.port ? parseInt(u.port, 10) : -1;
        useTls = u.protocol === 'rediss:';

        if (u.username || u.password) {
            if (u.username && u.password) {
                redisUser = decodeURIComponent(u.username);
                redisPassword = decodeURIComponent(u.password);
            } else if (u.password) {
                redisPassword = decodeURIComponent(u.password);
            } else if (u.username) {
                // Could be just password (redis://:password@host)
                redisUser = decodeURIComponent(u.username);
            }
        }
    } else {
        const parts = redisUrl.split(':').map(p => p.trim()).filter(p => p.length > 0);
        urlHost = parts.length > 0 ? parts[0] : undefined;
        urlPort = parts.length > 1 ? parseInt(parts[1], 10) : -1;
        if (isNaN(urlPort)) { urlPort = -1; }
    }

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
