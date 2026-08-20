import { Client, ConnectConfig } from 'ssh2';
import * as net from 'net';
import * as fs from 'fs';

export interface SshHostVerificationRequest {
    host: string;
    port: number;
    fingerprint: string;
    configuredFingerprint?: string;
}

export interface SshHostVerificationResult {
    accepted: boolean;
    trustedFingerprint?: string;
    errorMessage?: string;
}

export interface SshTunnelOptions {
    sshHost: string;
    sshPort: number;
    sshUser: string;
    sshPassword?: string;
    sshKeyPath?: string;
    sshKeyPassphrase?: string;
    sshHostKeyFingerprint?: string;
    hostKeyVerifier?(request: SshHostVerificationRequest): Promise<SshHostVerificationResult>;
    remoteHost: string;
    remotePort: number;
    localBindHost?: string;
    localBindPort?: number;
}

export class SshTunnel {
    private readonly _client: Client;
    private readonly _server: net.Server;
    readonly localHost: string;
    readonly localPort: number;

    private constructor(client: Client, server: net.Server, localHost: string, localPort: number) {
        this._client = client;
        this._server = server;
        this.localHost = localHost;
        this.localPort = localPort;
    }

    static async open(opts: SshTunnelOptions): Promise<SshTunnel> {
        if (!opts.sshHost || !opts.sshUser) {
            throw new Error('SSH host and user are required for tunneling.');
        }
        if (!opts.sshPassword && !opts.sshKeyPath) {
            throw new Error('Provide SSH password or key for authentication.');
        }
        if (!opts.sshHostKeyFingerprint && !opts.hostKeyVerifier) {
            throw new Error('SSH host fingerprint is required for secure tunneling.');
        }

        const localHost = opts.localBindHost || '127.0.0.1';
        const localPort = opts.localBindPort && opts.localBindPort > 0
            ? opts.localBindPort
            : await getFreeTcpPort(localHost);
        const trustedFingerprint = await resolveTrustedFingerprint(opts);
        let hostKeyMismatch = false;

        const config: ConnectConfig = {
            host: opts.sshHost,
            port: opts.sshPort,
            username: opts.sshUser,
            readyTimeout: 10000,
            hostHash: 'sha256',
            hostVerifier: (fingerprint: string) => {
                const accepted = fingerprint === stripFingerprintPrefix(trustedFingerprint);
                if (!accepted) {
                    hostKeyMismatch = true;
                }
                return accepted;
            },
        };

        if (opts.sshPassword) {
            config.password = opts.sshPassword;
        }
        if (opts.sshKeyPath) {
            config.privateKey = fs.readFileSync(resolveKeyPath(opts.sshKeyPath));
            if (opts.sshKeyPassphrase) {
                config.passphrase = opts.sshKeyPassphrase;
            }
        }

        const client = new Client();

        await new Promise<void>((resolve, reject) => {
            client.on('ready', () => resolve());
            client.on('error', (err) => reject(hostKeyMismatch
                ? new Error(`SSH host key mismatch for ${opts.sshHost}:${opts.sshPort}.`)
                : err));
            client.connect(config);
        });

        // Create a local TCP server that forwards connections through SSH
        const server = net.createServer((socket) => {
            client.forwardOut(
                localHost,
                localPort,
                opts.remoteHost,
                opts.remotePort,
                (err, stream) => {
                    if (err) {
                        socket.destroy();
                        return;
                    }
                    socket.pipe(stream);
                    stream.pipe(socket);
                    socket.on('error', () => stream.destroy());
                    stream.on('error', () => socket.destroy());
                }
            );
        });

        await new Promise<void>((resolve, reject) => {
            server.on('error', reject);
            server.listen(localPort, localHost, () => resolve());
        });

        return new SshTunnel(client, server, localHost, localPort);
    }

    dispose(): void {
        try { this._server.close(); } catch { /* ignore */ }
        try { this._client.end(); } catch { /* ignore */ }
    }
}

function getFreeTcpPort(host: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.on('error', reject);
        server.listen(0, host, () => {
            const addr = server.address() as net.AddressInfo;
            const port = addr.port;
            server.close(() => resolve(port));
        });
    });
}

function stripFingerprintPrefix(fingerprint: string): string {
    return fingerprint.replace(/^SHA256:/i, '');
}

async function resolveTrustedFingerprint(opts: SshTunnelOptions): Promise<string> {
    if (opts.sshHostKeyFingerprint) {
        return opts.sshHostKeyFingerprint;
    }
    if (!opts.hostKeyVerifier) {
        throw new Error('SSH host fingerprint is required for secure tunneling.');
    }

    const discoveredFingerprint = await discoverHostFingerprint(opts);
    const decision = await opts.hostKeyVerifier({
        host: opts.sshHost,
        port: opts.sshPort,
        fingerprint: discoveredFingerprint,
        configuredFingerprint: opts.sshHostKeyFingerprint,
    });

    if (!decision.accepted) {
        throw new Error(decision.errorMessage || 'SSH host fingerprint was not trusted.');
    }

    return decision.trustedFingerprint || discoveredFingerprint;
}

async function discoverHostFingerprint(opts: SshTunnelOptions): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const client = new Client();
        let fingerprint: string | undefined;
        let settled = false;

        const finish = (callback: () => void) => {
            if (settled) {
                return;
            }
            settled = true;
            try {
                client.end();
            } catch {
                // ignore cleanup failures from probe connections
            }
            callback();
        };

        client.on('ready', () => finish(() => fingerprint
            ? resolve(fingerprint)
            : reject(new Error('SSH fingerprint probe connected without capturing a fingerprint.'))));
        client.on('error', (error) => finish(() => fingerprint ? resolve(fingerprint) : reject(error)));
        client.on('close', () => finish(() => fingerprint
            ? resolve(fingerprint)
            : reject(new Error('SSH fingerprint probe closed before a fingerprint was captured.'))));
        client.connect({
            host: opts.sshHost,
            port: opts.sshPort,
            username: opts.sshUser,
            readyTimeout: 10000,
            hostHash: 'sha256',
            hostVerifier: (hashedKey: string) => {
                fingerprint = toFingerprint(hashedKey);
                return false;
            },
            password: opts.sshPassword,
            privateKey: opts.sshKeyPath ? fs.readFileSync(resolveKeyPath(opts.sshKeyPath)) : undefined,
            passphrase: opts.sshKeyPassphrase || undefined,
        });
    });
}

function toFingerprint(fingerprint: string): string {
    return fingerprint.startsWith('SHA256:') ? fingerprint : `SHA256:${fingerprint}`;
}

function resolveKeyPath(keyPath: string): string {
    return keyPath.replace(/%([^%]+)%/g, (_, name) => process.env[name] || '');
}
