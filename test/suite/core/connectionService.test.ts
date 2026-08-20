import * as assert from 'assert';
import { createDefaultProfile } from '../../../src/core/models/connectionProfile';
import { ConnectionProfileStore } from '../../../src/services/connectionProfileStore';
import { ConnectionService } from '../../../src/services/connectionService';

class FakeMemento {
    private _value: unknown;

    get<T>(_key: string, defaultValue: T): T {
        return (this._value as T | undefined) ?? defaultValue;
    }

    async update(_key: string, value: unknown): Promise<void> {
        this._value = value;
    }
}

class FakeSecretStorage {
    private readonly _secrets = new Map<string, string>();

    async get(key: string): Promise<string | undefined> {
        return this._secrets.get(key);
    }

    async store(key: string, value: string): Promise<void> {
        this._secrets.set(key, value);
    }

    async delete(key: string): Promise<void> {
        this._secrets.delete(key);
    }
}

describe('ConnectionService', () => {
    it('removes passwords from persisted redis URLs and stores them in SecretStorage', async () => {
        const store = new ConnectionProfileStore(new FakeMemento() as never, new FakeSecretStorage() as never);
        const service = new ConnectionService(store);
        const profile = createDefaultProfile();
        profile.name = 'prod';
        profile.redisUrl = 'redis://:topsecret@example.com:6379/0';

        await service.saveProfile(profile);

        const saved = await service.loadAllProfiles();
        assert.strictEqual(saved[0].redisUrl, 'redis://example.com:6379/0');
        assert.strictEqual(await service.getDecryptedRedisPassword(profile.id), 'topsecret');
    });

    it('deletes cleared secrets instead of keeping the previous value active', async () => {
        const store = new ConnectionProfileStore(new FakeMemento() as never, new FakeSecretStorage() as never);
        const service = new ConnectionService(store);
        const profile = createDefaultProfile();
        profile.name = 'stage';
        profile.redisPass = 'first-secret';

        await service.saveProfile(profile);
        profile.redisPass = '';
        await service.saveProfile(profile);

        assert.strictEqual(await service.getDecryptedRedisPassword(profile.id), undefined);
    });

    it('migrates persisted credential-bearing URLs into SecretStorage during load', async () => {
        const memento = new FakeMemento();
        const secrets = new FakeSecretStorage();
        const store = new ConnectionProfileStore(memento as never, secrets as never);
        const legacyProfile = createDefaultProfile();
        legacyProfile.name = 'legacy';
        legacyProfile.redisUrl = 'redis://:legacy-pass@example.com:6379/0';
        await memento.update('redisInspector.connectionProfiles', [legacyProfile]);

        const service = new ConnectionService(store);
        const loaded = await service.loadAllProfiles();

        assert.strictEqual(loaded[0].redisUrl, 'redis://example.com:6379/0');
        assert.strictEqual(await service.getDecryptedRedisPassword(legacyProfile.id), 'legacy-pass');
    });

    it('clears unparseable credential-bearing URLs instead of persisting them', async () => {
        const memento = new FakeMemento();
        const store = new ConnectionProfileStore(memento as never, new FakeSecretStorage() as never);
        const legacyProfile = createDefaultProfile();
        legacyProfile.name = 'broken';
        legacyProfile.redisUrl = 'redis://user:secret@';
        await memento.update('redisInspector.connectionProfiles', [legacyProfile]);

        const service = new ConnectionService(store);
        const loaded = await service.loadAllProfiles();

        assert.strictEqual(loaded[0].redisUrl, '');
    });

    it('persists and reloads SSH key passphrases and learned fingerprints', async () => {
        const store = new ConnectionProfileStore(new FakeMemento() as never, new FakeSecretStorage() as never);
        const service = new ConnectionService(store);
        const profile = createDefaultProfile();
        profile.name = 'ssh';
        profile.redisUrl = 'redis://localhost:6379';
        profile.sshHost = 'bastion.example.com';
        profile.sshUser = 'tester';
        profile.sshKeyPath = '/tmp/id_ed25519';
        profile.sshKeyPassphrase = 'key-secret';

        await service.saveProfile(profile);
        await service.persistSshHostFingerprint(profile.id, 'SHA256:fingerprint');

        assert.strictEqual(await service.getDecryptedSshKeyPassphrase(profile.id), 'key-secret');
        assert.strictEqual(await service.getStoredSshHostFingerprint(profile.id), 'SHA256:fingerprint');
    });
});
