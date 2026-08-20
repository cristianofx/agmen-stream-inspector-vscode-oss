export interface ParsedRedisEndpoint {
    input: string;
    scheme: 'redis' | 'rediss' | 'plain';
    host: string;
    port: number;
    username?: string;
    password?: string;
    db?: string;
    tls: boolean;
    normalizedUrl: string;
    redactedUrl: string;
}

export class RedisEndpointParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RedisEndpointParseError';
    }
}

const DEFAULT_REDIS_PORT = 6379;

export function parseRedisEndpoint(redisUrl: string): ParsedRedisEndpoint {
    const input = redisUrl.trim();
    if (!input) {
        throw new RedisEndpointParseError('Redis URL is required.');
    }

    if (hasUriScheme(input)) {
        return parseRedisUri(input);
    }

    return parseRedisHostPort(input);
}

function parseRedisUri(input: string): ParsedRedisEndpoint {
    let url: URL;
    try {
        url = new URL(input);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new RedisEndpointParseError(`Invalid Redis URI. ${message}`);
    }

    if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
        throw new RedisEndpointParseError('Redis URI must use redis:// or rediss://.');
    }
    if (!url.hostname) {
        throw new RedisEndpointParseError('URI must include host (e.g., redis://localhost:6379).');
    }

    const port = parsePort(url.port);
    const db = url.pathname && url.pathname !== '/' ? url.pathname : undefined;
    const username = url.username ? decodeURIComponent(url.username) : undefined;
    const password = url.password ? decodeURIComponent(url.password) : undefined;
    const protocol = url.protocol === 'rediss:' ? 'rediss' : 'redis';

    const clean = new URL(input);
    clean.username = username ? encodeURIComponent(username) : '';
    clean.password = '';

    const redacted = new URL(input);
    if (redacted.username || redacted.password) {
        redacted.username = redacted.username ? encodeURIComponent(decodeURIComponent(redacted.username)) : '';
        redacted.password = redacted.password ? '***' : '';
    }

    return {
        input,
        scheme: protocol,
        host: url.hostname,
        port,
        username,
        password,
        db,
        tls: protocol === 'rediss',
        normalizedUrl: withDefaultPort(clean, port).toString(),
        redactedUrl: withDefaultPort(redacted, port).toString(),
    };
}

function parseRedisHostPort(input: string): ParsedRedisEndpoint {
    let host: string;
    let port = DEFAULT_REDIS_PORT;

    if (input.startsWith('[')) {
        const closingBracket = input.indexOf(']');
        if (closingBracket < 0) {
            throw new RedisEndpointParseError('IPv6 hosts must use [addr] or [addr]:port.');
        }

        host = input.slice(1, closingBracket).trim();
        const remainder = input.slice(closingBracket + 1).trim();
        if (!host) {
            throw new RedisEndpointParseError('Host is required (e.g., localhost or localhost:6379).');
        }
        if (!remainder) {
            return createPlainEndpoint(input, host, port);
        }
        if (!remainder.startsWith(':')) {
            throw new RedisEndpointParseError('Unexpected characters after IPv6 host.');
        }
        port = parsePort(remainder.slice(1));
        return createPlainEndpoint(input, host, port);
    }

    const colonCount = [...input].filter((char) => char === ':').length;
    if (colonCount > 1) {
        throw new RedisEndpointParseError('Use host, host:port, [ipv6], or [ipv6]:port.');
    }

    const [rawHost, rawPort] = input.split(':');
    host = rawHost.trim();
    if (!host) {
        throw new RedisEndpointParseError('Host is required (e.g., localhost or localhost:6379).');
    }
    if (rawPort !== undefined) {
        port = parsePort(rawPort.trim());
    }

    return createPlainEndpoint(input, host, port);
}

function createPlainEndpoint(input: string, host: string, port: number): ParsedRedisEndpoint {
    const hostText = host.includes(':') ? `[${host}]` : host;
    return {
        input,
        scheme: 'plain',
        host,
        port,
        tls: false,
        normalizedUrl: `${hostText}:${port}`,
        redactedUrl: `${hostText}:${port}`,
    };
}

function parsePort(rawPort: string): number {
    if (!rawPort) {
        return DEFAULT_REDIS_PORT;
    }
    if (!/^\d+$/.test(rawPort)) {
        throw new RedisEndpointParseError('Port must be a number.');
    }

    const port = parseInt(rawPort, 10);
    if (port <= 0 || port > 65535) {
        throw new RedisEndpointParseError('Port out of range.');
    }
    return port;
}

function withDefaultPort(url: URL, port: number): URL {
    if (!url.port && port !== DEFAULT_REDIS_PORT) {
        url.port = String(port);
    }
    return url;
}

function hasUriScheme(input: string): boolean {
    return input.toLowerCase().startsWith('redis://') || input.toLowerCase().startsWith('rediss://');
}
