import { SearchHit } from '../models/searchHit';

export class WatchResultBuffer {
    private readonly _items: SearchHit[] = [];
    private _droppedCount = 0;

    constructor(private readonly _maxItems: number) {}

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
