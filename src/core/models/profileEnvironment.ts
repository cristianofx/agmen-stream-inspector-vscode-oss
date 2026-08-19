export enum ProfileEnvironment {
    Dev = 0,
    Test = 1,
    Prod = 2,
}

export function getEnvironmentName(env: ProfileEnvironment): string {
    switch (env) {
        case ProfileEnvironment.Dev: return 'Dev';
        case ProfileEnvironment.Test: return 'Test';
        case ProfileEnvironment.Prod: return 'Prod';
        default: return 'Dev';
    }
}

export function getEnvironmentColor(env: ProfileEnvironment): string {
    switch (env) {
        case ProfileEnvironment.Test: return '#0095FF';
        case ProfileEnvironment.Prod: return '#FF2041';
        default: return '';
    }
}
