"use strict";

import { addClasses, toggleClasses } from "./classes.js";

/**
 * The popover: a search box with select all / none buttons, and the list of entries.
 *
 * It renders what an OptionSource holds, a batch at a time, and reports what the user does through the `actions` it
 * is given (activate, selectAll, selectNone, close, loadMore). It never touches the select itself.
 */
export default class ListView {
    // Rows are rendered in batches of the configured size, and a batch size of 0 turns batching off. With batching off
    // the list streams in steps of #streamChunkSize rows instead. A scan step takes at most #scanBudget milliseconds.
    static #defaultBatchSize = 50;
    static #streamChunkSize = 100;
    static #scanBudget = 8;

    // Emoji, plus the characters that glue them together: skin tones, flags, joiners, variation selectors, keycaps,
    // tags.
    static #emoji = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u200d\ufe0f\u20e3\u{e0020}-\u{e007f}]/gu;

    /** The text type-ahead matches against: lowercase, with emoji removed so "🧀 Cheese" is found by typing "ch". */
    static #typeAheadText(label) {
        return label.replace(ListView.#emoji, "").replace(/\s+/g, " ").trim().toLowerCase();
    }

    /** Lets the browser handle input and paint before the next step. */
    static #yieldToMain() {
        return globalThis.scheduler?.yield?.() ?? new Promise(resolve => setTimeout(resolve));
    }

    #source;
    #highlighter;
    #actions;
    #signal;

    #popover;
    #form;
    #search;
    #selectAllButton;
    #selectNoneButton;
    #busy = false;                      // Whether select all or select none is running.
    #list;

    #config = {};
    #view = null;                       // The FilteredView being shown.
    #sentinelObserver;                  // Loads the next batch when the end of the list comes near.
    #lastGroup = null;                  // The option group of the last row rendered.
    #rows = [];                         // The rendered records, in list order.
    #recordsByEntry = new WeakMap();    // Only the entries rendered right now.
    #headerItems = new Map();           // option group -> the <li> of its header, as rendered right now
    #dividerItems = new Map();          // entry -> the <li> of the divider rendered right before it
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
        addClasses(this.#popover, "menu");
        this.#popover.popover = "manual";
        select.insertAdjacentElement("afterend", this.#popover);

        this.#list = document.createElement("ul");
        addClasses(this.#list, "list");
    }

    #buildControls() {
        const signal = this.#signal;

        const form = this.#form = document.createElement("form");
        addClasses(form, "bar");
        form.addEventListener("submit", e => e.preventDefault(), { signal });
        this.#popover.append(form);

        this.#search = document.createElement("input");
        this.#search.type = "search";
        this.#search.name = "platypicker-search";
        addClasses(this.#search, "search");
        this.#search.addEventListener("input", () => this.filter(this.#search.value), { signal });
        this.#search.addEventListener("keydown", e => {
            if (e.code === "Escape") this.#actions.close();
        }, { signal });
        form.append(this.#search);

        // Clicks are ignored while either action is running, so a long one can't be started twice.
        this.#selectAllButton = this.#buildActionButton(() => this.#busy || this.#actions.selectAll());
        form.append(this.#selectAllButton);

        this.#selectNoneButton = this.#buildActionButton(() => this.#busy || this.#actions.selectNone());
        form.append(this.#selectNoneButton);

        this.#popover.append(this.#list);
    }

    #buildActionButton(onClick) {
        const button = document.createElement("button");
        button.type = "button";
        addClasses(button, "button");
        button.addEventListener("click", onClick, { signal: this.#signal });
        return button;
    }

    #wireList() {
        // One listener for the whole list, instead of one per item.
        this.#list.addEventListener("click", e => {
            const button = e.target.closest(".pp-item");
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
     * placeholders, batchSize, loading }. Safe to call again whenever any of them changes. A new batch size is used
     * for the batches that come after, and the rows already rendered stay.
     */
    configure(config) {
        const placeholdersChanged = config.placeholders !== this.#config.placeholders;
        const loadingChanged = Boolean(config.loading) !== Boolean(this.#config.loading);
        this.#config = config;

        this.#search.hidden = !config.search;
        this.#search.placeholder = config.searchPlaceholder;
        this.#selectAllButton.textContent = config.selectAllLabel;
        this.#selectNoneButton.textContent = config.selectNoneLabel;
        this.syncControls();

        if (placeholdersChanged || loadingChanged) this.#syncTail(placeholdersChanged);
        if (loadingChanged) this.#list.setAttribute("aria-busy", Boolean(config.loading));
    }

    /**
     * Shows or hides select all / none. Also depends on the select (multiple, required),
     * so it is inexpensive to repeat.
     */
    syncControls() {
        const controls = Boolean(this.#config.controls);

        this.#selectAllButton.disabled = this.#selectNoneButton.disabled = !controls;
        this.#selectAllButton.hidden = !controls || !this.#source.multiple || !this.#source.canSelectAll;
        this.#selectNoneButton.hidden = !controls || this.#source.required;

        this.#styleBar();
    }

    /**
     * Shows a spinner in place of the label of the select all ("selectAll") or select none ("selectNone") button,
     * and ignores clicks on both while it is shown. The button stays enabled, so it keeps focus.
     */
    setBusy(action, busy) {
        const button = action === "selectAll" ? this.#selectAllButton : this.#selectNoneButton;

        this.#busy = busy;
        if (busy) button.setAttribute("aria-busy", "true");
        else button.removeAttribute("aria-busy");
    }

    /**
     * Hides the bar when it has nothing to show, and marks where each shown control sits in it with data-position
     * ("first", "middle", "last" or "only"), so CSS can join their corners without knowing which ones are hidden.
     *
     * This is done in script and not in CSS on purpose. Rules with :has() and sibling combinators make the browser
     * so slow at changing which options of a long multiple select are selected that select all needs half a minute.
     */
    #styleBar() {
        const controls = [this.#search, this.#selectAllButton, this.#selectNoneButton];
        const shown = controls.filter(control => !control.hidden);

        this.#form.hidden = !shown.length;

        for (const control of controls) {
            const position = shown.indexOf(control);

            if (position < 0) delete control.dataset.position;
            else if (shown.length === 1) control.dataset.position = "only";
            else if (position === 0) control.dataset.position = "first";
            else if (position === shown.length - 1) control.dataset.position = "last";
            else control.dataset.position = "middle";
        }
    }

    get #isBatched() {
        return (this.#config.batchSize ?? ListView.#defaultBatchSize) > 0;
    }

    /** How many rows the next step renders. */
    get #stepSize() {
        return this.#config.batchSize || (this.#config.batchSize === 0 ? ListView.#streamChunkSize : ListView.#defaultBatchSize);
    }

    // -----------------------------------------------------------------
    // Rendering
    // -----------------------------------------------------------------

    /** Renders the matches of the current search from scratch, starting with the first batch. */
    render() {
        this.#showMatches(this.#query());
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
    #showMatches(query) {
        const view = this.#view = this.#source.filter(query);

        this.#sentinelObserver?.disconnect();
        this.#highlighter.clear();
        this.#lastGroup = null;
        this.#rows = [];
        this.#recordsByEntry = new WeakMap();
        this.#headerItems = new Map();
        this.#dividerItems = new Map();
        this.#list.replaceChildren();
        this.#tail = [];

        this.#renderMore(this.#stepSize);

        if (!this.#isBatched) {
            // noinspection JSIgnoredPromiseFromCall, The stream manages its own lifetime and doesn't need to be awaited.
            this.#stream(view);
        }
    }

    async #stream(view) {
        this.#list.setAttribute("aria-busy", view.hasMore || Boolean(this.#config.loading));

        try {
            while (view.hasMore) {
                await ListView.#yieldToMain();
                if (this.#view !== view || this.#signal.aborted) return;

                this.#renderMore(this.#stepSize);
            }
        } finally {
            if (this.#view === view) this.#list.setAttribute("aria-busy", Boolean(this.#config.loading));
        }
    }

    /** Renders the next `count` matches, or fewer if the scan runs out of time or of entries. */
    #renderMore(count, budget = ListView.#scanBudget) {
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

        const items = this.#buildItems(view, entries);
        this.#list.insertBefore(this.#fragmentOf(items), this.#tail[0] ?? null);
        this.#highlightItems(view, entries);
    }

    /** The focused element, asked of the list's own root so that it's found inside a shadow root too. */
    #focused() {
        return this.#popover.getRootNode().activeElement;
    }

    /**
     * Brings the rendered rows up to date after the source has read the select again, touching only what changed.
     * Rows of entries that are still shown are kept, so focus, scroll position and highlights carry over; new rows
     * are created and rows of entries that went away are removed. As many matches as before stay rendered.
     */
    reconcile() {
        const focusedIndex = this.#rows.findIndex(record => record.button === this.#focused());
        const keep = Math.max(this.#rows.length, this.#stepSize);
        const previous = { records: this.#recordsByEntry, headers: this.#headerItems, dividers: this.#dividerItems };

        const view = this.#view = this.#source.filter(this.#query());

        this.#sentinelObserver?.disconnect();
        this.#highlighter.clear();
        this.#lastGroup = null;
        this.#rows = [];
        this.#recordsByEntry = new WeakMap();
        this.#headerItems = new Map();
        this.#dividerItems = new Map();

        const entries = view.pull(keep, Infinity);
        this.#place(this.#buildItems(view, entries, previous));
        this.#highlightItems(view, entries);
        this.#syncTail();

        // A focused row that went away hands focus to the row that took its place, or to the search box.
        if (focusedIndex >= 0 && !this.#popover.contains(this.#focused()) &&
            this.#popover.matches(":popover-open")) {
            const next = this.#rows[Math.min(focusedIndex, this.#rows.length - 1)];
            (next && !next.button.disabled ? next.button : this.#firstFocusable())?.focus({ preventScroll: true });
        }

        if (!this.#isBatched) {
            // noinspection JSIgnoredPromiseFromCall, The stream manages its own lifetime and doesn't need to be awaited.
            this.#stream(view);
        }
    }

    /**
     * Makes the list items for the given matches, in order: dividers, group headers and rows. With `reuse` (the
     * maps of a previous render), items that are still needed are taken from there and brought up to date.
     */
    #buildItems(view, entries, reuse) {
        const items = [];

        for (const entry of entries) {
            if (view.hasDividerBefore(entry)) {
                let li = reuse?.dividers.get(entry);
                if (!li) {
                    const divider = document.createElement("hr");
                    addClasses(divider, "divider");
                    li = this.#wrapInListItem(divider);
                }

                this.#dividerItems.set(entry, li);
                items.push(li);
            }

            if (entry.group !== this.#lastGroup) {
                this.#lastGroup = entry.group;

                // A group shows up once per render, so its header can be keyed by the group.
                if (entry.group && !this.#headerItems.has(entry.group)) {
                    let li = reuse?.headers.get(entry.group);
                    if (!li) {
                        const header = document.createElement("h6");
                        addClasses(header, "header");
                        li = this.#wrapInListItem(header);
                    }

                    const header = li.firstElementChild;
                    if (header.textContent !== entry.group.label) header.textContent = entry.group.label;

                    this.#headerItems.set(entry.group, li);
                    items.push(li);
                }
            }

            const old = reuse?.records.get(entry);
            const record = old ? this.#updateRecord(old) : this.#createRecord(entry);
            this.#recordsByEntry.set(entry, record);
            this.#rows.push(record);
            items.push(old ? record.button.parentElement : this.#wrapInListItem(record.button));
        }

        return items;
    }

    #fragmentOf(items) {
        const fragment = document.createDocumentFragment();
        fragment.append(...items);
        return fragment;
    }

    /**
     * Puts the items in the list in the given order, ahead of the tail. Items that are no longer wanted are removed,
     * and the rest only move when their order changed, since moving a node takes focus away from it.
     */
    #place(items) {
        const wanted = new Set(items);
        for (const child of [...this.#list.children])
            if (!wanted.has(child) && !this.#tail.includes(child)) child.remove();

        let cursor = this.#list.firstElementChild;
        for (const item of items) {
            if (item === cursor) cursor = cursor.nextElementSibling;
            else this.#list.insertBefore(item, cursor);
        }
    }

    /** Highlights the query in the rows of these entries and in the headers of groups matched by name. */
    #highlightItems(view, entries) {
        // Ranges are made once the items are in the document: moving a node collapses the ranges inside it.
        if (!view.query) return;

        for (const entry of entries) {
            if (this.#highlighter.isFull) return;

            const header = entry.group && this.#headerItems.get(entry.group)?.firstElementChild;
            if (header && view.groupMatches(entry.group) && !view.textMatches(entry))
                this.#highlighter.apply(header, "text", header.firstChild, view.query);

            const record = this.#recordsByEntry.get(entry);
            if (record && view.textMatches(entry)) this.#highlightMatch(record, view.query);
        }
    }

    #createRecord(entry) {
        const button = document.createElement("button");
        button.type = "button";
        addClasses(button, "item");

        const label = document.createElement("span");
        addClasses(label, "label");
        const text = document.createTextNode("");
        label.append(text);

        const small = document.createElement("small");
        addClasses(small, "subtext");

        // Present on every row, selected or not, so the subtexts line up.
        const check = document.createElement("span");
        check.setAttribute("aria-hidden", "true");
        addClasses(check, "check");

        button.append(label, small, check);

        const record = { entry, button, text, small, active: undefined };
        this.#recordsByButton.set(button, record);

        return this.#updateRecord(record);
    }

    /** Brings a row up to date with its entry, writing only what differs. */
    #updateRecord(record) {
        const { entry, button, text, small } = record;

        if (text.data !== entry.label) text.data = entry.label;
        if (small.textContent !== entry.subtext) small.textContent = entry.subtext;
        if (button.title !== entry.title) button.title = entry.title;

        if (button.disabled !== entry.disabled) {
            toggleClasses(button, "itemDisabled", entry.disabled);
            button.disabled = entry.disabled; // Takes the item out of the Tab order.
        }

        this.#syncActive(record);
        return record;
    }

    /**
     * Marks the row as selected or not, with aria-pressed (which also tells screen readers) and the itemSelected
     * plug. A selected option that is disabled on its own is not marked.
     */
    #syncActive(record) {
        const active = this.#source.isSelected(record.entry) && !record.entry.ownDisabled;
        if (record.active === active) return;

        record.active = active;
        record.button.setAttribute("aria-pressed", active);
        toggleClasses(record.button, "itemSelected", active);
    }

    #wrapInListItem(element) {
        const li = document.createElement("li");
        li.append(element);
        return li;
    }

    /**
     * The tail marks the end of the list while more rows are to come: the skeleton rows if there are any
     * configured, otherwise a single empty item. More rows are to come while some matches aren't rendered yet, or
     * while the page says it's loading more options. With batching on, or while loading, the browser tells us when
     * the tail comes near the visible part of the list. That is when the next batch is rendered, or once they all
     * are, when the page is asked for more.
     */
    #syncTail(rebuild = false) {
        const wanted = Boolean(this.#view?.hasMore || this.#config.loading);

        if (this.#tail.length && (!wanted || rebuild)) {
            this.#sentinelObserver?.disconnect();
            for (const li of this.#tail) li.remove();
            this.#tail = [];
        }

        if (!wanted) return;

        if (!this.#tail.length) this.#createTail();
        if (this.#isBatched || this.#config.loading) this.#watchTail();
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
            addClasses(wave, "placeholder");

            const bar = document.createElement("span");
            addClasses(bar, "placeholderBar");
            wave.append(bar);

            const button = document.createElement("button");
            button.type = "button";
            addClasses(button, "item");
            button.disabled = true;
            button.append(wave);

            const li = this.#wrapInListItem(button);
            this.#list.append(li);
            this.#tail.push(li);
        }
    }

    #watchTail() {
        this.#sentinelObserver ??= new IntersectionObserver(entries => {
            if (!entries.some(entry => entry.isIntersecting)) return;

            if (this.#view?.hasMore) this.#renderMore(this.#stepSize);
            else if (this.#config.loading) this.#actions.loadMore(this.#search.value.trim());
        }, { root: this.#popover, rootMargin: "0px 0px 100% 0px" }); // Starts a batch a popover's height early.

        // Observing again makes the browser report where the tail is now, so a batch that still leaves it
        // near the visible part is followed by the next one.
        this.#sentinelObserver.disconnect();
        this.#sentinelObserver.observe(this.#tail[0]);
    }

    /**
     * Brings the rendered rows up to date with which options are selected. Changes to the options themselves (their
     * text, attributes, or which options there are) go through reconcile() instead.
     */
    refresh() {
        for (const record of this.#rows) this.#syncActive(record);
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
        if (selectedButton) this.#reveal(selectedButton, true);

        if (!this.#search.hidden) {
            this.#search.focus({ preventScroll: true });
            return;
        }

        const target = selectedButton && !selectedButton.disabled
            ? selectedButton
            : this.#popover.querySelector(".pp-item:not(:disabled)");
        target?.focus({ preventScroll: target === selectedButton });
    }

    #firstFocusable() {
        return this.#popover.querySelector("input:not([hidden]), .pp-item:not(:disabled)");
    }

    scrollIntoView(entry) {
        const button = this.#recordsByEntry.get(entry)?.button;
        if (button) this.#reveal(button, false);
    }

    /**
     * Scrolls the popover so that a row is in view, centred or by the least amount. Element.scrollIntoView() would
     * also scroll the page to bring the row to the middle of the window, which makes the page jump on open.
     * The sticky bar covers the top of the popover, so the part under it doesn't count as in view.
     */
    #reveal(button, center) {
        const popover = this.#popover;
        if (!popover.matches(":popover-open")) return;

        const bar = this.#form.hidden ? 0 : this.#form.offsetHeight;
        const top = button.getBoundingClientRect().top - popover.getBoundingClientRect().top - popover.clientTop - bar;
        const height = button.offsetHeight;
        const room = popover.clientHeight - bar;

        if (center) popover.scrollTop += top - (room - height) / 2;
        else if (top < 0) popover.scrollTop += top;
        else if (top + height > room) popover.scrollTop += top + height - room;
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
        const isCandidate = entry => this.isSelectable(entry) && ListView.#typeAheadText(entry.label).startsWith(buffer);

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
            "input:not([hidden]), .pp-bar button:not([hidden], :disabled), li > .pp-item:not(:disabled)")];

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