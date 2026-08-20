import * as vscode from 'vscode';
import { ConnectionProfile } from '../core/models/connectionProfile';
import { parseRedisEndpoint } from '../core/services/redisEndpoint';

const PROFILES_KEY = 'redisInspector.connectionProfiles';

export class ConnectionProfileStore {
    constructor(
        private readonly _globalState: vscode.Memento,
        private readonly _secretStorage: vscode.SecretStorage,
    ) {}

    async loadAll(): Promise<ConnectionProfile[]> {
        return this._globalState.get<ConnectionProfile[]>(PROFILES_KEY, []);
    }

    async saveAll(profiles: ConnectionProfile[]): Promise<void> {
        // Strip passwords before storing in globalState (they go to SecretStorage)
        const sanitized = profiles.map((profile) => {
            const withoutSecrets = {
                ...profile,
                redisPass: '',
                sshPass: '',
                sshKeyPassphrase: '',
            };

            try {
                const endpoint = parseRedisEndpoint(profile.redisUrl);
                return {
                    ...withoutSecrets,
                    redisUrl: endpoint.password ? endpoint.normalizedUrl : profile.redisUrl,
                };
            } catch {
                return withoutSecrets;
            }
        });
        await this._globalState.update(PROFILES_KEY, sanitized);
    }

    async storeSecret(profileId: string, key: string, value: string): Promise<void> {
        if (value) {
            await this._secretStorage.store(`redisInspector.${profileId}.${key}`, value);
        } else {
            await this._secretStorage.delete(`redisInspector.${profileId}.${key}`);
        }
    }

    async getSecret(profileId: string, key: string): Promise<string | undefined> {
        return this._secretStorage.get(`redisInspector.${profileId}.${key}`);
    }

    async deleteSecrets(profileId: string): Promise<void> {
        await this._secretStorage.delete(`redisInspector.${profileId}.sshPass`);
        await this._secretStorage.delete(`redisInspector.${profileId}.sshKeyPassphrase`);
        await this._secretStorage.delete(`redisInspector.${profileId}.redisPass`);
    }
}
