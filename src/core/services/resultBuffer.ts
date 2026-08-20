import { SearchHit } from '../models/searchHit';

/** Keeps the results exposed to the webview and replay actions within a fixed memory budget. */
export class ResultBuffer {
    private readonly _items: SearchHit[] = [];
    private _droppedCount = 0;
    private readonly _maxItems: number;

    constructor(maxItems: number) {
        this._maxItems = Math.max(1, maxItems);
    }

    push(hit: SearchHit): void {
        this._items.push(hit);
        while (this._items.length > this._maxItems) {
            this._items.shift();
            this._droppedCount += 1;
        }
    }

    get items(): readonly SearchHit[] {
        return this._items;
    }

    get droppedCount(): number {
        return this._droppedCount;
    }
}
