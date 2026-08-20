import { ConditionalFilterGroup } from './conditionalFilterGroup';

export interface SearchOptions {
    /** false = head->tail (ascending), true = tail->head (descending). */
    newestFirst: boolean;
    /** Stream keys or glob patterns. */
    streams: string[];
    /** Field name to look for (inside JSON payload). */
    findField: string | undefined;
    /** Value to compare with (equals). If undefined, only existence of the field is matched. */
    findEq: string | undefined;
    /** Inclusive start id for forward scans. Defaults to "-". */
    findFromId: string;
    /** Inclusive end id for forward scans. Defaults to "+". */
    findToId: string;
    /** Tail scan: reverse-scan the last N entries per stream. If > 0, overrides forward scan. */
    findLast: number;
    /** Upper bound on total matches to return across all streams. */
    findMax: number;
    /** Page size for XRANGE/XREVRANGE. */
    findPage: number;
    /** Case-insensitive comparison for field names and equality checks. */
    findCaseInsensitive: boolean;
    /** Alias for findCaseInsensitive for compatibility */
    caseInsensitive?: boolean;
    /** Stream field that contains the JSON payload. */
    jsonField: string;
    /** Optional dotted path inside the JSON payload (e.g., "a.b[0].c"). */
    jsonPath: string | undefined;
    /** If true, only emit the raw JSON from jsonField for each hit. */
    messageOnly: boolean;
    /** Advanced conditional filter. When set, it is combined with findField/findEq using AND semantics. */
    conditionalFilter?: ConditionalFilterGroup;
}

export function createSearchOptions(opts?: Partial<SearchOptions>): SearchOptions {
    return {
        newestFirst: opts?.newestFirst ?? false,
        streams: opts?.streams ?? [],
        findField: opts?.findField || undefined,
        findEq: opts?.findEq?.trim() ? opts.findEq : undefined,
        findFromId: opts?.findFromId?.trim() || '-',
        findToId: opts?.findToId?.trim() || '+',
        findLast: Math.max(0, opts?.findLast ?? 0),
        findMax: (opts?.findMax ?? 0) <= 0 ? Number.MAX_SAFE_INTEGER : opts!.findMax!,
        findPage: (opts?.findPage ?? 0) <= 0 ? 100 : opts!.findPage!,
        findCaseInsensitive: opts?.findCaseInsensitive ?? false,
        jsonField: opts?.jsonField?.trim() || 'message',
        jsonPath: opts?.jsonPath?.trim() || undefined,
        messageOnly: opts?.messageOnly ?? false,
        conditionalFilter: opts?.conditionalFilter,
        caseInsensitive: opts?.findCaseInsensitive ?? false,
    };
}
