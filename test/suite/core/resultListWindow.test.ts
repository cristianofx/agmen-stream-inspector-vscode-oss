import * as assert from 'assert';
import { trimRenderedResultWindow } from '../../../src/webview/main/resultListWindow';

class FakeElement {
    constructor(private readonly _items: string[]) {}

    remove(): void {
        this._items.shift();
    }
}

class FakeResultList {
    constructor(private readonly _items: string[]) {}

    get children(): { length: number } {
        return { length: this._items.length };
    }

    get firstElementChild(): FakeElement | null {
        return this._items.length > 0 ? new FakeElement(this._items) : null;
    }

    get items(): string[] {
        return [...this._items];
    }
}

describe('trimRenderedResultWindow', () => {
    it('removes evicted entries until the rendered list matches the watch retention bound', () => {
        const list = new FakeResultList(['1-0', '2-0', '3-0', '4-0']);

        const removed = trimRenderedResultWindow(list, 2);

        assert.strictEqual(removed, 2);
        assert.deepStrictEqual(list.items, ['3-0', '4-0']);
    });
});
