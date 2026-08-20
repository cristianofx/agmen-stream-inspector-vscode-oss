import { ConnectionProfile } from '../core/models/connectionProfile';
import { parseRedisEndpoint } from '../core/services/redisEndpoint';
import { ConnectionProfileStore } from './connectionProfileStore';

export class ConnectionService {
    constructor(private readonly _store: ConnectionProfileStore) {}

    async loadAllProfiles(): Promise<ConnectionProfile[]> {
        return this._store.loadAll();
    }

    async saveProfile(profile: ConnectionProfile): Promise<void> {
        const normalizedProfile = this._normalizeProfile(profile);
        const profiles = await this._store.loadAll();
        const idx = profiles.findIndex(p => p.id === normalizedProfile.id);
        if (idx >= 0) {
            profiles[idx] = normalizedProfile;
        } else {
            profiles.push(normalizedProfile);
        }
        await this._store.saveAll(profiles);

        // Store passwords separately in SecretStorage
        await this._store.storeSecret(normalizedProfile.id, 'sshPass', normalizedProfile.sshPass);
        await this._store.storeSecret(normalizedProfile.id, 'sshKeyPassphrase', normalizedProfile.sshKeyPassphrase || '');
        await this._store.storeSecret(normalizedProfile.id, 'redisPass', normalizedProfile.redisPass);
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

    async getDecryptedSshKeyPassphrase(profileId: string): Promise<string | undefined> {
        return this._store.getSecret(profileId, 'sshKeyPassphrase');
    }

    private _normalizeProfile(profile: ConnectionProfile): ConnectionProfile {
        try {
            const endpoint = parseRedisEndpoint(profile.redisUrl);
            if (!endpoint.password) {
                return profile;
            }

            return {
                ...profile,
                redisUrl: endpoint.normalizedUrl,
                redisPass: profile.redisPass || endpoint.password,
                redisUser: profile.redisUser || endpoint.username || '',
            };
        } catch {
            return profile;
        }
    }
}
