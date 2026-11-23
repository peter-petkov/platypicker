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

    /** The URL of the picture before the label (data-image), or "". */
    get image() {
        return (this.option.dataset.image ?? "").trim();
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
 * An entry matches when the query matches its label or subtext, or its option group's label (which includes the
 * whole group), as Languages.match matches: by its letters in order, the first starting a word, or as a whole. Both
 * sides are compared folded (see Languages.fold), so case and accents don't matter.
 *
 * Tiered, strong matches come first, those where every matched piece starts a word, then the weak ones, each in
 * list order: the list is scanned twice, the second time for the weak matches. An option group moves as a whole,
 * with the tier of its best match, so its matches stay together under one header. A divider is kept only between
 * two matches of the same tier, so one that sits between entries that were filtered out is carried forward to the
 * next match, and there is never one before the first match of a tier. A list longer than #tierLimit keeps list
 * order.
 */
export class FilteredView {
    static #none = 1;
    static #weak = 2;
    static #strong = 3;

    // The longest list put in tiers. The first weak match waits for the strong scan to cover the whole list, which
    // takes about 170ms at this size; longer lists keep list order, so their first matches show right away.
    static #tierLimit = 50000;

    #entries;
    #query;
    #tiered;
    #index = 0;
    #tier = FilteredView.#strong;   // the tier being scanned for
    #matchCount = 0;
    #tierCount = 0;                 // matches pulled in the tier being scanned for
    #count;                         // All the matches, once count() has counted them.
    #dividerPending = false;
    #dividers = new Set();          // matches that have a divider before them
    #tiers = new Map();             // entry -> how its own label or subtext matches
    #groupTiers = new Map();        // group -> how its label matches
    #blockTiers = new Map();        // group -> the tier the group goes in: that of its best match

    #fold;
    #prepare;

