export interface ResultListWindow {
    readonly children: { length: number };
    readonly firstElementChild: { remove(): void } | null;
}

export function trimRenderedResultWindow(list: ResultListWindow, limit: number): number {
    const boundedLimit = Math.max(1, limit);
    let removed = 0;
    while (list.children.length > boundedLimit) {
        list.firstElementChild?.remove();
        removed += 1;
    }
    return removed;
}
