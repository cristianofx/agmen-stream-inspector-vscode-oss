import { ConnectionProfile } from '../core/models/connectionProfile';
import { ConnectionProfileStore } from './connectionProfileStore';

export class ConnectionService {
    constructor(private readonly _store: ConnectionProfileStore) {}

    async loadAllProfiles(): Promise<ConnectionProfile[]> {
        return this._store.loadAll();
    }

    async saveProfile(profile: ConnectionProfile): Promise<void> {
        const profiles = await this._store.loadAll();
        const idx = profiles.findIndex(p => p.id === profile.id);
        if (idx >= 0) {
            profiles[idx] = profile;
        } else {
            profiles.push(profile);
        }
        await this._store.saveAll(profiles);

        // Store passwords separately in SecretStorage
        if (profile.sshPass) {
            await this._store.storeSecret(profile.id, 'sshPass', profile.sshPass);
        }
        if (profile.redisPass) {
            await this._store.storeSecret(profile.id, 'redisPass', profile.redisPass);
        }
    }

    async deleteProfile(profileId: string): Promise<void> {
        const profiles = await this._store.loadAll();
        const filtered = profiles.filter(p => p.id !== profileId);
        await this._store.saveAll(filtered);
        await this._store.deleteSecrets(profileId);
    }

    async getDecryptedSshPassword(profileId: string): Promise<string | undefined> {
        return this._store.getSecret(profileId, 'sshPass');
    }

    async getDecryptedRedisPassword(profileId: string): Promise<string | undefined> {
        return this._store.getSecret(profileId, 'redisPass');
    }
}
