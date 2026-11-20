"use strict";

/**
 * Wraps the CSS Custom Highlight API for search matches.
 *
 * The Highlight is a page-wide resource shared by every picker, so each instance only tracks, and only ever
 * removes, the ranges it created itself.
 */
export default class Highlighter {
    static #shared;

    // Created on first use, so browsers without the API can still load the module and keep the plain select.
    static get #highlight() {
        if (!Highlighter.#shared) {
            Highlighter.#shared = new Highlight();
            CSS.highlights.set("platypicker-highlight", Highlighter.#shared);
        }

        return Highlighter.#shared;
    }

    #ranges = new WeakMap(); // owner element -> { [key]: Range[] }
    #owned = new Set();

    /**
     * Highlights the parts of a text node where search matched, as { start, end } in its text (see
     * Languages.match), so "nyc" marks the N, Y and C of "New York City". Drops the ranges when there are none.
     */
    apply(owner, key, node, match) {
        if (!node || !match?.length) {
            this.drop(owner, key);
            return;
        }

        let ranges = this.#ranges.get(owner);
        if (!ranges) this.#ranges.set(owner, ranges = {});

        const list = ranges[key] ??= [];
        for (const range of list.splice(match.length)) this.#forget(range);

        match.forEach(({ start, end }, i) => {
            const range = list[i] ??= new Range();
            range.setStart(node, start);
            range.setEnd(node, end);

            Highlighter.#highlight.add(range);
            this.#owned.add(range);
        });
    }

    drop(owner, key) {
        const list = this.#ranges.get(owner)?.[key];
        if (!list) return;

        for (const range of list) this.#forget(range);
        delete this.#ranges.get(owner)[key];
    }

    #forget(range) {
        Highlighter.#highlight.delete(range);
        this.#owned.delete(range);
    }

    clear() {
        for (const range of this.#owned) Highlighter.#highlight.delete(range);
        this.#owned.clear();
    }
}