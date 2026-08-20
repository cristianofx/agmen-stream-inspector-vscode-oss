import { ConnectionProfile } from '../core/models/connectionProfile';
import { parseRedisEndpoint } from '../core/services/redisEndpoint';
import { ConnectionProfileStore } from './connectionProfileStore';

export class ConnectionService {
    constructor(private readonly _store: ConnectionProfileStore) {}

    async loadAllProfiles(): Promise<ConnectionProfile[]> {
        const profiles = await this._store.loadAll();
        const migrated: ConnectionProfile[] = [];
        let changed = false;

        for (const profile of profiles) {
            const normalized = await this._migrateEmbeddedRedisCredentials(profile);
            migrated.push(normalized);
            changed ||= this._profilesDiffer(profile, normalized);
        }

        if (changed) {
            await this._store.saveAll(migrated);
        }

        return migrated;
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

    async getStoredSshHostFingerprint(profileId: string): Promise<string | undefined> {
        const profiles = await this._store.loadAll();
        return profiles.find((profile) => profile.id === profileId)?.sshHostKeyFingerprint || undefined;
    }

    async persistSshHostFingerprint(profileId: string, fingerprint: string): Promise<void> {
        const profiles = await this._store.loadAll();
        const index = profiles.findIndex((profile) => profile.id === profileId);
        if (index < 0) {
            return;
        }

        profiles[index] = {
            ...profiles[index],
            sshHostKeyFingerprint: fingerprint,
        };
        await this._store.saveAll(profiles);
    }

    private _normalizeProfile(profile: ConnectionProfile): ConnectionProfile {
        try {
            const endpoint = parseRedisEndpoint(profile.redisUrl);
            return {
                ...profile,
                redisUrl: endpoint.normalizedUrl,
                redisPass: profile.redisPass || endpoint.password || '',
                redisUser: profile.redisUser || endpoint.username || '',
            };
        } catch {
            return {
                ...profile,
                redisUrl: containsEmbeddedRedisCredentials(profile.redisUrl) ? '' : profile.redisUrl,
            };
        }
    }

    private async _migrateEmbeddedRedisCredentials(profile: ConnectionProfile): Promise<ConnectionProfile> {
        try {
            const endpoint = parseRedisEndpoint(profile.redisUrl);
            if (!endpoint.password) {
                return profile;
            }

            const secretKey = await this._store.getSecret(profile.id, 'redisPass');
            if (!secretKey) {
                await this._store.storeSecret(profile.id, 'redisPass', endpoint.password);
            }

            return {
                ...profile,
                redisUrl: endpoint.normalizedUrl,
                redisUser: profile.redisUser || endpoint.username || '',
            };
        } catch {
            if (!containsEmbeddedRedisCredentials(profile.redisUrl)) {
                return profile;
            }
            return {
                ...profile,
                redisUrl: '',
            };
        }
    }

    private _profilesDiffer(left: ConnectionProfile, right: ConnectionProfile): boolean {
        return JSON.stringify(left) !== JSON.stringify(right);
    }
}

function containsEmbeddedRedisCredentials(redisUrl: string): boolean {
    return /^rediss?:\/\/[^/]*@/i.test(redisUrl.trim());
}
