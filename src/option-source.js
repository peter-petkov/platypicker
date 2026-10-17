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
 * Dividers are not entries. An entry just remembers whether a divider sits directly before it
 * (`dividerBefore`) and, for the automatic divider after an option group, which group that divider closes
 * (`dividerGroup`, otherwise null).
 */
export class OptionEntry {
    group = null;
    dividerBefore = false;
    dividerGroup = null;

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
     * Returns true when the list looks different.
     */
    rebuild() {
        const previous = this.#entries;
        const entries = [];
        let changed = false;
        let dividerPending = false;
        let dividerGroup = null;

        const add = (option, group) => {
            let entry = this.#entriesByOption.get(option);
            if (!entry) this.#entriesByOption.set(option, entry = new OptionEntry(option));

            if (entry.group !== group || entry.dividerBefore !== dividerPending || entry.dividerGroup !== dividerGroup)
                changed = true;

            entry.group = group;
            entry.dividerBefore = dividerPending;
            entry.dividerGroup = dividerGroup;
            dividerPending = false;
            dividerGroup = null;

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
                if (child.nextElementSibling instanceof HTMLOptionElement) {
                    dividerPending = true;
                    dividerGroup = group;
                }
            } else if (child instanceof HTMLHRElement) {
                dividerPending = true;
                dividerGroup = null;
            }
        }

        if (entries.length !== previous.length || entries.some((entry, i) => entry !== previous[i]))
            changed = true;

        this.#entries = entries;
        return changed;
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