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
    environment: ProfileEnvironment;
    sortOrder: number;
}

export function createDefaultProfile(): ConnectionProfile {
    return {
        id: crypto.randomUUID(),
        name: '',
        redisUrl: '',
        redisUser: '',
        redisPass: '',
        sshHost: '',
        sshPort: 22,
        sshUser: '',
        sshPass: '',
        environment: ProfileEnvironment.Dev,
        sortOrder: 0,
    };
}
