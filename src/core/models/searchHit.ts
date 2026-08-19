import { toUtcDateTime } from '../services/redisStreamId';

export interface SearchHit {
    stream: string;
    id: string;
    fields: Record<string, string>;
    rawMessage: string | undefined;
    formattedRawMessage?: string;
    idDateTimeFormatted?: string;
}

export function createSearchHit(
    stream: string,
    id: string,
    fields: Record<string, string>,
    rawMessage: string | undefined,
): SearchHit {
    const dt = toUtcDateTime(id);
    const dtStr = dt ? formatDate(dt) : undefined;
    return {
        stream,
        id,
        fields,
        rawMessage,
        formattedRawMessage: formatIfJson(rawMessage),
        idDateTimeFormatted: dtStr ? `${id} - ${dtStr}` : id,
    };
}

function formatDate(d: Date): string {
    const pad = (n: number, len = 2) => String(n).padStart(len, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`;
}

/** Pretty-prints JSON if the text is (or contains) JSON; otherwise returns original. */
function formatIfJson(s: string | undefined): string | undefined {
    if (!s || !s.trim()) { return s; }
    const t = s.trim();

    // direct JSON object/array
    if (t.startsWith('{') || t.startsWith('[')) {
        const pretty = tryPrettyPrint(t);
        return pretty ?? s;
    }

    // JSON string literal possibly containing JSON
    if (t.startsWith('"')) {
        try {
            const parsed = JSON.parse(t);
            if (typeof parsed === 'string') {
                const inner = parsed.trim();
                if ((inner.startsWith('{') || inner.startsWith('[')) && tryPrettyPrint(inner)) {
                    return tryPrettyPrint(inner)!;
                }
                return parsed; // plain string contents
            }
        } catch { /* ignore */ }
    }

    return s;
}

function tryPrettyPrint(json: string): string | null {
    try {
        const parsed = JSON.parse(json);
        return JSON.stringify(parsed, null, 2);
    } catch {
        return null;
    }
}
