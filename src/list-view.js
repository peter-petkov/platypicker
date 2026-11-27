"use strict";

import createDecorations from "burrowkit/decorations.js";
import RowList from "burrowkit/list.js";
import Search from "burrowkit/search.js";
import { addClasses, fixedClass, toggleClasses } from "./classes.js";
import Glide from "./glide.js";

// The images (data-image) and icons (data-icon) of the rows, with the picker's classes.
const { hideBrokenImages, syncIcon, syncImage } = createDecorations({ addClasses, fixedClass });

/**
 * The popover: a search box with select all / none buttons, and the list of entries.
 *
 * It renders what an OptionSource holds, through Burrowkit's RowList (batches of rows as the list scrolls, groups,
 * dividers, reconciling), and reports what the user does through the `actions` it is given (activate, selectAll,
 * selectNone, close, loadMore, full). It never touches the select itself.
 */
export default class ListView {
    // Emoji, plus the characters that glue them together: skin tones, flags, joiners, variation selectors, keycaps,
    // tags.
    static #emoji = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}‍️⃣\u{e0020}-\u{e007f}]/gu;

    /**
     * The text type-ahead matches against: folded like a search (see Search.fold), with emoji removed so
     * "🧀 Cheese" is found by typing "ch".
     */
    #typeAheadText(label) {
        return this.#source.fold(label.replace(ListView.#emoji, "").replace(/\s+/g, " ").trim(), this.#config.locale);
    }

    static #lastId = 0;

    #source;
    #actions;
    #signal;

    #popover;
    #form;
    #search;
    #selectAllButton;
    #selectNoneButton;
    #busy = false;                      // Whether select all or select none is running.
    #rowList;                           // The rows (see Burrowkit's RowList).
    #list;                              // Its <ul role="listbox">.
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
    #folded = new Set();                // The option groups folded in the sheet, kept while the picker lives.
    #tabStop = null;                    // The one row Tab stops at; the arrow keys move between rows.
    #typeAheadBuffer = "";
    #typeAheadTimer;

    constructor({ select, source, highlighter, actions, signal }) {
        this.#source = source;
        this.#actions = actions;
        this.#signal = signal;

        this.#buildPopover(select, highlighter);
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
        this.#rowList.destroy();
        this.#popover.remove();
    }

    // -----------------------------------------------------------------
    // Construction
    // -----------------------------------------------------------------

    #buildPopover(select, highlighter) {
        this.#popover = document.createElement("div");
        addClasses(this.#popover, "menu");
        this.#popover.popover = "manual";
        this.#popover.id = `platypicker-${++ListView.#lastId}`;
        this.#popover.setAttribute("role", "dialog");
        select.insertAdjacentElement("afterend", this.#popover);

        this.#rowList = new RowList({
            container: this.#popover,
            classes: { addClasses, fixedClass },
            highlighter,
            signal: this.#signal,
            hooks: {
                createRow: entry => this.#createRow(entry),
                updateRow: record => this.#updateRow(record),
                highlightRow: (record, view) => this.#highlightRow(record, view),
                isFolded: (group, view) => this.#isFolded(group, view),
                createGroup: (li, header) => this.#createGroup(header),
                syncGroup: (li, group, view) => this.#syncHeader(li, group, view),
                scroller: () => this.#scroller,
                covered: () => ({ top: this.#coveredHeight, bottom: this.#coveredBottom }),
                rendered: () => this.#rendered(),
                loadMore: ({ batchSize }) => this.#actions.loadMore({ search: this.#search.value.trim(), batchSize }),
            },
        });
        this.#list = this.#rowList.element;
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
            const record = button && this.#rowList.recordOfElement(button);
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
            if (this.#rowList.recordOfElement(e.target)) this.#setTabStop(e.target);
        }, { signal: this.#signal });
    }

    // -----------------------------------------------------------------
    // Configuration (from the element's attributes)
    // -----------------------------------------------------------------

    /**
     * Applies the element's settings: { search, controls, counter, searchPlaceholder, selectAllLabel,
     * selectNoneLabel, counterLabel, limitReachedLabel, placeholders, batchSize, loading, max }. Safe to call again
     * whenever any of them changes. A new batch size is used from the next batch on, and the rows already rendered
     * stay.
     */
    configure(config) {
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

        this.#rowList.configure({ batchSize: config.batchSize, placeholders: config.placeholders, loading: config.loading });
        this.#syncEmpty();
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
        if (this.#rowList.isBatched && this.#rowList.rows.length > this.#rowList.stepSize) this.render();
    }

    /** Shows the entries matching a search, starting again from the first batch. An empty search shows them all. */
    filter(rawValue) {
        // In the open sheet, the rows glide to their new places (see Glide).
        const taken = this.#takeForGlide();
        this.#showMatches(Search.fold(rawValue.trim(), this.#config.locale));
        this.#scroller.scrollTop = 0;
        this.#playGlide(taken);

        // Once typing pauses, so that screen readers don't read out a count for every key.
        clearTimeout(this.#announceTimer);
        this.#announceTimer = setTimeout(() => this.#announce(), 500);

        // Counting the matches of a search on a long list takes a moment, so it waits for a short pause too.
        clearTimeout(this.#counterTimer);
        const view = this.#rowList.view;
        if (this.#config.counter && view.size < 0)
            this.#counterTimer = setTimeout(() => this.#rowList.view === view && this.#syncCounter(view.count()), 150);
    }

    /** Shows the matches of a folded query, from the first batch. */
    #showMatches(query) {
        this.#rowList.show(this.#source.filter(query, this.#config.locale, !this.#config.loading));
        this.#syncCounter();
    }

    /** After the list added rows or brought them up to date. */
    #rendered() {
        this.#syncTabStop();
        this.#syncEmpty();
        this.#syncCounter();
    }

    /**
     * Notes where the rows are before the list is rendered anew, so #playGlide can move them to their new places:
     * in the open sheet, unless the user prefers less motion. Returns null otherwise.
     */
    #takeForGlide() {
        if (!this.#sheet || !this.#popover.matches(":popover-open") ||
            matchMedia("(prefers-reduced-motion: reduce)").matches) return null;

        this.#glide ??= new Glide(this.#popover);
        return this.#glide.take(this.#scroller, this.#glideRows(), this.#rowList.groupItems);
    }

    #playGlide(taken) {
        if (taken) this.#glide.play(taken, this.#scroller, this.#glideRows(), this.#rowList.groupItems);
    }

    /** The rendered rows, in order, as Glide takes them: keyed by their option, with their group. */
    * #glideRows() {
        for (const { entry, element } of this.#rowList.rows) yield { key: entry, group: entry.group ?? null, button: element };
    }

    /**
     * Shows how many rows of all the options are rendered so far, or how many options match the search, under the
     * list. Runs as more rows are rendered, so it shows how far the list is from its end. `matches` is the count of
     * a search, where it has been counted. Without it, a search whose matches aren't all scanned yet keeps
     * the text it has until they are counted (see filter).
     */
    #syncCounter(matches = this.#rowList.view?.size) {
        const counter = this.#counter;
        const view = this.#rowList.view;
        counter.hidden = !this.#config.counter;
        if (counter.hidden || !view || matches < 0) return;

        const text = this.#config.counterLabel({
            shown: this.#rowList.shownCount,
            matches,
            total: this.#source.entries.length,
            search: Boolean(view.query),
            loading: Boolean(this.#config.loading),
        });
        if (counter.textContent !== text) counter.textContent = text;
    }

    /**
     * Tells screen readers how many options match the search, counting them all, also those not rendered yet. The
     * count also gives the rows their aria-setsize, which would otherwise wait for the list to be rendered.
     */
    #announce() {
        const view = this.#rowList.view;
        if (!view?.query || this.#signal.aborted) {
            this.#status.textContent = "";
            return;
        }

        const count = view.count();
        this.#rowList.syncSetSize();
        this.#status.textContent = count ? this.#config.matchesLabel(count) : this.#config.noMatchesLabel;
    }

    /** Shows "No matches" when a search has found nothing, and nothing more is coming. */
    #syncEmpty() {
        const view = this.#rowList.view;
        this.#empty.hidden = !(view?.query && !this.#rowList.hasMore && !this.#rowList.rows.length &&
            !this.#config.loading);
    }

    /**
     * Whether a group's rows are folded away: in the sheet, where its header was tapped, while there's no search
     * (which shows every group that has matches unfolded).
     */
    #isFolded(group, view = this.#rowList.view) {
        return Boolean(group) && this.#sheet && !view?.query && this.#folded.has(group);
    }

    /** Folds or unfolds the group of a tapped header, in the sheet while there's no search. */
    #toggleGroup(header) {
        if (!this.#sheet || this.#rowList.view?.query) return;

        const group = [...this.#rowList.groupItems].find(([, li]) => li.firstElementChild === header)?.[0];
        if (group) this.#setFolded(group, !this.#folded.has(group));
    }

    /**
     * Folds or unfolds a group, keeping its header where it was on screen, so what's above it stays put and its rows
     * come and go below it. Browsers that anchor scrolling mostly do this on their own, but not all of them do. In
     * the open sheet the rows fade, and its card and the groups below glide, as they do for a search (see Glide).
     */
    #setFolded(group, folded) {
        const header = this.#rowList.groupItems.get(group)?.firstElementChild;
        const top = header?.getBoundingClientRect().top;
        const taken = this.#takeForGlide();

        if (folded) this.#folded.add(group);
        else this.#folded.delete(group);
        this.reconcile();

        if (header?.isConnected && this.#popover.matches(":popover-open"))
            this.#scroller.scrollTop += header.getBoundingClientRect().top - top;
        this.#playGlide(taken);
    }

    /**
     * Adds to a group's header the count of its selected options, shown while it's folded (see #syncHeader). In the
     * sheet a tap on the header folds the group. Screen readers can't reach the header, and nothing starts folded, so
     * they always get every group unfolded: a listbox may hold only options and groups, which leaves no valid place
     * for a button that folds.
     */
    #createGroup(header) {
        const count = document.createElement("span");
        addClasses(count, "headerCount");
        count.hidden = true;
        header.append(count);
    }

    /**
     * Brings a group's header up to date: its label, whether it's folded (data-folded and the headerFolded plug),
     * and, while it is, how many of its options are selected, so a folded group doesn't hide them.
     */
    #syncHeader(li, group, view = this.#rowList.view) {
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

    /**
     * Makes sure the entry has a row, rendering up to it if need be. Returns false when the entry doesn't
     * match the current search, or is in a folded group, unless `unfold` says to unfold that group.
     */
    ensureRendered(entry, { unfold = false } = {}) {
        const view = this.#rowList.view;
        if (!view?.includes(entry)) return false;
        if (this.#isFolded(entry.group, view)) {
            if (!unfold) return false;
            this.#setFolded(entry.group, false);
        }

        return this.#rowList.ensureRendered(entry);
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
        const rows = this.#rowList;
        const focusedIndex = rows.rows.findIndex(record => record.element === this.#focused());

        rows.reconcile(this.#source.filter(this.#query(), this.#config.locale, !this.#config.loading));
        const view = rows.view;
        this.#syncCounter(this.#config.counter && view.query ? view.count() : undefined);

        // A focused row that went away hands focus to the row that took its place, or to the search box.
        if (focusedIndex >= 0 && !this.#popover.contains(this.#focused()) &&
            this.#popover.matches(":popover-open")) {
            const next = rows.rows[Math.min(focusedIndex, rows.rows.length - 1)];
            (next && !next.entry.disabled ? next.element : this.#firstFocusable())?.focus({ preventScroll: true });
        }
    }

    /**
     * Tab stops at one row of the list, as in a native listbox: the row last focused while it's still shown,
     * otherwise the selected row, otherwise the first.
     */
    #syncTabStop() {
        if (this.#tabStop?.isConnected) return;

        const selected = this.#source.firstSelected;
        this.#setTabStop((this.#rowList.recordOf(selected) ?? this.#rowList.rows[0])?.element ?? null);
    }

    #setTabStop(button) {
        if (this.#tabStop === button) return;
        if (this.#tabStop) this.#tabStop.tabIndex = -1;
        this.#tabStop = button;
        if (button) button.tabIndex = 0;
    }

    /**
     * Makes a row: a button, focusable by the arrow keys rather than Tab (see #syncTabStop), with its content in this
     * order: image, icon, label, subtext, check. The record keeps the parts by name: the label's text node as `text`,
     * the subtext as `small`. The image and icon are made by #updateParts, and only for an option that has one, so a
     * row without stays as it was.
     */
    #createRow() {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "option");
        button.tabIndex = -1;
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
        return { element: button, image: null, icon: null, label, text, small, check, active: undefined, disabled: false };
    }

    /** Brings a row up to date with its entry, writing only what differs. */
    #updateRow(record) {
        const { entry, element } = record;

        this.#updateParts(record);
        if (element.title !== entry.title) element.title = entry.title;

        this.#syncState(record);
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
        const { entry, element } = record;
        const selected = this.#source.isSelected(entry);
        const active = selected && !entry.ownDisabled;
        if (record.active !== active) {
            record.active = active;
            element.setAttribute("aria-selected", active);
            toggleClasses(element, "itemSelected", active);
        }

        // Not the disabled attribute: a disabled row stays focusable, so it can be found, and says it's disabled.
        const disabled = entry.disabled || (this.#full && !selected);
        if (record.disabled !== disabled) {
            record.disabled = disabled;
            toggleClasses(element, "itemDisabled", disabled);
            if (disabled) element.setAttribute("aria-disabled", "true");
            else element.removeAttribute("aria-disabled");
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

    /**
     * Brings the rendered rows up to date with which options are selected. Changes to the options themselves (their
     * text, attributes, or which options there are) go through reconcile() instead.
     */
    refresh() {
        this.#syncFull();
        for (const record of this.#rowList.rows) this.#syncState(record);
        for (const [group, li] of this.#rowList.groupItems) this.#syncHeader(li, group);
    }

    // -----------------------------------------------------------------
    // Highlighting
    // -----------------------------------------------------------------

    #query() {
        return Search.fold(this.#search.value.trim(), this.#config.locale);
    }

    #highlightRow(record, view) {
        const { entry, element, text, small } = record;
        this.#rowList.highlightText(view, element, "text", text);

        const subtext = entry.subtext.toLowerCase();
        if (subtext && subtext !== entry.label.toLowerCase())
            this.#rowList.highlightText(view, element, "subtext", small.firstChild);
    }

    // -----------------------------------------------------------------
    // Focus and scrolling
    // -----------------------------------------------------------------

    /** Whether the entry matches the current search. It may not have been rendered yet. */
    isVisible(entry) {
        return this.#rowList.view?.includes(entry) ?? true;
    }

    isSelectable(entry) {
        return !entry.disabled && this.isVisible(entry);
    }

    /**
     * Called when the popover opens. The selected item is rendered if it wasn't yet and brought into view. Focus
     * goes to the search box when there is one, otherwise to the selected item, otherwise to the first item. With
     * `sheet` true, focus goes to the popover itself: focusing the search box would bring up the on-screen keyboard,
     * and a focused row would show its focus ring to a touch user who has no use for it. Focus is still inside, for
     * Esc and screen readers, and the arrow keys go on from there.
     *
     * A selected item in a folded group stays folded, or opening would unfold every group with a selection each
     * time; its group's header is brought into view instead, with its count of selected options.
     */
    focusInitial({ sheet = false } = {}) {
        this.#rowList.scheduleTopUp(); // The popover has its size now, so the list can fill it.

        const selected = this.#source.firstSelected;
        const selectedButton = selected && this.ensureRendered(selected) ? this.#rowList.recordOf(selected).element : null;
        const header = !selectedButton && selected && this.#isFolded(selected.group)
            ? this.#rowList.renderHeader(selected.group)
            : null;
        if (selectedButton ?? header) this.#rowList.reveal(selectedButton ?? header, true);

        if (sheet) {
            this.#popover.tabIndex = -1;
            this.#popover.focus({ preventScroll: true });
            return;
        }
        this.#popover.removeAttribute("tabindex"); // Left from the sheet, before the screen grew.

        if (!this.#search.hidden) {
            this.#search.focus({ preventScroll: true });
            return;
        }

        const target = selectedButton && !selected.disabled
            ? selectedButton
            : this.#popover.querySelector(".pp-item:not(:disabled, [aria-disabled='true'])");
        target?.focus({ preventScroll: target === selectedButton || Boolean(header) });
    }

    #firstFocusable() {
        return this.#popover.querySelector("input:not([hidden]), .pp-item:not(:disabled, [aria-disabled='true'])");
    }

    scrollIntoView(entry) {
        const button = this.#rowList.recordOf(entry)?.element;
        if (button) this.#rowList.reveal(button, false);
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
        if (this.#folded.size && this.#rowList.view) this.reconcile(); // Folds show only in the sheet.
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

            this.#typeAheadBuffer += Search.fold(e.key, this.#config.locale);
            const match = this.#findTypeAheadMatch(this.#typeAheadBuffer);

            if (match && this.ensureRendered(match, { unfold: true })) {
                this.#rowList.recordOf(match).element.focus();

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
            if (jump && this.#rowList.recordOfElement(e.target)) {
                e.preventDefault();
                this.#jump(e.target, jump);
                return;
            }

            const step = { ArrowDown: 1, ArrowUp: -1 }[e.code];
            if (!step) return;

            const focusable = focusableElements();
            if (!focusable.length) return;

            e.preventDefault();

            // Down from the last rendered row goes on to the next one, rendered first (see RowList.move), so the key
            // never stalls at the end of a longer list.
            const record = step > 0 && e.target === focusable.at(-1) && this.#rowList.recordOfElement(e.target);
            if (record && this.#rowList.hasMore) {
                this.#rowList.move(record, 1)?.element.focus();
                return;
            }

            const index = focusable.indexOf(e.target);
            focusable[Math.min(Math.max(index + step, 0), focusable.length - 1)].focus();
        }, { signal: this.#signal });
    }

    /**
     * Moves focus from a row by pages (-1 or 1, as many rows as fit in the popover) or to an end (-Infinity or
     * Infinity), rendering ahead as far as need be (see RowList.jump).
     */
    #jump(from, pages) {
        const target = this.#rowList.jump(this.#rowList.recordOfElement(from), pages)?.element;
        if (!target) return;

        target.focus({ preventScroll: true });
        this.#rowList.reveal(target, false);
    }
}