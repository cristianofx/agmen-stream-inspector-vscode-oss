import { validateRedisUrl } from '../services/redisUrlValidator';
import { ConditionalFilterGroup } from '../models/conditionalFilterGroup';
import { LogicalOperator } from '../models/logicalOperator';
import { FilterOperator } from '../models/filterOperator';

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };
type UnknownRecord = Record<string, unknown>;

const MAX_STREAMS = 500;
const MAX_REPLAY_HIT_INDICES = 10_000;
const MAX_FIND_LIMIT = 1_000_000;
const MAX_PROFILE_REORDER = 500;
const MAX_FILTER_DEPTH = 4;
const MAX_FILTER_GROUPS = 32;
const MAX_FILTER_CONDITIONS = 128;
const MAX_FIELD_LENGTH = 256;
const MAX_VALUE_LENGTH = 4096;

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
            return isValidIndexArray((message as { payload?: { hitIndices?: unknown } }).payload?.hitIndices, MAX_REPLAY_HIT_INDICES)
                ? valid(message)
                : invalid('hitIndices must be a bounded array of non-negative integers.');
        case 'selectResult':
            return isNonNegativeInteger((message as { payload?: { index?: unknown } }).payload?.index)
                ? valid(message)
                : invalid('index must be a non-negative integer.');
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
        if (hasNonEmptyString(payload, 'sshHost')) {
            if (!hasNonEmptyString(payload, 'sshUser')) {
                return invalid('sshUser is required when SSH tunneling is enabled.');
            }
            if (!hasNonEmptyString(payload, 'sshPass') && !hasNonEmptyString(payload, 'sshKeyPath')) {
                return invalid('SSH password or private key is required when SSH tunneling is enabled.');
            }
        }
        if (hasNonEmptyString(payload, 'sshKeyPassphrase') && !hasNonEmptyString(payload, 'sshKeyPath')) {
            return invalid('sshKeyPassphrase requires sshKeyPath.');
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
        if (profiles.length > MAX_PROFILE_REORDER) {
            return invalid('profiles payload is too large.');
        }
        const validProfiles = profiles.every((profile) => (
            isRecord(profile) &&
            hasNonEmptyString(profile, 'id') &&
            isKnownEnvironment(profile.environment) &&
            isNonNegativeInteger(profile.sortOrder)
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
    if (!isRecord(payload) || !Array.isArray(payload.streams) || payload.streams.length > MAX_STREAMS) {
        return false;
    }
    if (payload.streams.some((stream) => typeof stream !== 'string' || stream.trim().length === 0 || stream.length > MAX_FIELD_LENGTH)) {
        return false;
    }
    if (!hasString(payload, 'findField') || !hasString(payload, 'findEq') || !hasString(payload, 'jsonField')) {
        return false;
    }
    if ('findLast' in payload && payload.findLast !== undefined && !isBoundedPositiveInteger(payload.findLast, MAX_FIND_LIMIT)) {
        return false;
    }
    if ('findMax' in payload && payload.findMax !== undefined && !isBoundedPositiveInteger(payload.findMax, MAX_FIND_LIMIT)) {
        return false;
    }
    if (typeof payload.newestFirst !== 'boolean' || typeof payload.caseInsensitive !== 'boolean') {
        return false;
    }
    if ('conditionalFilter' in payload && payload.conditionalFilter !== undefined) {
        return validateConditionalFilter(payload.conditionalFilter, 1, { groups: 0, conditions: 0 });
    }
    return true;
}

function isRecord(value: unknown): value is UnknownRecord {
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

function isBoundedPositiveInteger(value: unknown, max: number): boolean {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= max;
}

function isNonNegativeInteger(value: unknown): boolean {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isValidIndexArray(value: unknown, maxLength: number): boolean {
    return Array.isArray(value)
        && value.length <= maxLength
        && value.every((item) => isNonNegativeInteger(item));
}

function isKnownEnvironment(value: unknown): boolean {
    return value === 0 || value === 1 || value === 2;
}

function validateConditionalFilter(
    value: unknown,
    depth: number,
    counts: { groups: number; conditions: number },
): value is ConditionalFilterGroup {
    if (!isRecord(value) || !Array.isArray(value.conditions) || !Object.values(LogicalOperator).includes(value.operator as LogicalOperator)) {
        return false;
    }
    if (depth > MAX_FILTER_DEPTH) {
        return false;
    }

    counts.groups += 1;
    if (counts.groups > MAX_FILTER_GROUPS) {
        return false;
    }

    for (const condition of value.conditions) {
        if (!validateCondition(condition)) {
            return false;
        }
        counts.conditions += 1;
        if (counts.conditions > MAX_FILTER_CONDITIONS) {
            return false;
        }
    }

    if (!('nestedGroups' in value) || value.nestedGroups === undefined) {
        return true;
    }
    if (!Array.isArray(value.nestedGroups)) {
        return false;
    }

    return value.nestedGroups.every((group) => validateConditionalFilter(group, depth + 1, counts));
}

function validateCondition(value: unknown): boolean {
    if (!isRecord(value) || !hasNonEmptyString(value, 'fieldName') || typeof value.value !== 'string') {
        return false;
    }
    if (!Object.values(FilterOperator).includes(value.operator as FilterOperator)) {
        return false;
    }
    if (String(value.fieldName).length > MAX_FIELD_LENGTH || value.value.length > MAX_VALUE_LENGTH) {
        return false;
    }
    if ('jsonPath' in value && value.jsonPath !== undefined && (typeof value.jsonPath !== 'string' || value.jsonPath.length > MAX_FIELD_LENGTH)) {
        return false;
    }
    return true;
}

function valid<T extends Record<string, unknown>>(value: T): ValidationResult<T> {
    return { ok: true, value };
}

function invalid(message: string): ValidationResult<Record<string, unknown>> {
    return { ok: false, error: message };
}
