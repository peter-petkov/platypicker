"use strict";

import { addClasses, toggleClasses } from "./classes.js";
import { hideBrokenImages, syncIcon, syncImage } from "./decorations.js";
import Glide from "./glide.js";
import Languages from "./languages.js";

/**
 * The popover: a search box with select all / none buttons, and the list of entries.
 *
 * It renders what an OptionSource holds, a few rows at a time as the list scrolls, and reports what the user does
 * through the `actions` it is given (activate, selectAll, selectNone, close, loadMore, full). It never touches the select
 * itself.
 */
export default class ListView {
    // The list starts with a batch of rows and searches ahead a batch at a time, of the configured size; a batch size
    // of 0 turns batching off, and the list streams in steps of #streamChunkSize rows instead. A scan step takes at most
    // #scanBudget milliseconds.
    static #defaultBatchSize = 50;
    static #streamChunkSize = 100;
    static #scanBudget = 8;

    // How much of the list stays rendered below its visible part, in popover heights. Rows are shown a few at a
    // time as the list scrolls, keeping this much ahead, so the scrollbar shrinks smoothly instead of in steps.
    static #cushion = 1;

    // Emoji, plus the characters that glue them together: skin tones, flags, joiners, variation selectors, keycaps,
    // tags.
    static #emoji = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u200d\ufe0f\u20e3\u{e0020}-\u{e007f}]/gu;

