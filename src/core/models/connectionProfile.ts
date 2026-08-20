import { ProfileEnvironment } from './profileEnvironment';

export interface ConnectionProfile {
    id: string;
    name: string;
    redisUrl: string;
    redisUser: string;
    redisPass: string;
    sshHost: string;
    sshPort: number;
    sshUser: string;
    sshPass: string;
    sshKeyPath?: string;
    sshKeyPassphrase?: string;
    sshHostKeyFingerprint?: string;
    environment: ProfileEnvironment;
    sortOrder: number;
}

export function createDefaultProfile(): ConnectionProfile {
    return {
        id: crypto.randomUUID(),
        name: '',
        redisUrl: 'redis://localhost:6379',
        redisUser: '',
        redisPass: '',
        sshHost: '',
        sshPort: 22,
        sshUser: '',
        sshPass: '',
        sshKeyPath: '',
        sshKeyPassphrase: '',
        sshHostKeyFingerprint: '',
        environment: ProfileEnvironment.Dev,
        sortOrder: 0,
    };
}
