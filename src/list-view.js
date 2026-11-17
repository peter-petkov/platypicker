"use strict";

// Emoji, plus the characters that glue them together: skin tones, flags, joiners, variation selectors, keycaps, tags.
const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u200d\ufe0f\u20e3\u{e0020}-\u{e007f}]/gu;

/** The text type-ahead matches against: lowercase, with emoji removed so "🧀 Cheese" is found by typing "ch". */
function typeAheadText(label) {
    return label.replace(EMOJI, "").replace(/\s+/g, " ").trim().toLowerCase();
}

// Rows are rendered in batches of the configured size, and a batch size of 0 turns batching off. With batching off the
// list streams in steps of STREAM_CHUNK_SIZE rows instead. A scan step takes at most SCAN_BUDGET milliseconds.
const DEFAULT_BATCH_SIZE = 50;
const STREAM_CHUNK_SIZE = 100;
const SCAN_BUDGET = 8;

/** Lets the browser handle input and paint before the next step. */
const yieldToMain = () => globalThis.scheduler?.yield?.() ?? new Promise(resolve => setTimeout(resolve));

/**
 * The popover: a search box with select all / none buttons, and the list of entries.
 *
 * It renders what an OptionSource holds, a batch at a time, and reports what the user does through the `actions` it
 * is given (activate, selectAll, selectNone, close). It never touches the select itself.
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
    #view = null;                       // The FilteredView being shown.
    #sentinelObserver;                  // Loads the next batch when the end of the list comes near.
    #lastGroup = null;                  // The option group of the last row rendered.
    #rows = [];                         // The rendered records, in list order.
    #recordsByEntry = new WeakMap();    // Only the entries rendered right now.
    #recordsByButton = new WeakMap();
    #tail = [];                         // The <li>s after the last row, present while more rows are to come.
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
        this.#sentinelObserver?.disconnect();
        this.#popover.remove();
        this.#view = null;
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
     * placeholders, batchSize }. Safe to call again whenever any of them changes. A new batch size is used for the
     * batches that come after, and the rows already rendered stay.
     */
    configure(config) {
        const placeholdersChanged = config.placeholders !== this.#config.placeholders;
        this.#config = config;

        this.#search.classList.toggle("d-none", !config.search);
        this.#search.placeholder = config.searchPlaceholder;
        this.#selectAllButton.textContent = config.selectAllLabel;
        this.#selectNoneButton.textContent = config.selectNoneLabel;
        this.syncControls();

        if (placeholdersChanged) this.#syncTail(true);
    }

    /**
     * Shows or hides select all / none. Also depends on the select (multiple, required),
     * so it is inexpensive to repeat.
     */
    syncControls() {
        const controls = Boolean(this.#config.controls);

        this.#selectAllButton.disabled = this.#selectNoneButton.disabled = !controls;
        this.#selectAllButton.classList.toggle("d-none",
            !controls || !this.#source.multiple || !this.#source.canSelectAll);
        this.#selectNoneButton.classList.toggle("d-none", !controls || this.#source.required);
    }

    get #isBatched() {
        return (this.#config.batchSize ?? DEFAULT_BATCH_SIZE) > 0;
    }

    /** How many rows the next step renders. */
    get #stepSize() {
        return this.#config.batchSize || (this.#config.batchSize === 0 ? STREAM_CHUNK_SIZE : DEFAULT_BATCH_SIZE);
    }

    // -----------------------------------------------------------------
    // Rendering
    // -----------------------------------------------------------------

    /**
     * Renders the matches of the current search from scratch. As many rows as were rendered before are brought
     * back, so a change to the options doesn't throw the list back to the top.
     */
    render() {
        this.#showMatches(this.#query(), this.#rows.length);
    }

    /** Shows the entries matching a search, starting again from the first batch. An empty search shows them all. */
    filter(rawValue) {
        this.#showMatches(rawValue.trim().toLowerCase());
        this.#popover.scrollTop = 0;
    }

    /**
     * The first batch is rendered right away. With batching on, the next ones follow as the end of the list comes
     * near. With batching off, the rest streams in step by step. Either way a newer search replaces the one
     * being shown.
     */
    #showMatches(query, keep = 0) {
        const view = this.#view = this.#source.filter(query);

        this.#sentinelObserver?.disconnect();
        this.#highlighter.clear();
        this.#lastGroup = null;
        this.#rows = [];
        this.#recordsByEntry = new WeakMap();
        this.#list.replaceChildren();
        this.#tail = [];

        this.#renderMore(this.#stepSize);
        while (this.#rows.length < keep && view.hasMore) this.#renderMore(this.#stepSize, Infinity);

        if (!this.#isBatched) {
            // noinspection JSIgnoredPromiseFromCall, The stream manages its own lifetime and doesn't need to be awaited.
            this.#stream(view);
        }
    }

    async #stream(view) {
        this.#list.setAttribute("aria-busy", view.hasMore);

        try {
            while (view.hasMore) {
                await yieldToMain();
                if (this.#view !== view || this.#signal.aborted) return;

                this.#renderMore(this.#stepSize);
            }
        } finally {
            if (this.#view === view) this.#list.setAttribute("aria-busy", false);
        }
    }

    /** Renders the next `count` matches, or fewer if the scan runs out of time or of entries. */
    #renderMore(count, budget = SCAN_BUDGET) {
        this.#appendRows(this.#view, this.#view.pull(count, budget));
        this.#syncTail();
    }

    /**
     * Makes sure the entry has a row, rendering up to it if need be. Returns false when the entry doesn't
     * match the current search.
     */
    ensureRendered(entry) {
        const view = this.#view;
        if (!view?.includes(entry)) return false;

        while (!this.#recordsByEntry.has(entry) && view.hasMore) this.#renderMore(this.#stepSize, Infinity);

        return this.#recordsByEntry.has(entry);
    }

    #appendRows(view, entries) {
        if (!entries.length) return;

        const fragment = document.createDocumentFragment();
        const records = [];
        const matchingHeaders = [];

        for (const entry of entries) {
            if (view.hasDividerBefore(entry)) {
                const divider = document.createElement("hr");
                divider.classList.add("dropdown-divider");
                fragment.append(this.#wrapInListItem(divider));
            }

            if (entry.group !== this.#lastGroup) {
                this.#lastGroup = entry.group;

                if (entry.group) {
                    const header = document.createElement("h6");
                    header.classList.add("dropdown-header");
                    header.textContent = entry.group.label;
                    fragment.append(this.#wrapInListItem(header));

                    if (view.groupMatches(entry.group) && !view.textMatches(entry)) matchingHeaders.push(header);
                }
            }

            const record = this.#createRecord(entry);
            records.push(record);
            fragment.append(this.#wrapInListItem(record.button));
        }

        this.#rows.push(...records);
        this.#list.insertBefore(fragment, this.#tail[0] ?? null);

        // Ranges are made once the rows are in the document: moving a node collapses the ranges inside it.
        if (!view.query) return;

        for (const header of matchingHeaders) {
            if (this.#highlighter.isFull) break;
            this.#highlighter.apply(header, "text", header.firstChild, view.query);
        }

        for (const record of records)
            if (view.textMatches(record.entry)) this.#highlightMatch(record, view.query);
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

    /**
     * The tail marks the end of the list while more rows are to come: the skeleton rows if there are any
     * configured, otherwise a single empty item. With batching on, the browser tells us when it comes near the
     * visible part of the list, and that is when the next batch is rendered.
     */
    #syncTail(rebuild = false) {
        const wanted = Boolean(this.#view?.hasMore);

        if (this.#tail.length && (!wanted || rebuild)) {
            this.#sentinelObserver?.disconnect();
            for (const li of this.#tail) li.remove();
            this.#tail = [];
        }

        if (!wanted) return;

        if (!this.#tail.length) this.#createTail();
        if (this.#isBatched) this.#watchTail();
    }

    #createTail() {
        const count = this.#config.placeholders ?? 0;

        if (!count) {
            const li = document.createElement("li");
            li.setAttribute("aria-hidden", "true");
            this.#list.append(li);
            this.#tail.push(li);
            return;
        }

        for (let i = 0; i < count; i++) {
            const wave = document.createElement("div");
            wave.classList.add("placeholder-wave", "w-100");

            const bar = document.createElement("span");
            bar.classList.add("placeholder", "col-12", "rounded-pill");
            wave.append(bar);

            const button = document.createElement("button");
            button.type = "button";
            button.classList.add("dropdown-item", "rounded-2");
            button.disabled = true;
            button.append(wave);

            const li = this.#wrapInListItem(button);
            this.#list.append(li);
            this.#tail.push(li);
        }
    }

    #watchTail() {
        this.#sentinelObserver ??= new IntersectionObserver(entries => {
            if (this.#view?.hasMore && entries.some(entry => entry.isIntersecting)) this.#renderMore(this.#stepSize);
        }, { root: this.#popover, rootMargin: "0px 0px 100% 0px" }); // Starts a batch a popover's height early.

        // Observing again makes the browser report where the tail is now, so a batch that still leaves it
        // near the visible part is followed by the next one.
        this.#sentinelObserver.disconnect();
        this.#sentinelObserver.observe(this.#tail[0]);
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
    // Highlighting
    // -----------------------------------------------------------------

    #query() {
        return this.#search.value.trim().toLowerCase();
    }

    #highlightMatch(record, query) {
        if (this.#highlighter.isFull) return;

        const { entry, button, text, small } = record;
        this.#highlighter.apply(button, "text", text, query);

        const subtext = entry.subtext.toLowerCase();
        if (subtext && subtext !== entry.label.toLowerCase())
            this.#highlighter.apply(button, "subtext", small.firstChild, query);
    }

    // -----------------------------------------------------------------
    // Focus and scrolling
    // -----------------------------------------------------------------

    /** Whether the entry matches the current search. It may not have been rendered yet. */
    isVisible(entry) {
        return this.#view?.includes(entry) ?? true;
    }

    isSelectable(entry) {
        return !entry.disabled && this.isVisible(entry);
    }

    /**
     * Called when the popover opens. The selected item is rendered if it wasn't yet and brought into view. Focus
     * goes to the search box when there is one, otherwise to the selected item, otherwise to the first item.
     */
    focusInitial() {
        const selected = this.#source.firstSelected;
        const selectedButton = selected && this.ensureRendered(selected) ? this.#recordsByEntry.get(selected).button : null;
        selectedButton?.scrollIntoView({ block: "center" });

        if (!this.#search.classList.contains("d-none")) {
            this.#search.focus({ preventScroll: true });
            return;
        }

        const target = selectedButton && !selectedButton.disabled
            ? selectedButton
            : this.#popover.querySelector(".dropdown-item:not(.disabled, :disabled)");
        target?.focus({ preventScroll: target === selectedButton });
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

            if (match && this.ensureRendered(match)) {
                this.#recordsByEntry.get(match).button.focus();

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
        // Same elements, in the same order, that Tab would visit inside the popover.
        const focusableElements = () => [...this.#popover.querySelectorAll(
            "input:not(.d-none), .input-group button:not(.d-none, :disabled), li > .dropdown-item:not(.disabled, :disabled)")];

        this.#popover.addEventListener("keydown", e => {
            if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;

            const step = { ArrowDown: 1, ArrowUp: -1 }[e.code];
            if (!step) return;

            let focusable = focusableElements();
            if (!focusable.length) return;

            e.preventDefault();

            // On the last rendered item the next batch comes first, so the key never stalls at the end of a longer list.
            if (step > 0 && e.target === focusable.at(-1) && this.#view?.hasMore) {
                this.#renderMore(this.#stepSize, Infinity);
                focusable = focusableElements();
            }

            const index = focusable.indexOf(e.target);
            focusable[Math.min(Math.max(index + step, 0), focusable.length - 1)].focus();
        }, { signal: this.#signal });
    }
}