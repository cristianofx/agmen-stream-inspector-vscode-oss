import { SearchOptions } from '../models/searchOptions';
import { SearchHit, createSearchHit } from '../models/searchHit';
import * as conditionalMatcher from './conditionalMatcher';

const MAX_JSON_SEARCH_DEPTH = 50;

export type StreamEntry = [id: string, fields: string[]];

/**
 * Checks if a Redis stream entry matches the search criteria.
 * Returns the rawMessage if matched, undefined otherwise.
 */
export function matches(
    entryFields: Record<string, string>,
    opts: SearchOptions,
): { matched: boolean; rawMessage?: string | undefined } {
    const basicMatch = matchBasicFields(entryFields, opts);
    if (!basicMatch.matched) {
        return basicMatch;
    }

    if (opts.conditionalFilter &&
        (opts.conditionalFilter.conditions.length > 0 ||
            opts.conditionalFilter.nestedGroups?.length)) {
        const advancedMatch = conditionalMatcher.matches(entryFields, opts.conditionalFilter, opts);
        if (!advancedMatch.matched) {
            return advancedMatch;
        }
        return {
            matched: true,
            rawMessage: advancedMatch.rawMessage ?? basicMatch.rawMessage,
        };
    }

    return basicMatch;
}

function matchBasicFields(
    entryFields: Record<string, string>,
    opts: SearchOptions,
): { matched: boolean; rawMessage?: string | undefined } {
    const caseInsensitive = opts.findCaseInsensitive;
    const jsonFieldName = opts.jsonField || 'message';

    for (const [key, value] of Object.entries(entryFields)) {
        if (!keyEquals(key, jsonFieldName, caseInsensitive)) { continue; }
        if (!value || !value.trim()) { continue; }

        let root = tryExtractJsonRoot(value);

        if (root === undefined) {
            // Try secondary decode: JSON string literal
            try {
                const parsed = JSON.parse(value);
                if (typeof parsed === 'string') {
                    const innerRoot = tryExtractJsonRoot(parsed);
                    if (innerRoot !== undefined) {
                        root = innerRoot;
                    } else {
                        // plain string case
                        if (opts.findField !== undefined && opts.findField !== '') {
                            if (!opts.findEq || stringEquals(parsed, opts.findEq, caseInsensitive)) {
                                return { matched: true, rawMessage: parsed };
                            }
                        } else if (!opts.findField) {
                            return { matched: true, rawMessage: parsed };
                        }
                        continue;
                    }
                } else {
                    continue;
                }
            } catch {
                continue;
            }
        }

        // We have a JSON root
        let extracted: string | undefined;

        if (opts.jsonPath) {
            const result = tryGetByPath(root, opts.jsonPath);
            if (result !== undefined) {
                extracted = jsonValueToString(result);
            }
        } else if (opts.findField) {
            const result = tryFindFirstByKey(root, opts.findField, caseInsensitive, 0);
            if (result !== undefined) {
                extracted = jsonValueToString(result);
            }
        } else {
            extracted = jsonValueToString(root);
        }

        if (extracted !== undefined) {
            if ((!opts.findField || opts.findField === '') && opts.findEq) {
                // No field specified but equality value: contains check
                if (extracted.includes(opts.findEq)) {
                    return { matched: true, rawMessage: getRawMessageValue(root, opts) };
                }
            } else {
                const eqOk = opts.findEq === undefined || opts.findEq === null ||
                    stringEquals(extracted, opts.findEq, caseInsensitive);
                if (eqOk) {
                    return { matched: true, rawMessage: getRawMessageValue(root, opts) };
                }
            }
        }
    }

    return { matched: false, rawMessage: undefined };
}

/** Creates a SearchHit from a stream entry. */
export function toHit(
    stream: string,
    id: string,
    fields: Record<string, string>,
    rawMessage: string | undefined,
): SearchHit {
    return createSearchHit(stream, id, fields, rawMessage);
}