    /**
     * The text type-ahead matches against: folded like a search (see Languages.fold), with emoji removed so
     * "🧀 Cheese" is found by typing "ch".
     */
    #typeAheadText(label) {
        return this.#source.fold(label.replace(ListView.#emoji, "").replace(/\s+/g, " ").trim(), this.#config.locale);
    }

    static #lastId = 0;

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
    #empty;                             // "No matches", shown under the list when a search finds nothing.
    #status;                            // Tells screen readers how many options match the search, or that max is reached.
    #announceTimer;
    #limitSaid = null;                  // What the status line said when max was last reached.
    #counter;                           // How many options there are, or match the search, under the list.
    #counterTimer;
    #title;                             // The sheet's title and selected count, above the search box.
    #selectedCount;
    #selectedCountParts;
    #selectedCountShown = { text: "", count: 0 };
    #selectedCountRoll = null;          // The count rolling to its new number, while it does.
    #glide = null;                      // Moves the sheet's rows as a search changes which show (see Glide).
    #sheet = false;                     // Whether the popover is shown as the sheet, where the list scrolls.
    #cancelButton;                      // The sheet's Cancel, beside the search box.

    #config = {};
    #full = false;                      // Whether max options are selected, so the others can't be picked.
    #view = null;                      // The FilteredView being shown.
    #prepared = [];                     // Matches scanned ahead a batch at a time, waiting to be shown.
    #topUpFrame = 0;                    // The animation frame that tops the list up, while one is scheduled.
    #resizeObserver;                    // Tops the list up when the popover changes size.
    #askedForMore = false;              // Whether the page was asked for more options since it last added some.
    #wasAtEnd = false;                  // Whether every match was shown and the end in view, as of the last top-up.
    #lastGroup = null;                  // The option group of the last row rendered.
    #rows = [];                         // The rendered records, in list order.
    #recordsByEntry = new WeakMap();    // Only the entries rendered right now.
    #groupItems = new Map();            // option group -> its <li role="group">, as rendered right now
    #dividerItems = new Map();          // entry -> the <li> of the divider rendered right before it
    #setSize = null;                    // The aria-setsize the rows carry.
    #folded = new Set();                // The option groups folded in the sheet, kept while the picker lives.
    #consumed = 0;                      // How many matches were pulled from the view, folded ones too.
    #positions = new WeakMap();         // entry -> its place among the matches, for aria-posinset
    #pulledGroup = null;                // The option group of the last match pulled.
    #tabStop = null;                    // The one row Tab stops at; the arrow keys move between rows.
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
        clearTimeout(this.#announceTimer);
        clearTimeout(this.#counterTimer);
        cancelAnimationFrame(this.#topUpFrame);
        this.#resizeObserver.disconnect();
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
        this.#popover.id = `platypicker-${++ListView.#lastId}`;
        this.#popover.setAttribute("role", "dialog");
        select.insertAdjacentElement("afterend", this.#popover);

        this.#list = document.createElement("ul");
        addClasses(this.#list, "list");
        this.#list.setAttribute("role", "listbox");
        this.#list.id = `${this.#popover.id}-list`;

        // Outside the list, which may only hold options.
        this.#empty = document.createElement("p");
        addClasses(this.#empty, "empty");
        this.#empty.hidden = true;

        // A polite live region, visually hidden, which screen readers read out when its text changes.
        this.#status = document.createElement("div");
        addClasses(this.#status, "status");
        this.#status.setAttribute("role", "status");

        // Sticks to the bottom of the popover while the list scrolls.
        this.#counter = document.createElement("p");
        addClasses(this.#counter, "counter");
        this.#counter.hidden = true;
    }

    /**
     * Names the popover and its list after the select, as its label reads now, and titles the sheet with it. An empty
     * label names neither.
     */
    setLabel(label) {
        for (const element of [this.#popover, this.#list]) {
            if (!label) element.removeAttribute("aria-label");
            else if (element.getAttribute("aria-label") !== label) element.setAttribute("aria-label", label);
        }
        if (this.#title.textContent !== label) this.#title.textContent = label;
    }

    /**
     * Shows how many options are selected under the sheet's title, as "3 selected". Empty text shows nothing. While
     * the sheet is open, a new count rolls in, up for more and down for fewer, as on an odometer: only what changed
     * rolls, the digits that differ ("19" to "20", but just the last of "12" to "13"). What changed is told by the
     * text the old and new lines share at either end, since where the number sits depends on the language.
     */
    setSelectedCount(text, count) {
        const previous = this.#selectedCountShown;
        if (previous.text === text) return;
        this.#selectedCountShown = { text, count };

        const [before, rolling, after] = this.#selectedCountParts;
        this.#selectedCountRoll?.cancel();
        this.#selectedCountRoll = null;
        this.#selectedCount.hidden = !text;

        if (!previous.text || !text || count === previous.count || !this.#popover.matches(":popover-open") ||
            matchMedia("(prefers-reduced-motion: reduce)").matches) {
            before.textContent = text;
            rolling.textContent = after.textContent = "";
            return;
        }

        const old = previous.text;
        let start = 0;
        while (start < old.length && start < text.length && old[start] === text[start]) start++;
        let end = 0;
        while (end < old.length - start && end < text.length - start &&
            old[old.length - 1 - end] === text[text.length - 1 - end]) end++;

        before.textContent = text.slice(0, start);
        after.textContent = text.slice(text.length - end);
        rolling.textContent = old.slice(start, old.length - end);

        const way = count > previous.count ? -1 : 1; // Which way the digits move: up (-1) or down.
        const out = this.#selectedCountRoll = rolling.animate(
            [{ translate: "0 0", opacity: 1 }, { translate: `0 ${way * 80}%`, opacity: 0 }],
            { duration: 90, easing: "ease-in", fill: "forwards" });
        out.onfinish = () => {
            if (this.#selectedCountRoll !== out) return;
            rolling.textContent = text.slice(start, text.length - end);
            this.#selectedCountRoll = rolling.animate(
                [{ translate: `0 ${-way * 80}%`, opacity: 0 }, { translate: "0 0", opacity: 1 }],
                { duration: 180, easing: "cubic-bezier(.2, .9, .25, 1)" });
            out.cancel();
        };
    }

    #buildControls() {
        const signal = this.#signal;

        const form = this.#form = document.createElement("form");
        addClasses(form, "bar");
        form.addEventListener("submit", e => e.preventDefault(), { signal });
        this.#popover.append(form);

        // Shown only in the sheet (layout="sheet"), where select all and none sit either side of the heading. The
        // heading repeats what the popover's name says, so screen readers skip it.
        const handle = document.createElement("div");
        addClasses(handle, "handle");
        handle.setAttribute("aria-hidden", "true");

        const heading = document.createElement("div");
        addClasses(heading, "heading");
        heading.setAttribute("aria-hidden", "true");
        this.#title = document.createElement("div");
        addClasses(this.#title, "title");
        this.#selectedCount = document.createElement("div");
        addClasses(this.#selectedCount, "selectedCount");
        // The text before what changed, what rolls (see setSelectedCount), and the text after it.
        this.#selectedCountParts = [0, 1, 2].map(() => document.createElement("span"));
        this.#selectedCount.append(...this.#selectedCountParts);
        this.#selectedCount.hidden = true;
        heading.append(this.#title, this.#selectedCount);
        form.append(handle, heading);

        this.#search = document.createElement("input");
        this.#search.type = "search";
        this.#search.name = "platypicker-search";
        this.#search.autocomplete = "off";
        this.#search.setAttribute("aria-controls", this.#list.id);
        addClasses(this.#search, "search");
        this.#search.addEventListener("input", () => this.filter(this.#search.value), { signal });
        // Esc only closes. A search box would also clear itself, without an input event, which left the list
        // filtered by a search no longer shown. The search stays, as it does when the popover closes any other way.
        this.#search.addEventListener("keydown", e => {
            if (e.code !== "Escape") return;
            e.preventDefault();
            this.#actions.close();
        }, { signal });

        // Clears the search and puts the keyboard away. Only the sheet shows it, while searching (see Sheet).
        this.#cancelButton = document.createElement("button");
        this.#cancelButton.type = "button";
        this.#cancelButton.dataset.action = "cancel";
        this.#cancelButton.hidden = true;
        addClasses(this.#cancelButton, "button");

        // display: contents outside the sheet, so the search box sits in the bar as if the row weren't there.
        const searchRow = document.createElement("div");
        addClasses(searchRow, "searchRow");
        searchRow.append(this.#search, this.#cancelButton);
        form.append(searchRow);

        // Clicks are ignored while either action is running, so a long one can't be started twice.
        this.#selectAllButton = this.#buildActionButton(() => this.#busy || this.#actions.selectAll());
        this.#selectAllButton.dataset.action = "all";
        form.append(this.#selectAllButton);

        this.#selectNoneButton = this.#buildActionButton(() => this.#busy || this.#actions.selectNone());
        this.#selectNoneButton.dataset.action = "none";
        form.append(this.#selectNoneButton);

        this.#popover.append(this.#list, this.#empty, this.#counter, this.#status);
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
            const header = e.target.closest(".pp-header");
            if (header) {
                this.#toggleGroup(header);
                return;
            }

            const button = e.target.closest(".pp-item");
            const record = button && this.#recordsByButton.get(button);
            if (!record) return;
            if (record.disabled) {
                if (!record.entry.disabled) this.#sayLimitReached(); // Disabled by the limit: says why it does nothing.
                return;
            }

            this.#actions.activate(record.entry);
        }, { signal: this.#signal });

        hideBrokenImages(this.#list, ["image"], this.#signal);

        // The row that takes focus, however it got it, becomes the one Tab stops at.
        this.#list.addEventListener("focusin", e => {
            if (this.#recordsByButton.has(e.target)) this.#setTabStop(e.target);
        }, { signal: this.#signal });

        // More rows as the list scrolls, or as the popover grows (say, with the window), at most once a frame. The
        // popover scrolls, or in the sheet the list does.
        for (const scroller of [this.#popover, this.#list])
            scroller.addEventListener("scroll", () => this.#scheduleTopUp(), { passive: true, signal: this.#signal });
        this.#resizeObserver = new ResizeObserver(() => this.#scheduleTopUp());
        this.#resizeObserver.observe(this.#popover);
        this.#resizeObserver.observe(this.#list);
    }

    // -----------------------------------------------------------------
    // Configuration (from the element's attributes)
    // -----------------------------------------------------------------

    /**
     * Applies the element's settings: { search, controls, counter, searchPlaceholder, selectAllLabel,
     * selectNoneLabel, counterLabel, limitReachedLabel, placeholders, batchSize, loading, max }. Safe to call again whenever any of them changes. A new batch size is used
     * from the next batch on, and the rows already rendered stay.
     */
    configure(config) {
        const placeholdersChanged = config.placeholders !== this.#config.placeholders;
        const loadingChanged = Boolean(config.loading) !== Boolean(this.#config.loading);
        const maxChanged = config.max !== this.#config.max;
        this.#config = config;
        if (maxChanged) this.refresh();

        this.#search.hidden = !config.search;
        this.#search.placeholder = config.searchPlaceholder;
        this.#search.setAttribute("aria-label", config.searchLabel);
        this.#empty.textContent = config.noMatchesLabel;
        this.#selectAllButton.textContent = config.selectAllLabel;
        this.#selectNoneButton.textContent = config.selectNoneLabel;
        this.#cancelButton.textContent = config.cancelLabel;
        this.syncControls();

        if (placeholdersChanged || loadingChanged) {
            this.#askedForMore = false;
            this.#syncTail(placeholdersChanged);
            this.#scheduleTopUp();
        }
        if (loadingChanged) {
            this.#list.setAttribute("aria-busy", Boolean(config.loading));
            this.#syncEmpty();
        }
        this.#syncCounter();
    }

    /**
     * Shows or hides select all / none. Also depends on the select (multiple, required),
     * so it is inexpensive to repeat. Select all is hidden while there is a max, which it would go past.
     */
    syncControls() {
        const controls = Boolean(this.#config.controls);

        this.#selectAllButton.disabled = this.#selectNoneButton.disabled = !controls;
        this.#selectAllButton.hidden = !controls || !this.#source.multiple || !this.#source.canSelectAll ||
            this.#config.max !== undefined;
        this.#selectNoneButton.hidden = !controls || this.#source.required;
        this.#list.setAttribute("aria-multiselectable", this.#source.multiple);

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

    /** Whether more matches are to come: prepared and waiting to be shown, or not scanned yet. */
    get #hasMore() {
        return this.#prepared.length > 0 || Boolean(this.#view?.hasMore);
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

    /**
     * Goes back to the first batch of rows when more were rendered, as the popover opens. Rows rendered by scrolling
     * or End stay, to the end of the list, and the browser lays them all out each time the popover opens, which on a
     * long list holds up its opening. The selected row is rendered again as focus goes to it (see focusInitial).
     */
    trim() {
        if (this.#isBatched && this.#rows.length > this.#stepSize) this.render();
    }

    /** Shows the entries matching a search, starting again from the first batch. An empty search shows them all. */
    filter(rawValue) {
        // In the open sheet, the rows glide to their new places (see Glide).
        const glide = this.#sheet && this.#popover.matches(":popover-open") &&
            !matchMedia("(prefers-reduced-motion: reduce)").matches;
        this.#glide ??= new Glide(this.#popover);
        const taken = glide && this.#glide.take(this.#scroller, this.#glideRows(), this.#groupItems);

        this.#showMatches(Languages.fold(rawValue.trim(), this.#config.locale));
        this.#scroller.scrollTop = 0;
        if (taken) this.#glide.play(taken, this.#scroller, this.#glideRows(), this.#groupItems);

        // Once typing pauses, so that screen readers don't read out a count for every key.
        clearTimeout(this.#announceTimer);
        this.#announceTimer = setTimeout(() => this.#announce(), 500);

        // Counting the matches of a search on a long list takes a moment, so it waits for a short pause too.
        clearTimeout(this.#counterTimer);
        if (this.#config.counter && this.#view.size < 0) {
            const view = this.#view;
            this.#counterTimer = setTimeout(() => this.#view === view && this.#syncCounter(view.count()), 150);
        }
    }

    /** The rendered rows, in order, as Glide takes them: keyed by their option, with their group. */
    * #glideRows() {
        for (const { entry, button } of this.#rows) yield { key: entry, group: entry.group ?? null, button };
    }

    /**
     * Shows how many rows of all the options are rendered so far, or how many options match the search, under the
     * list. Runs as more rows are rendered, so it shows how far the list is from its end. `matches` is the count of
     * a search, where it has been counted. Without it, a search whose matches aren't all scanned yet keeps
     * the text it has until they are counted (see filter).
     */
    #syncCounter(matches = this.#view?.size) {
        const counter = this.#counter;
        counter.hidden = !this.#config.counter;
        if (counter.hidden || !this.#view || matches < 0) return;

        const text = this.#config.counterLabel({
            shown: this.#shownCount,
            matches,
            total: this.#source.entries.length,
            search: Boolean(this.#view.query),
            loading: Boolean(this.#config.loading),
        });
        if (counter.textContent !== text) counter.textContent = text;
    }

    /**
     * Tells screen readers how many options match the search, counting them all, also those not rendered yet. The
     * count also gives the rows their aria-setsize, which would otherwise wait for the list to be rendered.
     */
    #announce() {
        const view = this.#view;
        if (!view?.query || this.#signal.aborted) {
            this.#status.textContent = "";
            return;
        }

        const count = view.count();
        this.#syncSetSize(view);
        this.#status.textContent = count ? this.#config.matchesLabel(count) : this.#config.noMatchesLabel;
    }

    /** Shows "No matches" when a search has found nothing, and nothing more is coming. */
    #syncEmpty() {
        const view = this.#view;
        this.#empty.hidden = !(view?.query && !this.#hasMore && !this.#rows.length && !this.#config.loading);
    }

    /**
     * The first batch is rendered right away. With batching on, more rows follow a few at a time as the list
     * scrolls (see #topUp). With batching off, the rest streams in step by step. Either way a newer search replaces
     * the one being shown.
     */
    #showMatches(query) {
        const view = this.#view = this.#source.filter(query, this.#config.locale, !this.#config.loading);

        this.#prepared = [];
        this.#askedForMore = false;
        this.#highlighter.clear();
        this.#lastGroup = null;
        this.#setSize = null;
        this.#resetPull();
        this.#rows = [];
        this.#recordsByEntry = new WeakMap();
        this.#groupItems = new Map();
        this.#dividerItems = new Map();
        this.#list.replaceChildren();
        this.#tail = [];

        this.#renderMore(this.#stepSize);
        this.#syncCounter();
        this.#scheduleTopUp();

        if (!this.#isBatched) {
            // noinspection JSIgnoredPromiseFromCall, The stream manages its own lifetime and doesn't need to be awaited.
            this.#stream(view);
        }
    }

    async #stream(view) {
        this.#list.setAttribute("aria-busy", view.hasMore || Boolean(this.#config.loading));

        try {
            while (this.#hasMore) {
                await ListView.#yieldToMain();
                if (this.#view !== view || this.#signal.aborted) return;

                this.#renderMore(this.#stepSize);
            }
        } finally {
            if (this.#view === view) this.#list.setAttribute("aria-busy", Boolean(this.#config.loading));
        }
    }

    /**
     * Shows the next `count` matches, or fewer if the scan runs out of time or of entries. The scan prepares them a
     * batch at a time (or as many as a bigger step needs), so that showing a few rows per frame never scans per
     * frame.
     */
    #renderMore(count, budget = ListView.#scanBudget) {
        if (this.#prepared.length < count && this.#view.hasMore) {
            const pulled = this.#pull(this.#view, Math.max(count - this.#prepared.length, this.#stepSize), budget);
            this.#prepared = this.#prepared.concat(pulled);
        }

        this.#appendRows(this.#view, this.#prepared.splice(0, count));
        this.#syncTail();
        this.#syncEmpty();
        this.#syncCounter();
    }

    /**
     * Pulls the next `count` matches from the view to render, or fewer if `budget` milliseconds run out or the view
     * does. Of a folded group only the first match is kept, which brings its header; the rest are passed over, and
     * so don't count. Each kept match is given its place among all the matches, for aria-posinset.
     */
    #pull(view, count, budget) {
        const found = [];
        const deadline = performance.now() + budget;

        do {
            for (const entry of view.pull(count - found.length, deadline - performance.now())) {
                this.#consumed++;
                if (entry.group && entry.group === this.#pulledGroup && this.#isFolded(entry.group, view)) continue;

                this.#pulledGroup = entry.group;
                this.#positions.set(entry, this.#consumed);
                found.push(entry);
            }
        } while (found.length < count && view.hasMore && performance.now() < deadline);

        return found;
    }

    /** Starts #pull over, for a new view. */
    #resetPull() {
        this.#consumed = 0;
        this.#positions = new WeakMap();
        this.#pulledGroup = null;
    }

    /** How many matches the list has shown, as rows or inside folded groups. */
    get #shownCount() {
        return this.#consumed - this.#prepared.length;
    }

    /**
     * Whether a group's rows are folded away: in the sheet, where its header was tapped, while there's no search
     * (which shows every group that has matches unfolded).
     */
    #isFolded(group, view = this.#view) {
        return Boolean(group) && this.#sheet && !view?.query && this.#folded.has(group);
    }

    /** Folds or unfolds the group of a tapped header, in the sheet while there's no search. */
    #toggleGroup(header) {
        if (!this.#sheet || this.#view?.query) return;

        const group = [...this.#groupItems].find(([, li]) => li.firstElementChild === header)?.[0];
        if (!group) return;

        if (!this.#folded.delete(group)) this.#folded.add(group);
        this.reconcile();
    }

    /**
     * Brings a group's header up to date: its label, whether it's folded (data-folded and the headerFolded plug),
     * and, while it is, how many of its options are selected, so a folded group doesn't hide them.
     */
    #syncHeader(li, group, view = this.#view) {
        const header = li.firstElementChild;
        const [text, count] = header.childNodes;
        if (text.data !== group.label) text.data = group.label;

        const folded = this.#isFolded(group, view);
        if (folded !== header.hasAttribute("data-folded")) {
            header.toggleAttribute("data-folded", folded);
            toggleClasses(header, "headerFolded", folded);
        }

        let selected = 0;
        if (folded)
            for (const option of group.element.children)
                if (option.selected && !option.hidden && !option.matches(":disabled")) selected++;

        const shown = selected ? String(selected) : "";
        if (count.textContent !== shown) count.textContent = shown;
        count.hidden = !selected;
    }

    #scheduleTopUp() {
        this.#topUpFrame ||= requestAnimationFrame(() => {
            this.#topUpFrame = 0;
            this.#topUp();
        });
    }

    /**
     * Keeps a cushion of rendered rows below the visible part of the list, showing just enough to make up for what
     * scrolled into view, so the list grows smoothly as it scrolls. Then sees whether to ask the page for more.
     */
    #topUp() {
        if (!this.#view || this.#signal.aborted || !this.#popover.matches(":popover-open")) return;

        // The skeleton rows' offsetTop is measured in the scroller: the popover is positioned, and so is the sheet's
        // list (see platypicker.css).
        const scroller = this.#scroller;
        const end = this.#tail[0]?.offsetTop ?? scroller.scrollHeight;
        const below = end - scroller.scrollTop - scroller.clientHeight;
        const wanted = scroller.clientHeight * ListView.#cushion;

        if (below < wanted && this.#hasMore && this.#isBatched) {
            const rowHeight = this.#rows.at(-1)?.button.offsetHeight || 32;
            this.#renderMore(Math.ceil((wanted - below) / rowHeight));
            this.#scheduleTopUp(); // Again next frame, in case the scan ran out of time or the rows are taller.
        }

        this.#askForMore(below < wanted);
    }

    /**
     * While the page says it's loading more options, asks it for more before the list runs out: as soon as fewer
     * than a batch of matches are left to show, so the next page has time to arrive. Once until the page adds
     * options, and again whenever the end comes into view, in case a fetch got nowhere.
     */
    #askForMore(nearEnd) {
        if (!this.#config.loading) {
            this.#wasAtEnd = false;
            return;
        }

        const unshown = this.#view.count() - this.#shownCount;
        const atEnd = nearEnd && unshown <= 0;

        if ((unshown < this.#stepSize && !this.#askedForMore) || (atEnd && !this.#wasAtEnd)) {
            this.#askedForMore = true;
            this.#actions.loadMore({ search: this.#search.value.trim(), batchSize: this.#stepSize });
        }

        this.#wasAtEnd = atEnd;
    }

    /**
     * Makes sure the entry has a row, rendering up to it if need be. Returns false when the entry doesn't
     * match the current search.
     */
    ensureRendered(entry) {
        const view = this.#view;
        if (!view?.includes(entry) || this.#isFolded(entry.group, view)) return false;

        while (!this.#recordsByEntry.has(entry) && this.#hasMore) this.#renderMore(this.#stepSize, Infinity);

        return this.#recordsByEntry.has(entry);
    }

    #appendRows(view, entries) {
        if (!entries.length) return;

        const { items, groups } = this.#buildItems(view, entries);
        for (const [group, rows] of groups) group.lastElementChild.append(...rows);
        this.#list.insertBefore(this.#fragmentOf(items), this.#tail[0] ?? null);
        this.#syncSetSize(view);
        this.#syncTabStop();
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
        this.#syncFull(); // Options that went away may have been selected.
        const focusedIndex = this.#rows.findIndex(record => record.button === this.#focused());
        const keep = Math.max(this.#rows.length, this.#stepSize);
        const previous = { records: this.#recordsByEntry, groups: this.#groupItems, dividers: this.#dividerItems };

        const view = this.#view = this.#source.filter(this.#query(), this.#config.locale, !this.#config.loading);

        this.#prepared = [];
        this.#askedForMore = false;
        this.#highlighter.clear();
        this.#lastGroup = null;
        this.#setSize = null;
        this.#resetPull();
        this.#rows = [];
        this.#recordsByEntry = new WeakMap();
        this.#groupItems = new Map();
        this.#dividerItems = new Map();

        const entries = this.#pull(view, keep, Infinity);
        const { items, groups } = this.#buildItems(view, entries, previous);
        this.#place(this.#list, items);
        for (const [group, rows] of groups) this.#place(group.lastElementChild, rows);
        this.#syncSetSize(view);
        this.#syncTabStop();
        this.#highlightItems(view, entries);
        this.#syncTail();
        this.#syncEmpty();
        this.#syncCounter(this.#config.counter && view.query ? view.count() : undefined);

        // A focused row that went away hands focus to the row that took its place, or to the search box.
        if (focusedIndex >= 0 && !this.#popover.contains(this.#focused()) &&
            this.#popover.matches(":popover-open")) {
            const next = this.#rows[Math.min(focusedIndex, this.#rows.length - 1)];
            (next && !next.entry.disabled ? next.button : this.#firstFocusable())?.focus({ preventScroll: true });
        }

        this.#scheduleTopUp();

        if (!this.#isBatched) {
            // noinspection JSIgnoredPromiseFromCall, The stream manages its own lifetime and doesn't need to be awaited.
            this.#stream(view);
        }
    }

    /**
     * Makes the list items for the given matches, in order: dividers, groups and rows. A group is a
     * <li role="group"> named by its header, with its rows in a list of its own. Returns the items for the list
     * itself, and for each group the rows for its list. With `reuse` (the maps of a previous render), items that
     * are still needed are taken from there and brought up to date.
     */
    #buildItems(view, entries, reuse) {
        const items = [];
        const groups = new Map(); // group <li> -> the items for its own list

        // The items to add to: the list's own, or a group's. A group may be from an earlier batch.
        const itemsOf = group => {
            if (!group) return items;
            const li = this.#groupItems.get(group);
            if (!groups.has(li)) groups.set(li, []);
            return groups.get(li);
        };

        for (const entry of entries) {
            // Inside the group when it sits between two of its rows, before it when it comes ahead of the group.
            const inGroup = entry.group && entry.group === this.#lastGroup;

            if (view.hasDividerBefore(entry)) {
                let li = reuse?.dividers.get(entry);
                if (!li) {
                    const divider = document.createElement("hr");
                    addClasses(divider, "divider");
                    li = this.#wrapInListItem(divider);
                    li.setAttribute("aria-hidden", "true"); // A listbox holds options and groups only.
                    li.dataset.divider = ""; // So the sheet leaves out the line the row after it would draw.
                }

                this.#dividerItems.set(entry, li);
                itemsOf(inGroup && entry.group).push(li);
            }

            if (entry.group !== this.#lastGroup) {
                this.#lastGroup = entry.group;

                // A group shows up once per render, so it can be keyed by the group.
                if (entry.group && !this.#groupItems.has(entry.group)) {
                    const li = reuse?.groups.get(entry.group) ?? this.#createGroup();
                    this.#syncHeader(li, entry.group, view);

                    // The sheet rounds off the rows outside a group where a group follows them, which CSS can't
                    // see without :has() (see #styleBar for why that's avoided).
                    const previous = items.at(-1) ?? (reuse ? null : this.#lastListItem());
                    if (previous && !previous.matches(".pp-group"))
                        previous.dataset.beforeGroup = "";

                    this.#groupItems.set(entry.group, li);
                    items.push(li);
                }
            }

            // A folded group brings only its header, and an empty list, which takes away rows rendered before.
            if (this.#isFolded(entry.group, view)) {
                itemsOf(entry.group);
                continue;
            }

            const old = reuse?.records.get(entry);
            const record = old ? this.#updateRecord(old) : this.#createRecord(entry);
            this.#recordsByEntry.set(entry, record);
            this.#rows.push(record);
            record.button.setAttribute("aria-posinset", this.#positions.get(entry) ?? this.#rows.length);
            if (this.#setSize !== null) record.button.setAttribute("aria-setsize", this.#setSize);

            const li = old ? record.button.parentElement : this.#wrapInListItem(record.button);
            delete li.dataset.beforeGroup; // Set again above if a group still follows it.
            itemsOf(entry.group).push(li);
        }

        return { items, groups };
    }

    /** The list's last item before the skeleton rows, if there are any. */
    #lastListItem() {
        return this.#tail.length ? this.#tail[0].previousElementSibling : this.#list.lastElementChild;
    }

    /**
     * A group's <li>: its header, hidden from screen readers since it names the group instead, and the list its
     * rows go in. Both lists are display: contents, so the rows line up as one. The header holds the group's label,
     * as a text node, and the count of its selected options shown while it's folded (see #syncHeader).
     *
     * In the sheet a tap on the header folds the group. Screen readers can't reach the header, and nothing starts
     * folded, so they always get every group unfolded: a listbox may hold only options and groups, which leaves no
     * valid place for a button that folds.
     */
    #createGroup() {
        const header = document.createElement("h6");
        addClasses(header, "header");
        header.id = `${this.#popover.id}-${++ListView.#lastId}`;
        header.setAttribute("aria-hidden", "true");

        const count = document.createElement("span");
        addClasses(count, "headerCount");
        count.hidden = true;
        header.append(document.createTextNode(""), count);

        const list = document.createElement("ul");
        addClasses(list, "groupList");
        list.setAttribute("role", "none");

        const li = document.createElement("li");
        addClasses(li, "group");
        li.setAttribute("role", "group");
        li.setAttribute("aria-labelledby", header.id);
        li.append(header, list);
        return li;
    }

    /**
     * Gives every row the size of the list, for "3 of 20". It's known at once without a search, and once the scan is
     * done with one; until then it's -1, unknown.
     */
    #syncSetSize(view) {
        const size = String(view.size);
        if (size === this.#setSize) return;

        this.#setSize = size;
        for (const record of this.#rows) record.button.setAttribute("aria-setsize", size);
    }

    #fragmentOf(items) {
        const fragment = document.createDocumentFragment();
        fragment.append(...items);
        return fragment;
    }

    /**
     * Tab stops at one row of the list, as in a native listbox: the row last focused while it's still shown,
     * otherwise the selected row, otherwise the first.
     */
    #syncTabStop() {
        if (this.#tabStop?.isConnected) return;

        const selected = this.#source.firstSelected;
        this.#setTabStop((this.#recordsByEntry.get(selected) ?? this.#rows[0])?.button ?? null);
    }

    #setTabStop(button) {
        if (this.#tabStop === button) return;
        if (this.#tabStop) this.#tabStop.tabIndex = -1;
        this.#tabStop = button;
        if (button) button.tabIndex = 0;
    }

    /**
     * Puts the items in a list (the list itself or a group's) in the given order, ahead of the tail. Items that are no
     * longer wanted are removed, and the rest only move when their order changed, since moving a node takes focus
     * away from it.
     */
    #place(list, items) {
        const wanted = new Set(items);
        for (const child of [...list.children])
            if (!wanted.has(child) && !this.#tail.includes(child)) child.remove();

        let cursor = list.firstElementChild;
        for (const item of items) {
            if (item === cursor) cursor = cursor.nextElementSibling;
            else list.insertBefore(item, cursor);
        }
    }

    /** Highlights the query in the rows of these entries and in the headers of groups matched by name. */
    #highlightItems(view, entries) {
        // Ranges are made once the items are in the document: moving a node collapses the ranges inside it.
        if (!view.query) return;

        for (const entry of entries) {
            const header = entry.group && this.#groupItems.get(entry.group)?.firstElementChild;
            if (header && view.groupMatches(entry.group) && !view.textMatches(entry))
                this.#highlightText(view, header, "text", header.firstChild);

            const record = this.#recordsByEntry.get(entry);
            if (record && view.textMatches(entry)) this.#highlightMatch(record, view);
        }
    }

    #createRecord(entry) {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "option");
        button.tabIndex = -1;
        addClasses(button, "item");

        const record = { entry, button, ...this.#createParts(button), active: undefined, disabled: false };
        this.#recordsByButton.set(button, record);

        return this.#updateRecord(record);
    }

    /** Brings a row up to date with its entry, writing only what differs. */
    #updateRecord(record) {
        const { entry, button } = record;

        this.#updateParts(record);
        if (button.title !== entry.title) button.title = entry.title;

        this.#syncState(record);
        return record;
    }

    /**
     * Builds a row's content into its button, in this order: image, icon, label, subtext, check. Returns the parts by
     * name, which go on the row's record: the label's text node as `text`, the subtext as `small`. The image and icon
     * are made by #updateParts, and only for an option that has one, so a row without stays as it was.
     */
    #createParts(button) {
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
        return { image: null, icon: null, label, text, small, check };
    }

    /** Brings a row's content up to date with its entry, writing only what differs. */
    #updateParts(record) {
        const { entry, label, text, small } = record;

        if (text.data !== entry.label) text.data = entry.label;
        if (small.textContent !== entry.subtext) small.textContent = entry.subtext;
        record.icon = syncIcon(record.icon, entry.icon, "icon", label);
        record.image = syncImage(record.image, entry.image, "image", record.icon ?? label);
    }

    /**
     * Marks the row as selected or not, with aria-selected (which also tells screen readers) and the itemSelected
     * plug. A selected option that is disabled on its own is not marked. Marks it disabled too, with aria-disabled and
     * the itemDisabled plug: while its option is, and while max options are selected and its option isn't one of them.
     */
    #syncState(record) {
        const { entry, button } = record;
        const selected = this.#source.isSelected(entry);
        const active = selected && !entry.ownDisabled;
        if (record.active !== active) {
            record.active = active;
            button.setAttribute("aria-selected", active);
            toggleClasses(button, "itemSelected", active);
        }

        // Not the disabled attribute: a disabled row stays focusable, so it can be found, and says it's disabled.
        const disabled = entry.disabled || (this.#full && !selected);
        if (record.disabled !== disabled) {
            record.disabled = disabled;
            toggleClasses(button, "itemDisabled", disabled);
            if (disabled) button.setAttribute("aria-disabled", "true");
            else button.removeAttribute("aria-disabled");
        }
    }

    /**
     * Works out whether max options are selected (see #full), and tells the picker when that changes. Reaching the
     * limit while the popover is open is told to screen readers. Counts the selected options only while there is a
     * max, as that takes a moment on a long select.
     */
    #syncFull() {
        const max = this.#config.max;
        const full = max !== undefined && this.#source.selectedCount >= max;
        if (full === this.#full) return;

        this.#full = full;
        this.#actions.full?.(full);
        if (full && this.#popover.matches(":popover-open")) this.#sayLimitReached();
        else if (!full && this.#status.textContent === this.#limitSaid)
            this.#status.textContent = ""; // No longer so, for a screen reader that goes over the page.
    }

    /**
     * Tells screen readers that max options are selected, through the status line. It's emptied first, and filled a
     * frame later, so that saying it again is heard again.
     */
    #sayLimitReached() {
        this.#status.textContent = "";
        requestAnimationFrame(() => {
            if (!this.#signal.aborted && this.#full)
                this.#status.textContent = this.#limitSaid = this.#config.limitReachedLabel(this.#config.max);
        });
    }

    #wrapInListItem(element) {
        const li = document.createElement("li");
        li.setAttribute("role", "none");
        li.append(element);
        return li;
    }

    /**
     * The tail marks the end of the list while more rows are to come: the skeleton rows if there are any
     * configured, otherwise a single empty item. More rows are to come while some matches aren't shown yet, or
     * while the page says it's loading more options. #topUp shows them as the list scrolls.
     */
    #syncTail(rebuild = false) {
        const wanted = this.#hasMore || Boolean(this.#config.loading);

        if (this.#tail.length && (!wanted || rebuild)) {
            for (const li of this.#tail) li.remove();
            this.#tail = [];
        }

        if (!wanted) return;

        if (!this.#tail.length) this.#createTail();
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
            button.setAttribute("aria-disabled", "true");
            button.append(wave);

            const li = this.#wrapInListItem(button);
            li.setAttribute("aria-hidden", "true");
            this.#list.append(li);
            this.#tail.push(li);
        }
    }

    /**
     * Brings the rendered rows up to date with which options are selected. Changes to the options themselves (their
     * text, attributes, or which options there are) go through reconcile() instead.
     */
    refresh() {
        this.#syncFull();
        for (const record of this.#rows) this.#syncState(record);
        for (const [group, li] of this.#groupItems) this.#syncHeader(li, group);
    }

    // -----------------------------------------------------------------
    // Highlighting
    // -----------------------------------------------------------------

    #query() {
        return Languages.fold(this.#search.value.trim(), this.#config.locale);
    }

    #highlightMatch(record, view) {
        const { entry, button, text, small } = record;
        this.#highlightText(view, button, "text", text);

        const subtext = entry.subtext.toLowerCase();
        if (subtext && subtext !== entry.label.toLowerCase())
            this.#highlightText(view, button, "subtext", small.firstChild);
    }

    #highlightText(view, owner, key, node) {
        this.#highlighter.apply(owner, key, node, node && view.locate(node.data));
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
     * goes to the search box when there is one, otherwise to the selected item, otherwise to the first item. With
     * `search` false (in the sheet, where focusing the search box would bring up the on-screen keyboard), the
     * search box is passed over.
     */
    focusInitial({ search = true } = {}) {
        this.#scheduleTopUp(); // The popover has its size now, so the list can fill it.

        const selected = this.#source.firstSelected;
        const selectedButton = selected && this.ensureRendered(selected) ? this.#recordsByEntry.get(selected).button : null;
        if (selectedButton) this.#reveal(selectedButton, true);

        if (search && !this.#search.hidden) {
            this.#search.focus({ preventScroll: true });
            return;
        }

        const target = selectedButton && !selected.disabled
            ? selectedButton
            : this.#popover.querySelector(".pp-item:not(:disabled, [aria-disabled='true'])");
        target?.focus({ preventScroll: target === selectedButton });
    }

    #firstFocusable() {
        return this.#popover.querySelector("input:not([hidden]), .pp-item:not(:disabled, [aria-disabled='true'])");
    }

    scrollIntoView(entry) {
        const button = this.#recordsByEntry.get(entry)?.button;
        if (button) this.#reveal(button, false);
    }

    /**
     * Scrolls the popover so that a row is in view, centred or by the least amount. Element.scrollIntoView() would
     * also scroll the page to bring the row to the middle of the window, which makes the page jump on open.
     * The sticky bar covers the top of the popover and the sticky counter its bottom, so the parts under them don't
     * count as in view.
     */
    #reveal(button, center) {
        if (!this.#popover.matches(":popover-open")) return;

        const scroller = this.#scroller;
        const bar = this.#coveredHeight;
        const top = button.getBoundingClientRect().top - scroller.getBoundingClientRect().top - scroller.clientTop - bar;
        const height = button.offsetHeight;
        const room = scroller.clientHeight - bar - this.#coveredBottom;

        if (center) scroller.scrollTop += top - (room - height) / 2;
        else if (top < 0) scroller.scrollTop += top;
        else if (top + height > room) scroller.scrollTop += top + height - room;
    }

    /**
     * What scrolls: the popover, with the bar sticking to its top, or in the sheet (see setSheet) the list alone, so
     * nothing passes under the sheet's see-through bar.
     */
    get #scroller() {
        return this.#sheet ? this.#list : this.#popover;
    }

    /** How much of the top of the scroller the sticky bar covers. */
    get #coveredHeight() {
        return this.#sheet || this.#form.hidden ? 0 : this.#form.offsetHeight;
    }

    /** How much of the bottom of the scroller the sticky counter covers. In the sheet it sits under the list instead. */
    get #coveredBottom() {
        return this.#sheet || this.#counter.hidden ? 0 : this.#counter.offsetHeight;
    }

    /** Says whether the popover is shown as the sheet (layout="sheet"), where the list scrolls rather than the popover. */
    setSheet(sheet) {
        if (this.#sheet === sheet) return;
        this.#sheet = sheet;
        if (this.#folded.size && this.#view) this.reconcile(); // Folds show only in the sheet.
    }

    /** The parts the sheet's behaviour works with (see Sheet). */
    get sheetParts() {
        return { popover: this.#popover, bar: this.#form, search: this.#search, cancel: this.#cancelButton, list: this.#list };
    }

    /** Empties the search box and shows every option again. */
    clearSearch() {
        if (!this.#search.value) return;
        this.#search.value = "";
        this.filter("");
    }

    // -----------------------------------------------------------------
    // Keyboard type-ahead (mirrors native <select> "jump to option" behavior,
    // needed here because the real popover is hidden in favor of ours)
    // -----------------------------------------------------------------

    #wireKeyboardTypeAhead() {
        const signal = this.#signal;

        this.#popover.addEventListener("keydown", e => {
            if (this.#search.contains(e.target)) return;

            // A letter or digit of any script.
            if (e.ctrlKey || e.altKey || e.metaKey || !/^[\p{L}\p{N}]$/u.test(e.key)) return;

            this.#typeAheadBuffer += Languages.fold(e.key, this.#config.locale);
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
        const isCandidate = entry => this.isSelectable(entry) && this.#typeAheadText(entry.label).startsWith(buffer);

        const current = this.#source.firstSelected;
        return this.#source.entries.find(entry => entry !== current && isCandidate(entry)) ??
            (current && isCandidate(current) ? current : undefined);
    }

    // -----------------------------------------------------------------
    // Keyboard navigation. Moves focus only, and never changes the selection.
    // -----------------------------------------------------------------

    #wireKeyboardNavigation() {
        // The elements the arrow keys go through, in order: the search box, the buttons, then the rows.
        const focusableElements = () => [...this.#popover.querySelectorAll(
            "input:not([hidden]), .pp-bar button:not([hidden], :disabled), li > .pp-item:not(:disabled)")];

        this.#popover.addEventListener("keydown", e => {
            // Alt+Up closes, as on a native select, and puts focus back on it.
            if (e.altKey && e.code === "ArrowUp" && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                this.#actions.close();
                return;
            }

            if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;

            // Home and End go to the first and last row, Page Up and Page Down a popover's height. Only from a row,
            // so that they still move the caret in the search box.
            const jump = { Home: -Infinity, End: Infinity, PageUp: -1, PageDown: 1 }[e.code];
            if (jump && this.#recordsByButton.has(e.target)) {
                e.preventDefault();
                this.#jump(e.target, jump);
                return;
            }

            const step = { ArrowDown: 1, ArrowUp: -1 }[e.code];
            if (!step) return;

            let focusable = focusableElements();
            if (!focusable.length) return;

            e.preventDefault();

            // On the last rendered item the next batch comes first, so the key never stalls at the end of a longer list.
            if (step > 0 && e.target === focusable.at(-1) && this.#hasMore) {
                this.#renderMore(this.#stepSize, Infinity);
                focusable = focusableElements();
            }

            const index = focusable.indexOf(e.target);
            focusable[Math.min(Math.max(index + step, 0), focusable.length - 1)].focus();
        }, { signal: this.#signal });
    }

    /**
     * Moves focus from a row by pages (-1 or 1, as many rows as fit in the popover) or to an end (-Infinity or
     * Infinity). Rows that aren't rendered yet are rendered first, so End reaches the last match of a long list.
     */
    #jump(from, pages) {
        const index = this.#rows.findIndex(record => record.button === from);
        const room = this.#scroller.clientHeight - this.#coveredHeight - this.#coveredBottom;
        const pageSize = Math.max(1, Math.floor(room / from.offsetHeight) - 1);
        const wanted = Number.isFinite(pages) ? index + pages * pageSize : pages;

        while (wanted >= this.#rows.length && this.#hasMore)
            this.#renderMore(wanted === Infinity ? Infinity : this.#stepSize, Infinity);

        const target = this.#rows[Math.min(Math.max(wanted, 0), this.#rows.length - 1)]?.button;
        if (!target) return;

        target.focus({ preventScroll: true });
        this.#reveal(target, false);
    }
}