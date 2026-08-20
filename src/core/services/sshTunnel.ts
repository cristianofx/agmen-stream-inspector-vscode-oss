import { Client, ConnectConfig } from 'ssh2';
import * as net from 'net';
import * as fs from 'fs';

export interface SshTunnelOptions {
    sshHost: string;
    sshPort: number;
    sshUser: string;
    sshPassword?: string;
    sshKeyPath?: string;
    sshKeyPassphrase?: string;
    sshHostKeyFingerprint?: string;
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
        if (!opts.sshHostKeyFingerprint) {
            throw new Error('SSH host fingerprint is required for secure tunneling.');
        }

        const localHost = opts.localBindHost || '127.0.0.1';
        const localPort = opts.localBindPort && opts.localBindPort > 0
            ? opts.localBindPort
            : await getFreeTcpPort(localHost);

        const config: ConnectConfig = {
            host: opts.sshHost,
            port: opts.sshPort,
            username: opts.sshUser,
            readyTimeout: 10000,
            hostHash: 'sha256',
            hostVerifier: (fingerprint: string) => fingerprint === stripFingerprintPrefix(opts.sshHostKeyFingerprint!),
        };

        if (opts.sshPassword) {
            config.password = opts.sshPassword;
        }
        if (opts.sshKeyPath) {
            const keyPath = opts.sshKeyPath.replace(/%([^%]+)%/g, (_, name) => process.env[name] || '');
            config.privateKey = fs.readFileSync(keyPath);
            if (opts.sshKeyPassphrase) {
                config.passphrase = opts.sshKeyPassphrase;
            }
        }

        const client = new Client();

        await new Promise<void>((resolve, reject) => {
            client.on('ready', () => resolve());
            client.on('error', (err) => reject(err));
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
