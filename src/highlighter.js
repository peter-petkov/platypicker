"use strict";

import Languages from "./languages.js";

/**
 * Wraps the CSS Custom Highlight API for search matches.
 *
 * The Highlight is a page-wide resource shared by every picker, so each instance only tracks, and only ever
 * removes, the ranges it created itself.
 */
export default class Highlighter {
    static maxHighlights = 100;

    static #shared;

    // Created on first use, so browsers without the API can still load the module and keep the plain select.
    static get #highlight() {
        if (!Highlighter.#shared) {
            Highlighter.#shared = new Highlight();
            CSS.highlights.set("platypicker-highlight", Highlighter.#shared);
        }

        return Highlighter.#shared;
    }

    #ranges = new WeakMap(); // owner element -> { [key]: Range }
    #owned = new Set();

    /** True once the page-wide highlight holds as many ranges as allowed. */
    get isFull() {
        return Highlighter.#highlight.size >= Highlighter.maxHighlights;
    }

    /**
     * Highlights the first occurrence of the (folded) query in a text node, compared as search compares it, so
     * "zur" marks the "Zür" of "Zürich". Drops the range if there is none.
     */
    apply(owner, key, node, query, locale) {
        const match = node ? Languages.locate(node.data, query, locale) : null;
        if (!match) {
            this.drop(owner, key);
            return;
        }

        let ranges = this.#ranges.get(owner);
        if (!ranges) this.#ranges.set(owner, ranges = {});

        const range = ranges[key] ??= new Range();
        range.setStart(node, match.start);
        range.setEnd(node, match.end);

        Highlighter.#highlight.add(range);
        this.#owned.add(range);
    }

    drop(owner, key) {
        const range = this.#ranges.get(owner)?.[key];
        if (!range) return;

        Highlighter.#highlight.delete(range);
        this.#owned.delete(range);
        delete this.#ranges.get(owner)[key];
    }

    clear() {
        for (const range of this.#owned) Highlighter.#highlight.delete(range);
        this.#owned.clear();
    }
}