/** Parses ioredis flat array response into a key-value Record. */
export function parseStreamFields(flatFields: string[]): Record<string, string> {
    const record: Record<string, string> = {};
    for (let i = 0; i < flatFields.length; i += 2) {
        record[flatFields[i]] = flatFields[i + 1];
    }
    return record;
}

// --- Internal helpers ---

function getRawMessageValue(root: unknown, opts: SearchOptions): string | undefined {
    if (opts.messageOnly) {
        return JSON.stringify(root);
    }
    if (typeof root === 'string') { return root; }
    if (typeof root === 'object' && root !== null) { return JSON.stringify(root); }
    return undefined;
}

function tryExtractJsonRoot(value: string): unknown | undefined {
    try {
        const s = value.trim();
        if (s.length === 0) { return undefined; }

        // Case 1: direct JSON object/array
        if (s[0] === '{' || s[0] === '[') {
            return JSON.parse(s);
        }

        // Case 2: JSON string literal that itself contains JSON
        if (s[0] === '"') {
            const outer = JSON.parse(s);
            if (typeof outer === 'string') {
                const inner = outer.trim();
                if (inner.startsWith('{') || inner.startsWith('[')) {
                    return JSON.parse(inner);
                }
            }
        }
    } catch { /* swallow parse errors */ }
    return undefined;
}

function tryGetByPath(root: unknown, path: string): unknown | undefined {
    let cur: unknown = root;
    const segs = path.split('.').filter(s => s.length > 0);

    for (const raw of segs) {
        let name = raw;
        let arrIndex: number | undefined;

        const lb = raw.indexOf('[');
        if (lb >= 0 && raw.endsWith(']')) {
            const idxStr = raw.substring(lb + 1, raw.length - 1);
            const idx = parseInt(idxStr, 10);
            if (!isNaN(idx)) {
                name = raw.substring(0, lb);
                arrIndex = idx;
            }
        }

        if (name) {
            if (typeof cur !== 'object' || cur === null || Array.isArray(cur)) {
                return undefined;
            }
            if (!(name in (cur as Record<string, unknown>))) {
                return undefined;
            }
            cur = (cur as Record<string, unknown>)[name];
        }

        if (arrIndex !== undefined) {
            if (!Array.isArray(cur) || arrIndex < 0 || arrIndex >= cur.length) {
                return undefined;
            }
            cur = cur[arrIndex];
        }
    }

    return cur;
}

function tryFindFirstByKey(
    root: unknown,
    key: string,
    caseInsensitive: boolean,
    depth: number,
): unknown | undefined {
    if (depth > MAX_JSON_SEARCH_DEPTH) { return undefined; }

    if (typeof root === 'object' && root !== null && !Array.isArray(root)) {
        for (const [propName, propValue] of Object.entries(root)) {
            if (keyEquals(propName, key, caseInsensitive)) {
                return propValue;
            }
            const found = tryFindFirstByKey(propValue, key, caseInsensitive, depth + 1);
            if (found !== undefined) { return found; }
        }
    } else if (Array.isArray(root)) {
        for (const item of root) {
            const found = tryFindFirstByKey(item, key, caseInsensitive, depth + 1);
            if (found !== undefined) { return found; }
        }
    }

    return undefined;
}

function jsonValueToString(value: unknown): string {
    if (value === null) { return 'null'; }
    if (value === undefined) { return ''; }
    if (typeof value === 'string') { return value; }
    if (typeof value === 'number' || typeof value === 'boolean') { return String(value); }
    return JSON.stringify(value);
}

function keyEquals(a: string, b: string, caseInsensitive: boolean): boolean {
    if (caseInsensitive) {
        return a.toLowerCase() === b.toLowerCase();
    }
    return a === b;
}

function stringEquals(a: string, b: string, caseInsensitive: boolean): boolean {
    if (caseInsensitive) {
        return a.toLowerCase() === b.toLowerCase();
    }
    return a === b;
}