    /**
     * `query` is folded already; `fold` folds a text the same way, and `prepare` makes it ready for Languages.match.
     * Without `tiered`, the matches come in list order.
     */
    constructor(entries, query, fold, prepare, tiered = true) {
        this.#entries = entries;
        this.#query = query;
        this.#fold = fold;
        this.#prepare = prepare;
        this.#tiered = tiered && Boolean(query) && entries.length <= FilteredView.#tierLimit;
        if (!this.#tiered) this.#tier = FilteredView.#weak;
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
        return this.#index < this.#entries.length || this.#tier === FilteredView.#strong;
    }

    /**
     * Scans on and returns the next matches: at most `count` of them, stopping early once `budget` milliseconds
     * are spent. Check `hasMore` to see whether the scan has finished.
     */
    pull(count = Infinity, budget = Infinity) {
        const found = [];
        const deadline = performance.now() + budget;

        for (let scanned = 1; this.hasMore && found.length < count; scanned++) {
            // Done with the strong matches: the weak ones, from the top.
            if (this.#index === this.#entries.length) {
                this.#tier = FilteredView.#weak;
                this.#index = this.#tierCount = 0;
                this.#dividerPending = false;
                continue;
            }

            const entry = this.#entries[this.#index++];
            if (entry.dividerBefore) this.#dividerPending = true;

            if (this.includes(entry) && this.#placeOf(entry) === this.#tier) {
                if (this.#dividerPending && this.#tierCount) this.#dividers.add(entry);
                this.#dividerPending = false;
                this.#matchCount++;
                this.#tierCount++;
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

    /** Whether the query matches the entry's own label or subtext. */
    textMatches(entry) {
        return Boolean(this.#query) && this.#tierOf(entry) !== FilteredView.#none;
    }

    /** Where the query matches a text, as { start, end } pieces of it (see Languages.match), or null. */
    locate(text) {
        return Languages.match(this.#prepare(text), this.#query)?.parts ?? null;
    }

    /** Whether the query matches the label of the entry's option group. */
    groupMatches(group) {
        return Boolean(group && this.#query) && this.#groupTierOf(group) !== FilteredView.#none;
    }

    // The tier a match goes in: that of the group it's in, or its own. Untiered, all go in the weak one.
    #placeOf(entry) {
        if (!this.#tiered) return FilteredView.#weak;
        if (!entry.group) return this.#tierOf(entry);

        let tier = this.#blockTiers.get(entry.group);
        if (tier === undefined) {
            // A group's options sit together in the list, and the strong scan meets the first of them first.
            tier = FilteredView.#none;
            for (let i = this.#index - 1; i < this.#entries.length && this.#entries[i].group === entry.group; i++)
                tier = Math.max(tier, this.#tierOf(this.#entries[i]));

            this.#blockTiers.set(entry.group, tier = Math.max(tier, this.#groupTierOf(entry.group)));
        }
        return tier;
    }

    // How the query matches an entry's own label or subtext.
    #tierOf(entry) {
        let tier = this.#tiers.get(entry);
        if (tier === undefined) {
            tier = this.#match(entry.label);
            if (tier !== FilteredView.#strong) tier = Math.max(tier, this.#match(entry.subtext));
            this.#tiers.set(entry, tier);
        }
        return tier;
    }

    #groupTierOf(group) {
        if (!group) return FilteredView.#none;

        let tier = this.#groupTiers.get(group);
        if (tier === undefined) this.#groupTiers.set(group, tier = this.#match(group.label.trim()));
        return tier;
    }

    // The cheap test on the folded text first, since most texts fail it and preparing a text costs more.
    #match(text) {
        if (!text || !Languages.mayMatch(this.#fold(text), this.#query)) return FilteredView.#none;

        const match = Languages.match(this.#prepare(text), this.#query);
        return !match ? FilteredView.#none : match.strong ? FilteredView.#strong : FilteredView.#weak;
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
    #prepared = new Map();  // text -> its form for Languages.match, for #foldedLocale
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
     * How many options are selected, leaving out disabled ones, which the form doesn't send and the user can't change.
     * Takes a moment on a long select.
     */
    get selectedCount() {
        let count = 0;
        for (const option of this.#select.selectedOptions) if (!option.matches(":disabled")) count++;
        return count;
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
     * Languages.fold); an empty one matches all. Strong matches come first unless `tiered` is false (see
     * FilteredView).
     */
    filter(query, locale = "", tiered = true) {
        return new FilteredView(this.#entries, query, text => this.fold(text, locale),
            text => this.prepare(text, locale), tiered);
    }

    /**
     * Folds a text (see Languages.fold), remembering it, so a search or type-ahead doesn't fold every label again on
     * every key. The memory is by text, so a changed option simply misses it, and it starts over when the language
     * changes or it grows past the number of texts the list can have.
     */
    fold(text, locale = "") {
        return this.#remember(this.#folded, text, locale, Languages.fold);
    }

    /** Makes a text ready for Languages.match (see Languages.prepare), remembering it as fold() does. */
    prepare(text, locale = "") {
        return this.#remember(this.#prepared, text, locale, Languages.prepare);
    }

    #remember(memory, text, locale, make) {
        if (locale !== this.#foldedLocale) {
            this.#folded.clear();
            this.#prepared.clear();
            this.#foldedLocale = locale;
        }
        if (memory.size > 4 * this.#entries.length + 100) memory.clear();

        let made = memory.get(text);
        if (made === undefined) memory.set(text, made = make(text, locale));
        return made;
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
            attributeFilter: ["disabled", "hidden", "label", "title", "data-subtext", "data-image"],
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

    /** Makes the entry the only selected one. A multiple select is cleared the fast way first (see clear()). */
    selectOnly(entry) {
        if (this.#select.multiple) this.clear();
        else this.#select.selectedIndex = -1;
        entry.option.selected = true;
    }

    /**
     * Deselects everything. A multiple select is cleared with selectedIndex = -1, which needs no value comparisons:
     * assigning value = "" compares every option's value, and it would select an option whose value happens to be
     * empty. Even so, Firefox takes about a second to clear 25,000 selected options of a multiple select, one at a
     * time, but clears them in one go when the select stops being multiple. So it isn't multiple for that moment,
     * which costs Chrome next to nothing; no event fires and nothing is drawn in between. A single select keeps
     * value = "", so an option with an empty value still works as its placeholder.
     */
    clear() {
        const select = this.#select;

        this.#changeInBulk(() => {
            if (!select.multiple) {
                select.value = "";
                return;
            }

            select.multiple = false;
            select.selectedIndex = -1;
            select.multiple = true;
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