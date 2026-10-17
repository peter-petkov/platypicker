"use strict";

// Emoji, plus the characters that glue them together: skin tones, flags, joiners, variation selectors, keycaps, tags.
const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u200d\ufe0f\u20e3\u{e0020}-\u{e007f}]/gu;

/** The text type-ahead matches against: lowercase, with emoji removed so "🧀 Cheese" is found by typing "ch". */
function typeAheadText(label) {
    return label.replace(EMOJI, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * The popover: a search box with select all / none buttons, and the list of entries.
 *
 * It renders what an OptionSource holds and reports what the user does through the `actions` it is given
 * (activate, selectAll, selectNone, close). It never touches the select itself.
 */
export default class ListView {
    #source;
    #highlighter;
    #actions;
    #signal;

    #popover;
    #search;
    #selectAllButton;
    #selectNoneButton;
    #list;

    #config = {};
    #rows = [];                         // The rendered records, in list order.
    #recordsByEntry = new WeakMap();
    #recordsByButton = new WeakMap();
    #headers = new Map();               // group -> its header element
    #groupDividers = new Map();         // group -> the divider that closes it
    #tail = [];                         // The placeholder <li>s after the last entry.
    #typeAheadBuffer = "";
    #typeAheadTimer;

    constructor({ select, source, highlighter, actions, signal }) {
        this.#source = source;
        this.#highlighter = highlighter;
        this.#actions = actions;
        this.#signal = signal;

        this.#buildPopover(select);
        this.#buildControls();
        this.#wireList();
        this.#wireKeyboardTypeAhead();
        this.#wireKeyboardNavigation();
    }

    get popover() {
        return this.#popover;
    }

    destroy() {
        clearTimeout(this.#typeAheadTimer);
        this.#popover.remove();
        this.#rows = [];
        this.#tail = [];
    }

    // -----------------------------------------------------------------
    // Construction
    // -----------------------------------------------------------------

    #buildPopover(select) {
        this.#popover = document.createElement("div");
        this.#popover.classList.add("dropdown-menu", "rounded-3", "shadow", "p-0");
        this.#popover.popover = "manual";
        select.insertAdjacentElement("afterend", this.#popover);

        this.#list = document.createElement("ul");
        this.#list.classList.add("list-unstyled", "d-grid", "gap-1", "p-2", "mb-0");
    }

    #buildControls() {
        const signal = this.#signal;

        const form = document.createElement("form");
        form.classList.add("input-group", "p-2", "bg-body-tertiary", "border-bottom", "sticky-top");
        form.addEventListener("submit", e => e.preventDefault(), { signal });
        this.#popover.append(form);

        this.#search = document.createElement("input");
        this.#search.type = "search";
        this.#search.name = "platypicker-search";
        this.#search.autofocus = true;
        this.#search.classList.add("form-control", "form-control-sm");
        this.#search.addEventListener("input", () => this.filter(this.#search.value), { signal });
        this.#search.addEventListener("keydown", e => {
            if (e.code === "Escape") this.#actions.close();
        }, { signal });
        form.append(this.#search);

        this.#selectAllButton = this.#buildActionButton(() => this.#actions.selectAll());
        form.append(this.#selectAllButton);

        this.#selectNoneButton = this.#buildActionButton(() => this.#actions.selectNone());
        form.append(this.#selectNoneButton);

        this.#popover.append(this.#list);
    }

    #buildActionButton(onClick) {
        const button = document.createElement("button");
        button.type = "button";
        button.classList.add("btn", "btn-outline-secondary", "btn-sm");
        button.addEventListener("click", onClick, { signal: this.#signal });
        return button;
    }

    #wireList() {
        // One listener for the whole list, instead of one per item.
        this.#list.addEventListener("click", e => {
            const button = e.target.closest(".dropdown-item");
            const record = button && this.#recordsByButton.get(button);
            if (!record || button.disabled) return;

            this.#actions.activate(record.entry);
        }, { signal: this.#signal });
    }

    // -----------------------------------------------------------------
    // Configuration (from the element's attributes)
    // -----------------------------------------------------------------

    /**
     * Applies the element's settings: { search, controls, searchPlaceholder, selectAllLabel, selectNoneLabel,
     * placeholders }. Safe to call again whenever any of them changes.
     */
    configure(config) {
        const placeholdersChanged = config.placeholders !== this.#config.placeholders;
        this.#config = config;

        this.#search.classList.toggle("d-none", !config.search);
        this.#search.placeholder = config.searchPlaceholder;
        this.#selectAllButton.textContent = config.selectAllLabel;
        this.#selectNoneButton.textContent = config.selectNoneLabel;
        this.syncControls();

        if (placeholdersChanged) this.#renderTail();
    }

    /** Shows or hides select all / none. Also depends on the select (multiple, required), so it is cheap to repeat. */
    syncControls() {
        const controls = Boolean(this.#config.controls);

        this.#selectAllButton.disabled = this.#selectNoneButton.disabled = !controls;
        this.#selectAllButton.classList.toggle("d-none",
            !controls || !this.#source.multiple || !this.#source.canSelectAll);
        this.#selectNoneButton.classList.toggle("d-none", !controls || this.#source.required);
    }

    // -----------------------------------------------------------------
    // Rendering
    // -----------------------------------------------------------------

    /** Renders the source's entries from scratch. */
    render() {
        this.#highlighter.clear();
        this.#headers.clear();
        this.#groupDividers.clear();

        const fragment = document.createDocumentFragment();
        const rows = [];
        let group = null;

        for (const entry of this.#source.entries) {
            // Never a divider at the very top, and a run of dividers is one divider.
            if (entry.dividerBefore && rows.length) {
                const divider = document.createElement("hr");
                divider.classList.add("dropdown-divider");
                fragment.append(this.#wrapInListItem(divider));

                if (entry.dividerGroup) this.#groupDividers.set(entry.dividerGroup, divider);
            }

            if (entry.group !== group) {
                group = entry.group;

                if (group) {
                    const header = document.createElement("h6");
                    header.classList.add("dropdown-header");
                    header.textContent = group.label;
                    fragment.append(this.#wrapInListItem(header));

                    this.#headers.set(group, header);
                }
            }

            const record = this.#createRecord(entry);
            rows.push(record);
            fragment.append(this.#wrapInListItem(record.button));
        }

        this.#rows = rows;
        this.#list.replaceChildren(fragment);
        this.#tail = [];
        this.#renderTail();

        if (this.#query()) this.filter(this.#search.value);
    }

    #createRecord(entry) {
        const button = document.createElement("button");
        button.type = "button";
        button.classList.add("dropdown-item", "rounded-2");
        if (entry.title) button.title = entry.title;
        if (this.#source.isSelected(entry) && !entry.ownDisabled) button.classList.add("active");
        if (entry.disabled) {
            button.classList.add("disabled");
            button.disabled = true; // Takes the item out of the Tab order.
        }

        const text = document.createTextNode(entry.label);

        const small = document.createElement("small");
        small.classList.add("text-body-tertiary");
        small.textContent = entry.subtext;

        button.append(text, small);

        const record = { entry, button, text, small };
        this.#recordsByEntry.set(entry, record);
        this.#recordsByButton.set(button, record);

        return record;
    }

    #wrapInListItem(element) {
        const li = document.createElement("li");
        li.append(element);
        return li;
    }

    /** The skeleton rows after the last entry. They are derived from the settings, so a re-render keeps them. */
    #renderTail() {
        for (const li of this.#tail) li.remove();
        this.#tail = [];

        const hidden = Boolean(this.#query());

        for (let i = 0; i < (this.#config.placeholders ?? 0); i++) {
            const wave = document.createElement("div");
            wave.classList.add("placeholder-wave", "w-100");

            const bar = document.createElement("span");
            bar.classList.add("placeholder", "col-12", "rounded-pill");
            wave.append(bar);

            const button = document.createElement("button");
            button.type = "button";
            button.classList.add("dropdown-item", "rounded-2");
            button.classList.toggle("d-none", hidden);
            button.disabled = true;
            button.append(wave);

            const li = this.#wrapInListItem(button);
            this.#list.append(li);
            this.#tail.push(li);
        }
    }

    /** Brings the rows up to date with the select: label and subtext changes, and which entries are selected. */
    refresh() {
        const query = this.#query();

        for (const record of this.#rows) {
            const { entry, button, text, small } = record;
            let changed = false;

            if (text.data !== entry.label) {
                text.data = entry.label;
                changed = true;
            }

            if (small.textContent !== entry.subtext) {
                small.textContent = entry.subtext;
                changed = true;
            }

            button.classList.toggle("active", this.#source.isSelected(entry));

            if (changed && query) this.#highlightMatch(record, query);
        }
    }

    // -----------------------------------------------------------------
    // Filtering (hides rows with .d-none) and highlighting
    // -----------------------------------------------------------------

    #query() {
        return this.#search.value.trim().toLowerCase();
    }

    filter(rawValue) {
        const query = rawValue.trim().toLowerCase();
        this.#highlighter.clear();

        if (!query) {
            for (const el of this.#list.querySelectorAll(".d-none")) el.classList.remove("d-none");
            return;
        }

        let group = null;
        let groupHasMatch = false;

        for (const record of this.#rows) {
            const { entry, button } = record;
            const text = entry.label.toLowerCase();
            const subtext = entry.subtext.toLowerCase();

            if (entry.group !== group) {
                group = entry.group;
                groupHasMatch = false;
            }

            const groupLabel = group?.label?.toLowerCase().trim() ?? "";
            const matches = text.includes(query) || subtext.includes(query);
            const groupMatches = groupLabel.includes(query);
            button.classList.toggle("d-none", !matches && !groupMatches);

            if (matches) {
                this.#highlightMatch(record, query);
                if (group) {
                    groupHasMatch = true;
                    this.#toggleGroup(group, true);
                }
            } else if (groupMatches && !groupHasMatch) {
                this.#highlightGroup(group, query);
                groupHasMatch = true;
                this.#toggleGroup(group, true);
            } else if (group && !groupHasMatch) {
                this.#toggleGroup(group, false);
            }
        }

        for (const li of this.#tail) li.firstElementChild.classList.add("d-none");
    }

    #toggleGroup(group, visible) {
        this.#headers.get(group)?.classList.toggle("d-none", !visible);
        this.#groupDividers.get(group)?.classList.toggle("d-none", !visible);
    }

    #highlightMatch(record, query) {
        if (this.#highlighter.isFull) return;

        const { entry, button, text, small } = record;
        this.#highlighter.apply(button, "text", text, query);

        const subtext = entry.subtext.toLowerCase();
        if (subtext && subtext !== entry.label.toLowerCase())
            this.#highlighter.apply(button, "subtext", small.firstChild, query);
    }

    #highlightGroup(group, query) {
        if (this.#highlighter.isFull) return;

        const header = this.#headers.get(group);
        if (header) this.#highlighter.apply(header, "text", header.firstChild, query);
    }

    // -----------------------------------------------------------------
    // Focus and scrolling
    // -----------------------------------------------------------------

    /** Whether the entry is currently shown, that is, not filtered out. */
    isVisible(entry) {
        return !this.#recordsByEntry.get(entry)?.button.classList.contains("d-none");
    }

    isSelectable(entry) {
        return !entry.disabled && this.isVisible(entry);
    }

    focusInitial() {
        this.#popover.querySelector("input:not(.d-none), .dropdown-item:not(.disabled, .d-none)")?.focus();
    }

    scrollIntoView(entry) {
        this.#recordsByEntry.get(entry)?.button.scrollIntoView({ block: "nearest" });
    }

    // -----------------------------------------------------------------
    // Keyboard type-ahead (mirrors native <select> "jump to option" behavior,
    // needed here because the real popover is hidden in favor of ours)
    // -----------------------------------------------------------------

    #wireKeyboardTypeAhead() {
        const signal = this.#signal;

        this.#popover.addEventListener("keydown", e => {
            if (this.#search.contains(e.target)) return;

            const char = e.key.toLowerCase();
            if (e.ctrlKey || e.altKey || e.metaKey || !/^[a-z0-9]$/.test(char)) return;

            this.#typeAheadBuffer += char;
            const match = this.#findTypeAheadMatch(this.#typeAheadBuffer);

            if (match) {
                this.#recordsByEntry.get(match)?.button.focus();

                requestAnimationFrame(() => this.scrollIntoView(match));

                clearTimeout(this.#typeAheadTimer);
                this.#typeAheadTimer = setTimeout(() => this.#typeAheadBuffer = "", 350);
            } else {
                this.#typeAheadBuffer = "";
            }
        }, { signal });

        this.#list.addEventListener("keydown", e => {
            if (e.code === "Escape") this.#actions.close();
        }, { capture: true, signal });
    }

    #findTypeAheadMatch(buffer) {
        const isCandidate = entry => this.isSelectable(entry) && typeAheadText(entry.label).startsWith(buffer);

        const current = this.#source.firstSelected;
        return this.#source.entries.find(entry => entry !== current && isCandidate(entry)) ??
            (current && isCandidate(current) ? current : undefined);
    }

    // -----------------------------------------------------------------
    // Arrow key navigation (moves focus only, exactly like Tab / Shift+Tab,
    // and never changes the selection)
    // -----------------------------------------------------------------

    #wireKeyboardNavigation() {
        this.#popover.addEventListener("keydown", e => {
            if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;

            const step = { ArrowDown: 1, ArrowUp: -1 }[e.code];
            if (!step) return;

            // Same elements, in the same order, that Tab would visit inside the popover.
            const focusable = [...this.#popover.querySelectorAll(
                "input:not(.d-none), .input-group button:not(.d-none, :disabled), li > .dropdown-item:not(.disabled, .d-none, :disabled)")];
            if (!focusable.length) return;

            e.preventDefault();

            const index = focusable.indexOf(e.target);
            focusable[Math.min(Math.max(index + step, 0), focusable.length - 1)].focus();
        }, { signal: this.#signal });
    }
}