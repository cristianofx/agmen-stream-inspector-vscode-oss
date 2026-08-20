import * as assert from 'assert';
import { verifySshHostKey } from '../../../src/core/services/sshHostKeyVerifier';

describe('verifySshHostKey', () => {
    it('rejects an unknown host when the user does not approve trust on first use', async () => {
        const decision = await verifySshHostKey({
            profileId: 'p1',
            host: 'bastion.example.com',
            port: 22,
            fingerprint: 'SHA256:new',
            getStoredFingerprint: async () => undefined,
            persistFingerprint: async () => undefined,
            confirmFingerprint: async () => false,
        });

        assert.strictEqual(decision.accepted, false);
        assert.strictEqual(decision.reason, 'untrusted');
    });

    it('persists a newly trusted fingerprint', async () => {
        const persisted: string[] = [];
        const decision = await verifySshHostKey({
            profileId: 'p1',
            host: 'bastion.example.com',
            port: 22,
            fingerprint: 'SHA256:new',
            getStoredFingerprint: async () => undefined,
            persistFingerprint: async (_profileId: string, fingerprint: string) => { persisted.push(fingerprint); },
            confirmFingerprint: async () => true,
        });

        assert.strictEqual(decision.accepted, true);
        assert.deepStrictEqual(persisted, ['SHA256:new']);
    });

    it('blocks a changed fingerprint', async () => {
        const decision = await verifySshHostKey({
            profileId: 'p1',
            host: 'bastion.example.com',
            port: 22,
            fingerprint: 'SHA256:new',
            getStoredFingerprint: async () => 'SHA256:old',
            persistFingerprint: async () => undefined,
            confirmFingerprint: async () => true,
        });

        assert.strictEqual(decision.accepted, false);
        assert.strictEqual(decision.reason, 'mismatch');
    });
});
