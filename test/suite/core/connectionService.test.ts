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
});
