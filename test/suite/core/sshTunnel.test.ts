import * as assert from 'assert';
import { Client, ConnectConfig } from 'ssh2';
import { SshTunnel } from '../../../src/core/services/sshTunnel';

describe('SshTunnel', () => {
    it('rewraps a pinned host-key mismatch with an actionable error', async () => {
        const clientPrototype = Client.prototype as Client & {
            connect(config: ConnectConfig): Client;
        };
        const originalConnect = clientPrototype.connect;

        clientPrototype.connect = function (this: Client, config: ConnectConfig): Client {
            assert.ok(config.hostVerifier);
            const hostVerifier = config.hostVerifier as (fingerprint: string) => boolean;
            assert.strictEqual(hostVerifier('different-fingerprint'), false);
            queueMicrotask(() => this.emit('error', new Error('Handshake failed')));
            return this;
        };

        try {
            await assert.rejects(
                SshTunnel.open({
                    sshHost: 'bastion.example.com',
                    sshPort: 22,
                    sshUser: 'tester',
                    sshPassword: 'password',
                    sshHostKeyFingerprint: 'SHA256:trusted-fingerprint',
                    remoteHost: 'redis.internal',
                    remotePort: 6379,
                }),
                /SSH host key mismatch for bastion\.example\.com:22\./,
            );
        } finally {
            clientPrototype.connect = originalConnect;
        }
    });
});
