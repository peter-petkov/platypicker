"use strict";

import Languages from "./languages.js";

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
 * includes the whole group). Both sides are compared folded (see Languages.fold), so case and accents don't matter. A divider is kept only between two matches, so one that sits between entries that were
 * filtered out is carried forward to the next match, and there is never one before the first match.
 */
export class FilteredView {
    #entries;
    #query;
    #index = 0;
    #matchCount = 0;
    #count;                  // All the matches, once count() has counted them.
    #dividerPending = false;
    #dividers = new Set();   // matches that have a divider before them
    #groupMatches = new Map();

    #fold;

    /** `query` is folded already; `fold` folds a text the same way. */
    constructor(entries, query, fold) {
        this.#entries = entries;
        this.#query = query;
        this.#fold = fold;
    }

    get query() {
        return this.#query;
    }

    /**
     * How many entries match: all of them without a search, otherwise -1 until the scan is done or count() has
     * counted them.
     */
    get size() {
        if (!this.#query) return this.#entries.length;
        return this.#count ?? (this.hasMore ? -1 : this.#matchCount);
    }

    /** Counts the matches in one go, without scanning on. */
    count() {
        if (!this.#query) return this.#entries.length;
        if (!this.hasMore) return this.#matchCount;

        this.#count ??= this.#entries.reduce((count, entry) => count + this.includes(entry), 0);
        return this.#count;
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
            (this.#fold(entry.label).includes(this.#query) || this.#fold(entry.subtext).includes(this.#query));
    }

    /** Whether the label of the entry's option group contains the query. */
    groupMatches(group) {
        if (!group || !this.#query) return false;

        let matches = this.#groupMatches.get(group);
        if (matches === undefined)
            this.#groupMatches.set(group, matches = this.#fold(group.label.trim()).includes(this.#query));

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
    #folded = new Map();    // text -> its folded form, for #foldedLocale
    #foldedLocale = null;

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
     * The entries matching a search, found lazily. The query is trimmed and folded for the locale (see
     * Languages.fold); an empty one matches all.
     */
    filter(query, locale = "") {
        return new FilteredView(this.#entries, query, text => this.fold(text, locale));
    }

    /**
     * Folds a text (see Languages.fold), remembering it, so a search or type-ahead doesn't fold every label again on
     * every key. The memory is by text, so a changed option simply misses it, and it starts over when the language
     * changes or it grows past the number of texts the list can have.
     */
    fold(text, locale = "") {
        if (locale !== this.#foldedLocale || this.#folded.size > 4 * this.#entries.length + 100) {
            this.#folded.clear();
            this.#foldedLocale = locale;
        }

        let folded = this.#folded.get(text);
        if (folded === undefined) this.#folded.set(text, folded = Languages.fold(text, locale));
        return folded;
    }

    /**
     * Calls back whenever the select's options change in a way that can show in the list: options or groups added,
     * removed or moved, their text changed, or one of the attributes below. The call says only that something
     * changed; rebuild() reads the new state. Several changes made in one go arrive as one call.
     */
    observe(callback) {
        this.#observer?.disconnect();

        this.#observer = new MutationObserver(() => callback());
        this.#observer.observe(this.#select, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["disabled", "hidden", "label", "title", "data-subtext"],
        });
    }

    /**
     * Whether the options changed in a way the observer has not reported yet. The observer reports after the current
     * task, so a change made just before a click would otherwise be missed by it.
     */
    takePendingChanges() {
        return (this.#observer?.takeRecords().length ?? 0) > 0;
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

    /** Selects all of the entries, keeping what is selected already. Fast even for a very long list. */
    select(entries) {
        this.#changeInBulk(() => {
            for (const entry of entries) entry.option.selected = true;
        });
    }

    /** Makes the entry the only selected one. */
    selectOnly(entry) {
        this.#select.selectedIndex = -1;
        entry.option.selected = true;
    }

    /**
     * Deselects everything. A multiple select is cleared with selectedIndex = -1, which needs no value comparisons:
     * assigning value = "" compares every option's value, which made select none on a long list slow in Firefox,
     * and it would select an option whose value happens to be empty. A single select keeps value = "", so an option
     * with an empty value still works as its placeholder.
     */
    clear() {
        this.#changeInBulk(() => {
            if (this.#select.multiple) this.#select.selectedIndex = -1;
            else this.#select.value = "";
        });
    }

    /**
     * A multiple select with size="1" is very slow at being changed option by option: Chrome needs about 14 seconds to
     * select 25,000 of them, and about 15 milliseconds when the size is 2 or more. So the size is raised while the
     * change is made and put back right after, before anything is drawn.
     */
    #changeInBulk(change) {
        const select = this.#select;
        const size = select.getAttribute("size");
        const raise = select.multiple && select.size === 1;

        if (raise) select.setAttribute("size", "2");

        try {
            change();
        } finally {
            if (raise) select.setAttribute("size", size);
        }
    }

    setValue(value) {
        this.#select.value = value;
    }
}