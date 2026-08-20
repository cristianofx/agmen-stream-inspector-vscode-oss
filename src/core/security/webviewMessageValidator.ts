import { validateRedisUrl } from '../services/redisUrlValidator';

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

const MAIN_PANEL_MESSAGE_TYPES = new Set([
    'ready', 'startSearch', 'startWatch', 'cancel', 'fetchStreams', 'selectConnection',
    'addConnection', 'editConnection', 'deleteConnection', 'manageProfiles',
    'exportJson', 'exportCsv', 'replay', 'replayAll', 'selectResult',
]);
const SIDEBAR_MESSAGE_TYPES = new Set(['openInspector', 'addConnection']);
const REPLAY_DIALOG_MESSAGE_TYPES = new Set(['ready', 'send', 'cancel']);
const MANAGE_PROFILES_MESSAGE_TYPES = new Set(['ready', 'done']);
const EDIT_CONNECTION_MESSAGE_TYPES = new Set(['ready', 'save', 'cancel', 'testConnection', 'browseSshKey']);

export function validateMainPanelMessage(message: unknown): ValidationResult<Record<string, unknown>> {
    if (!isRecord(message) || !hasAllowedType(message, MAIN_PANEL_MESSAGE_TYPES)) {
        return invalid('Unsupported main-panel message.');
    }

    switch (message.type) {
        case 'startSearch':
        case 'startWatch':
            return validateSearchPayload(message.payload) ? valid(message) : invalid('Invalid search payload.');
        case 'fetchStreams':
        case 'selectConnection':
        case 'editConnection':
        case 'deleteConnection':
            return hasNonEmptyString((message as { payload?: Record<string, unknown> }).payload, 'profileId')
                ? valid(message)
                : invalid('profileId is required.');
        case 'replay':
            return Array.isArray((message as { payload?: { hitIndices?: unknown } }).payload?.hitIndices)
                ? valid(message)
                : invalid('hitIndices must be an array.');
        case 'selectResult':
            return typeof (message as { payload?: { index?: unknown } }).payload?.index === 'number'
                ? valid(message)
                : invalid('index must be numeric.');
        default:
            return valid(message);
    }
}

export function validateEditConnectionMessage(message: unknown): ValidationResult<Record<string, unknown>> {
    if (!isRecord(message) || !hasAllowedType(message, EDIT_CONNECTION_MESSAGE_TYPES)) {
        return invalid('Unsupported edit-connection message.');
    }

    if (message.type === 'save' || message.type === 'testConnection') {
        const payload = message.payload;
        if (!isRecord(payload) || !hasNonEmptyString(payload, 'redisUrl')) {
            return invalid('redisUrl is required.');
        }
        if (!validateRedisUrl(String(payload.redisUrl)).valid) {
            return invalid('redisUrl is invalid.');
        }
        if ('sshPort' in payload && !isValidPort(payload.sshPort)) {
            return invalid('sshPort is invalid.');
        }
    }

    return valid(message);
}

export function validateManageProfilesMessage(message: unknown): ValidationResult<Record<string, unknown>> {
    if (!isRecord(message) || !hasAllowedType(message, MANAGE_PROFILES_MESSAGE_TYPES)) {
        return invalid('Unsupported manage-profiles message.');
    }

    if (message.type === 'done') {
        const profiles = (message as { payload?: { profiles?: unknown } }).payload?.profiles;
        if (!Array.isArray(profiles)) {
            return invalid('profiles must be an array.');
        }
        const validProfiles = profiles.every((profile) => (
            isRecord(profile) &&
            hasNonEmptyString(profile, 'id') &&
            typeof profile.environment === 'number' &&
            typeof profile.sortOrder === 'number'
        ));
        if (!validProfiles) {
            return invalid('profiles payload is invalid.');
        }
    }

    return valid(message);
}

export function validateReplayDialogMessage(message: unknown): ValidationResult<Record<string, unknown>> {
    if (!isRecord(message) || !hasAllowedType(message, REPLAY_DIALOG_MESSAGE_TYPES)) {
        return invalid('Unsupported replay-dialog message.');
    }

    if (message.type === 'send' && !hasNonEmptyString((message as { payload?: Record<string, unknown> }).payload, 'profileId')) {
        return invalid('profileId is required.');
    }

    return valid(message);
}

export function validateSidebarMessage(message: unknown): ValidationResult<Record<string, unknown>> {
    if (!isRecord(message) || !hasAllowedType(message, SIDEBAR_MESSAGE_TYPES)) {
        return invalid('Unsupported sidebar message.');
    }
    return valid(message);
}

function validateSearchPayload(payload: unknown): boolean {
    if (!isRecord(payload) || !Array.isArray(payload.streams) || payload.streams.some((stream) => typeof stream !== 'string')) {
        return false;
    }
    if (!hasString(payload, 'findField') || !hasString(payload, 'findEq') || !hasString(payload, 'jsonField')) {
        return false;
    }
    if ('findLast' in payload && payload.findLast !== undefined && typeof payload.findLast !== 'number') {
        return false;
    }
    if ('findMax' in payload && payload.findMax !== undefined && typeof payload.findMax !== 'number') {
        return false;
    }
    return typeof payload.newestFirst === 'boolean' && typeof payload.caseInsensitive === 'boolean';
}

function isRecord(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null;
}

function hasAllowedType(
    value: Record<string, unknown>,
    allowedTypes: Set<string>,
): value is Record<string, unknown> & { type: string } {
    return typeof value.type === 'string' && allowedTypes.has(value.type);
}

function hasString(value: Record<string, unknown>, key: string): boolean {
    return typeof value[key] === 'string';
}

function hasNonEmptyString(value: Record<string, unknown> | undefined, key: string): boolean {
    return !!value && typeof value[key] === 'string' && value[key].trim().length > 0;
}

function isValidPort(value: unknown): boolean {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 65535;
}

function valid<T extends Record<string, unknown>>(value: T): ValidationResult<T> {
    return { ok: true, value };
}

function invalid(message: string): ValidationResult<Record<string, unknown>> {
    return { ok: false, error: message };
}
