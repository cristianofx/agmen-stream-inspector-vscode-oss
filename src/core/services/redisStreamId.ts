/**
 * Converts a Redis Stream ID ("ms-seq") to a UTC Date.
 * Returns undefined for special IDs like "-" or "+".
 */
export function toUtc(id: string): Date | undefined {
    if (!id || id === '-' || id === '+') { return undefined; }
    const dash = id.indexOf('-');
    if (dash <= 0) { return undefined; }
    const msPart = id.substring(0, dash);
    const ms = parseInt(msPart, 10);
    if (isNaN(ms)) { return undefined; }
    try {
        return new Date(ms);
    } catch {
        return undefined;
    }
}

/** Convenience for UTC DateTime. */
export function toUtcDateTime(id: string): Date | undefined {
    return toUtc(id);
}

/** Convenience for local time. */
export function toLocal(id: string): Date | undefined {
    return toUtc(id); // JS Date is always the same instant; display is caller's concern
}
