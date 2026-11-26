"use strict";

import FilteredView, { SearchCache } from "burrowkit/filtered-view.js";

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

    /** The text shown before the label (data-icon), such as an emoji, or "". */
    get icon() {
        return (this.option.dataset.icon ?? "").trim();
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
 * The entries of a picker, read from the children of a native <select>, plus the selection API.
 */
export default class OptionSource {
    #select;
    #entries = [];
    #entriesByOption = new WeakMap();
    #groupsByElement = new WeakMap();
    #observer;
    // Folded and prepared texts, kept to a few times the number of entries.
    #cache = new SearchCache(() => 4 * this.#entries.length + 100);

    // What search matches an entry by, the strongest first: its label, its subtext and its icon (an emoji, found by
    // typing it). Its option group's label is matched too, by the view.
    static #texts = entry => [entry.label, entry.subtext, entry.icon];

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
     * Search.fold); an empty one matches all. Strong matches come first unless `tiered` is false (see
     * FilteredView).
     */
    filter(query, locale = "", tiered = true) {
        return new FilteredView(this.#entries, query, {
            fold: text => this.fold(text, locale),
            prepare: text => this.prepare(text, locale),
            texts: OptionSource.#texts,
            tiered,
        });
    }

    /** Folds a text (see Search.fold), remembering it, so a search or type-ahead doesn't fold every label again. */
    fold(text, locale = "") {
        return this.#cache.fold(text, locale);
    }

    /** Makes a text ready for Search.match (see Search.prepare), remembering it as fold() does. */
    prepare(text, locale = "") {
        return this.#cache.prepare(text, locale);
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
            attributeFilter: ["disabled", "hidden", "label", "title", "data-subtext", "data-image", "data-icon"],
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