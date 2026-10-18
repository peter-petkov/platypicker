"use strict";

/**
 * An <optgroup> as the list sees it.
 */
export class OptionGroup {
    constructor(element) {
        this.element = element;
    }

    get label() {
        return this.element.label;
    }

    get disabled() {
        return this.element.disabled;
    }
}

/**
 * One selectable row. The list only ever reads these properties, so another kind of source (say, one fed by a
 * server) can hand out entries of the same shape.
 *
 * Dividers are not entries. An entry just remembers whether a divider sits directly before it (`dividerBefore`).
 */
export class OptionEntry {
    group = null;
    dividerBefore = false;

    constructor(option) {
        this.option = option;
    }

    get value() {
        return this.option.value;
    }

    get label() {
        return this.option.textContent.trim();
    }

    get subtext() {
        return (this.option.dataset.subtext ?? "").trim();
    }

    get title() {
        return this.option.title;
    }

    /** Disabled on its own, not through its group. */
    get ownDisabled() {
        return this.option.disabled;
    }

    get disabled() {
        return this.option.disabled || (this.group?.disabled ?? false);
    }
}

/**
 * The entries matching a search. Matching is lazy: `pull()` scans only as far as it is asked to, so a long list is
 * never searched in one go, and a view that is no longer wanted is simply dropped.
 *
 * An entry matches when its label or subtext contains the query, or when its option group's label does (which
 * includes the whole group). A divider is kept only between two matches, so one that sits between entries that were
 * filtered out is carried forward to the next match, and there is never one before the first match.
 */
export class FilteredView {
    #entries;
    #query;
    #index = 0;
    #matchCount = 0;
    #dividerPending = false;
    #dividers = new Set();   // matches that have a divider before them
    #groupMatches = new Map();

    constructor(entries, query) {
        this.#entries = entries;
        this.#query = query;
    }

    get query() {
        return this.#query;
    }

    /** Whether part of the list has not been scanned yet. */
    get hasMore() {
        return this.#index < this.#entries.length;
    }

    /**
     * Scans on and returns the next matches: at most `count` of them, stopping early once `budget` milliseconds
     * are spent. Check `hasMore` to see whether the scan has finished.
     */
    pull(count = Infinity, budget = Infinity) {
        const found = [];
        const deadline = performance.now() + budget;

        for (let scanned = 1; this.hasMore && found.length < count; scanned++) {
            const entry = this.#entries[this.#index++];
            if (entry.dividerBefore) this.#dividerPending = true;

            if (this.includes(entry)) {
                if (this.#dividerPending && this.#matchCount) this.#dividers.add(entry);
                this.#dividerPending = false;
                this.#matchCount++;
                found.push(entry);
            }

            // The clock is only read now and then, since reading it is not free.
            if (scanned % 256 === 0 && performance.now() > deadline) break;
        }

        return found;
    }

    /** Whether the entry matches. Does not depend on how far the scan has got. */
    includes(entry) {
        return !this.#query || this.textMatches(entry) || this.groupMatches(entry.group);
    }

    /** Whether the entry's own label or subtext contains the query. */
    textMatches(entry) {
        return Boolean(this.#query) &&
            (entry.label.toLowerCase().includes(this.#query) || entry.subtext.toLowerCase().includes(this.#query));
    }

    /** Whether the label of the entry's option group contains the query. */
    groupMatches(group) {
        if (!group || !this.#query) return false;

        let matches = this.#groupMatches.get(group);
        if (matches === undefined)
            this.#groupMatches.set(group, matches = group.label.toLowerCase().trim().includes(this.#query));

        return matches;
    }

    /** Whether a divider is shown right before this match. Only known for matches already pulled. */
    hasDividerBefore(entry) {
        return this.#dividers.has(entry);
    }
}

/**
 * The entries of a picker, read from the children of a native <select>, plus the selection API.
 */
export default class OptionSource {
    #select;
    #entries = [];
    #entriesByOption = new WeakMap();
    #groupsByElement = new WeakMap();
    #observer;

    constructor(select) {
        this.#select = select;
        this.rebuild();
    }

    /** The selectable entries, in list order. Hidden options are left out. */
    get entries() {
        return this.#entries;
    }

    get multiple() {
        return this.#select.multiple;
    }

    get required() {
        return this.#select.required;
    }

    /** Whether "select all" makes sense for this source. */
    get canSelectAll() {
        return true;
    }

    get firstSelected() {
        return this.#entriesByOption.get(this.#select.selectedOptions[0]);
    }

    /**
     * Reads the select's children again. Entries of options that are still there keep their identity.
     * Returns true when the list would look different.
     */
    rebuild() {
        const previous = this.#entries;
        const entries = [];
        let changed = false;
        let dividerPending = false;

        const add = (option, group) => {
            let entry = this.#entriesByOption.get(option);
            if (!entry) this.#entriesByOption.set(option, entry = new OptionEntry(option));

            if (entry.group !== group || entry.dividerBefore !== dividerPending)
                changed = true;

            entry.group = group;
            entry.dividerBefore = dividerPending;
            dividerPending = false;

            entries.push(entry);
        };

        for (const child of this.#select.children) {
            if (child.hidden) continue;

            if (child instanceof HTMLOptionElement) {
                add(child, null);
            } else if (child instanceof HTMLOptGroupElement) {
                let group = this.#groupsByElement.get(child);
                if (!group) this.#groupsByElement.set(child, group = new OptionGroup(child));

                for (const option of child.children) {
                    if (option.hidden) continue;

                    add(option, group);
                }

                // An option group followed directly by a plain option gets a divider.
                if (child.nextElementSibling instanceof HTMLOptionElement)
                    dividerPending = true;
            } else if (child instanceof HTMLHRElement) {
                dividerPending = true;
            }
        }

        if (entries.length !== previous.length || entries.some((entry, i) => entry !== previous[i]))
            changed = true;

        this.#entries = entries;
        return changed;
    }

    /**
     * The entries matching a search, found lazily. The query is trimmed and lowercase; an empty one matches all.
     */
    filter(query) {
        return new FilteredView(this.#entries, query);
    }

    /** Calls back, debounced, after the select's options change in a way that affects the list. */
    observe(callback) {
        this.#observer?.disconnect();

        let timeout;
        this.#observer = new MutationObserver(() => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                if (this.rebuild()) callback();
            }, 100);
        });
        this.#observer.observe(this.#select, { childList: true, subtree: true });
    }

    disconnect() {
        this.#observer?.disconnect();
        this.#observer = null;
    }

    // -----------------------------------------------------------------
    // Selection
    // -----------------------------------------------------------------

    isSelected(entry) {
        return entry.option.selected;
    }

    setSelected(entry, selected) {
        entry.option.selected = selected;
    }

    /** Makes the entry the only selected one. */
    selectOnly(entry) {
        this.#select.selectedIndex = -1;
        entry.option.selected = true;
    }

    clear() {
        this.#select.value = "";
    }

    setValue(value) {
        this.#select.value = value;
    }
}