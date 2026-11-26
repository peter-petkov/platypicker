"use strict";

import Highlighter from "burrowkit/highlighter.js";
import Languages from "burrowkit/languages.js";
import { addClasses, classes, removeClasses } from "./classes.js";
import translations, { languages } from "./languages.js";
import ListView from "./list-view.js";
import OptionSource from "./option-source.js";
import Sheet from "./sheet.js";
import TagsView from "./tags-view.js";

export default class PlatyPicker extends HTMLElement {
    static #registry = new WeakMap(); // <select> -> PlatyPicker instance

    // While the popover is open, changes to the options are applied once they pause for #reconcileDelay
    // milliseconds, and at least every #reconcileMaxWait milliseconds while they keep coming.
    static #reconcileDelay = 50;
    static #reconcileMaxWait = 250;

    // Select all and select none show a spinner when they change at least this many options. Changing that many can
    // freeze the page for a moment, since the browser does the work in one go.
    static #busyThreshold = 1000;

    /** Resolves once the browser has painted the next frame. */
    static #afterPaint() {
        return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve)));
    }

    /** How many rows are rendered at a time. A batch-size attribute on the element overrides it. */
    static defaultBatchSize = 50;

    /**
     * The media query under which a picker with layout="auto" (the default) opens as a sheet at the bottom of the
     * screen rather than a popover by its select: a touch screen the size of a phone, either way up. A phone on its
     * side is too wide for the width alone to tell, but it's short. It's checked each time a picker opens, so it
     * follows a rotated phone or a resized window.
     */
    static sheetMedia = "(pointer: coarse) and ((max-width: 640px) or (max-height: 500px))";

    /**
     * The extra classes each part gets, on top of its fixed pp-* class. A preset fills these with a framework's
     * classes, and must be imported before any picker is created. See classes.js for the parts.
     */
    static classes = classes;

    /**
     * The texts, in English, for pickers whose language has no translation, and for whatever a language leaves out.
     * See languages.js.
     */
    static languageMap = {
        searchPlaceholder: "Type to filter...",
        searchLabel: "Search",
        selectAllLabel: "All",
        selectNoneLabel: "None",
        removeLabel: "Remove",
        noMatchesLabel: "No matches",
        // What screen readers hear once typing in the search box pauses: how many options match.
        matchesLabel: { one: "{count} match", other: "{count} matches" },
        // The counter under the list (the counter attribute): how many rows of all the options are shown so far, how
        // many options are loaded while more are on their way, and how many match a search, of how many.
        shownLabel: "{count} of {total} shown",
        loadedLabel: { one: "{count} option so far", other: "{count} options so far" },
        filteredLabel: "{count} of {total}",
        // Under the sheet's title (layout="sheet") in a multiple select: how many options are selected.
        selectedLabel: "{count} selected",
        // The same with a limit (the max attribute), and what screen readers hear when the limit is reached.
        selectedOfMaxLabel: "{count} of {max} selected",
        limitReachedLabel: "Limit of {max} reached",
        // Beside the sheet's search box while searching: clears the search and puts the keyboard away.
        cancelLabel: "Cancel",
    };

    /**
     * Languages of the page's own, by code ("de", "pt-BR"): each an object of texts like languageMap. A picker uses
     * the one of its nearest lang attribute, over Platypicker's own translation of it, if there is one.
     */
    static languages = languages;

    static get(select) {
        return PlatyPicker.#registry.get(select);
    }

    // What the picker needs: anchor positioning with anchor-scope, which keeps each popover on its own select, and
    // the popover attribute, as platypicker.css checks too. Browsers without them keep the plain select. base-select
    // is used where there is one (see #wireSelect).
    static #isSupported = CSS.supports("anchor-scope", "all") && CSS.supports("selector(:popover-open)");
    static #hasBaseSelect = CSS.supports("appearance", "base-select");
    static #multipleIsListBox;


    static observedAttributes = [
        "search",
        "controls",
        "counter",
        "placeholders",
        "batch-size",
        "placeholder",
        "loading",
        "layout",
        "max",
    ];

    #internals;
    #select;
    #source;
    #highlighter;
    #view;
    #tags = null;               // The badges over a closed multiple select. Single selects have none.
    #sheet;                     // What the popover does as the sheet (layout="sheet").
    #tagsTimer;
    #abort;
    #typed = "";                // What was typed on a closed multiple select in the last second (see #selectByKey).
    #typedTimer;
    #locale = "";               // The picker's language: its nearest lang attribute.
    #texts = null;              // The texts for it, as far as they're loaded.
    #stale = false;             // Whether the options changed since the list last caught up with them.
    #staleSince = null;         // When the first of those changes came in.
    #reconcileTimer;
    #listBoxAnchored = false;   // Whether Safari's list box has an option to stay at (see #repaintListBox).

    constructor() {
        super();
        this.#internals = this.attachInternals();

        // TODO for server side:
        //  Let's say we have a limit of 100 visible entries.
        //   1. Initially retrieve double the amount (200), only show 100
        //   2. Proportionally to how close the user scrolls to the end, reveal more of the remaining 100 (see Excel)
        //   3. Once a threshold is passed (say 50 or 33%), retrieve the next 100 and store them.
        //   4. On filter, send the request with the filter string and repeat the process above
    }

    // -----------------------------------------------------------------
    // Custom element lifecycle
    // -----------------------------------------------------------------

    connectedCallback() {
        this.#select = this.querySelector(":scope > select");

        // Defined by a plain script in the head, the element connects while the page is still being read, before its
        // select is, so it waits for the rest of the page.
        if (!this.#select && document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => this.isConnected && this.connectedCallback(),
                { once: true });
            return;
        }

        if (!this.#select || PlatyPicker.#registry.has(this.#select)) return;

        if (!PlatyPicker.#isSupported) return; // graceful degradation: leave the native <select> untouched

        this.#abort = new AbortController();
        this.#syncLanguage();

        addClasses(this, "host");
        addClasses(this.#select, "select");

        this.#source = new OptionSource(this.#select);
        this.#highlighter = new Highlighter("platypicker-highlight");
        this.#view = new ListView({
            select: this.#select,
            source: this.#source,
            highlighter: this.#highlighter,
            signal: this.#abort.signal,
            actions: {
                activate: entry => this.#activate(entry),
                selectAll: () => this.#selectAll(),
                selectNone: () => this.#selectNone(),
                close: () => this.#close(),
                // detail: { search, batchSize }, the search the options are for and a sensible page size.
                loadMore: detail => this.dispatchEvent(new CustomEvent("loadmore", { bubbles: true, detail })),
                full: full => this.#internals.states[full ? "add" : "delete"]("full"),
            },
        });

        this.#view.configure(this.#viewConfig());
        this.#view.render();

        this.#sheet = new Sheet({
            ...this.#view.sheetParts,
            clearSearch: () => this.#view.clearSearch(),
            // By a drag or Back. Escape may have closed it already, as Back's watcher sees Escape too.
            close: () => this.#view.popover.matches(":popover-open") && this.#close(),
            signal: this.#abort.signal,
        });

        // The select tells screen readers that it opens the popover, and whether it's open.
        this.#select.setAttribute("aria-haspopup", "dialog");
        this.#select.setAttribute("aria-controls", this.#view.popover.id);
        this.#select.setAttribute("aria-expanded", "false");

        if (this.#select.multiple && this.#select.size <= 1) {
            this.#tags = new TagsView({
                select: this.#select,
                signal: this.#abort.signal,
                actions: { remove: option => this.#remove(option) },
            });
            this.#tags.configure(this.#tagsConfig());
        }

        this.#wireSelect();
        this.#syncNative(true);
        this.#source.observe(() => this.#optionsChanged());

        PlatyPicker.#registry.set(this.#select, this);
    }

    disconnectedCallback() {
        if (!this.#select || !PlatyPicker.#registry.has(this.#select)) return;

        this.#abort.abort();
        clearTimeout(this.#reconcileTimer);
        clearTimeout(this.#tagsTimer);
        this.#source.disconnect();
        this.#highlighter.clear();
        this.#view.destroy();
        this.#tags?.destroy();

        PlatyPicker.#registry.delete(this.#select);

        removeClasses(this.#select, "select");
        removeClasses(this, "host");
        for (const name of ["aria-haspopup", "aria-controls", "aria-expanded"]) this.#select.removeAttribute(name);

        this.#select = this.#source = this.#highlighter = this.#view = this.#tags = this.#sheet = null;
    }

    attributeChangedCallback() {
        if (!this.#view) return; // not connected yet; the initial render reads the attributes directly

        this.#view.configure(this.#viewConfig());
        this.#tags?.configure(this.#tagsConfig());
        this.#syncNative(); // layout may have changed.
        if (this.#view.popover.matches(":popover-open")) {
            this.#syncLayout();
            this.#syncSelectedCount();
        }
    }

    setValue(value) {
        if (!this.#select) return;

        this.#source.setValue(value);
        this.#view.refresh();
        this.#tags?.refresh();
        this.#syncSelectedCount();
    }

    // -----------------------------------------------------------------
    // Public attribute accessors
    // -----------------------------------------------------------------

    get search() {
        return this.hasAttribute("search");
    }

    set search(value) {
        this.toggleAttribute("search", Boolean(value));
    }

    get controls() {
        return this.hasAttribute("controls");
    }

    set controls(value) {
        this.toggleAttribute("controls", Boolean(value));
    }

    /** Shows how many options there are, or how many match the search, under the list. */
    get counter() {
        return this.hasAttribute("counter");
    }

    set counter(value) {
        this.toggleAttribute("counter", Boolean(value));
    }

    get placeholders() {
        if (!this.hasAttribute("placeholders")) return undefined;

        const value = this.getAttribute("placeholders");

        // Handle boolean true or empty string (attribute present without value)
        if (value === "" || value === "true") return 10;

        // Handle boolean false
        if (value === "false") return undefined;

        // Handle integer values
        const parsed = parseInt(value, 10);
        if (!isNaN(parsed) && parsed >= 0 && value === String(parsed)) return parsed;

        // Invalid value, treat as disabled
        return undefined;
    }

    set placeholders(value) {
        this.setAttribute("placeholders", value);
    }

    /**
     * How many options the list works with at a time: the rows shown first, how far ahead it searches, and the page
     * size loadmore suggests. More rows are shown a few at a time as the user scrolls. 0 turns batching off, and a
     * missing or invalid value means the default.
     */
    get batchSize() {
        const value = this.getAttribute("batch-size")?.trim();

        return /^\d+$/.test(value ?? "") ? Number(value) : PlatyPicker.defaultBatchSize;
    }

    set batchSize(value) {
        this.setAttribute("batch-size", value);
    }

    /**
     * Says that more options are on their way, as when the page fetches them as the user scrolls. While it's set,
     * the end of the list stays marked (with the skeleton rows, if there are any), and a loadmore event asks for more
     * as soon as fewer than a batch are left to show, and again whenever the end comes into view.
     */
    get loading() {
        return this.hasAttribute("loading");
    }

    set loading(value) {
        this.toggleAttribute("loading", Boolean(value));
    }

    /** Shown in a multiple select while nothing is selected. */
    get placeholder() {
        return this.getAttribute("placeholder") ?? "";
    }

    set placeholder(value) {
        this.setAttribute("placeholder", value);
    }

    /**
     * How the picker opens: "popover" by its select, "sheet" at the bottom of the screen, "auto" (the default), a
     * sheet where PlatyPicker.sheetMedia matches and a popover elsewhere, or "native", the browser's own picker,
     * which shows only the options in the select and never asks for more (loadmore). A missing or invalid value
     * means "auto".
     */
    get layout() {
        const value = this.getAttribute("layout")?.trim().toLowerCase();

        return ["sheet", "popover", "native"].includes(value) ? value : "auto";
    }

    set layout(value) {
        this.setAttribute("layout", value);
    }

    /**
     * How many options a multiple select takes at most. Once that many are selected, the others can't be picked
     * until one is unpicked, and the picker has the custom state full. It only stops the user: what markup or script
     * selects is left as it is, even over the limit. Selected options that are disabled don't count. A missing or
     * invalid value, or one under 1, means no limit (undefined). Single selects and layout="native" ignore it.
     */
    get max() {
        const value = this.getAttribute("max")?.trim();

        return /^\d+$/.test(value ?? "") && Number(value) >= 1 ? Number(value) : undefined;
    }

    set max(value) {
        if (value === undefined || value === null) this.removeAttribute("max");
        else this.setAttribute("max", value);
    }

    #viewConfig() {
        return {
            search: this.search,
            controls: this.controls,
            counter: this.counter,
            searchPlaceholder: this.#text("searchPlaceholder"),
            searchLabel: this.#text("searchLabel"),
            selectAllLabel: this.#text("selectAllLabel"),
            selectNoneLabel: this.#text("selectNoneLabel"),
            cancelLabel: this.#text("cancelLabel"),
            noMatchesLabel: this.#text("noMatchesLabel"),
            matchesLabel: count => Languages.format(this.#text("matchesLabel"), count, this.#locale),
            limitReachedLabel: max => Languages.format(this.#text("limitReachedLabel"), max, this.#locale, { max }),
            counterLabel: ({ shown, matches, total, search, loading }) => search
                ? Languages.format(this.#text("filteredLabel"), matches, this.#locale, { total })
                : loading
                    ? Languages.format(this.#text("loadedLabel"), total, this.#locale)
                    : Languages.format(this.#text("shownLabel"), shown, this.#locale, { total }),
            placeholders: this.placeholders,
            batchSize: this.batchSize,
            loading: this.loading,
            max: this.#select.multiple ? this.max : undefined,
            locale: this.#locale,
        };
    }

    #tagsConfig() {
        return {
            placeholder: this.placeholder,
            removeLabel: this.#text("removeLabel"),
            formatCount: count => `+${Languages.number(count, this.#locale)}`,
        };
    }

    #text(name) {
        return (this.#texts ?? PlatyPicker.languageMap)[name];
    }

    /**
     * Takes the texts of the picker's language, as far as they're loaded, and again once a translation it waits for
     * has loaded. Runs when the picker connects and each time the popover opens, which is when a changed lang
     * attribute is picked up.
     */
    #syncLanguage() {
        const locale = Languages.of(this);
        const { texts, ready } = translations.texts(locale, PlatyPicker.languageMap);

        this.#locale = locale;
        this.#texts = texts;
        if (this.#view) {
            this.#view.configure(this.#viewConfig());
            this.#tags?.configure(this.#tagsConfig());
            this.#syncSelectedCount();
        }

        ready?.then(() => {
            if (this.#view && Languages.of(this) === locale) this.#syncLanguage();
        });
    }

    // -----------------------------------------------------------------
    // What the user does in the list
    // -----------------------------------------------------------------

    #activate(entry) {
        if (this.#select.multiple) {
            const selected = this.#source.isSelected(entry);

            // The list marks the other rows once max is reached, but only a frame after the change (see #wireSelect).
            const max = this.max;
            if (!selected && max !== undefined && this.#source.selectedCount >= max) return;

            this.#source.setSelected(entry, !selected);
        } else {
            this.#source.selectOnly(entry);
            this.#view.refresh();
            this.#hidePopover();
        }

        this.#view.scrollIntoView(entry);
        if (!this.#select.multiple) this.#select.focus();
        this.#select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    async #selectAll() {
        this.#catchUp(); // A change to the options may still be waiting, and select all must see it.

        const entries = this.#source.entries.filter(entry => this.#view.isSelectable(entry));
        if (await this.#runBulk("selectAll", entries.length, () => this.#source.select(entries)))
            this.#select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    async #selectNone() {
        if (await this.#runBulk("selectNone", this.#select.selectedOptions.length, () => this.#source.clear()))
            this.#select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    /**
     * Runs a change to many options. A large one freezes the page while the browser makes it, so the button first
     * shows a spinner, and the change is only made once that has been painted. Returns false when the picker was
     * removed in the meantime, in which case nothing was changed.
     */
    async #runBulk(action, count, change) {
        if (count < PlatyPicker.#busyThreshold) {
            change();
            return true;
        }

        const view = this.#view;
        view.setBusy(action, true);

        try {
            await PlatyPicker.#afterPaint();
            if (this.#view !== view) return false;

            change();
            return true;
        } finally {
            view.setBusy(action, false);
        }
    }

    /** Deselects the option of a badge whose remove button was clicked. */
    #remove(option) {
        option.selected = false;
        this.#tags.refresh();
        this.#view.refresh();
        this.#select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    #close() {
        this.#hidePopover();
        this.#select.focus();
    }

    /**
     * The keys Chrome's closed multiple select acts on, done as it does them, for a multiple select without
     * base-select. That's a list box with its options hidden (see platypicker.css), and a list box skips hidden
     * options. A letter selects the next option starting with what was typed in the last second, the same letter
     * again the one after; Home and End select the first and last option, the page keys the next and previous
     * one. Each replaces the selection, firing input and change as the select would. Select all does nothing, as in
     * Chrome. Returns whether the key was one of these.
     */
    #selectByKey(e) {
        if ((e.ctrlKey || e.metaKey) && e.code === "KeyA") return true;

        const entries = this.#source.entries.filter(entry => !entry.disabled);
        const current = entries.findIndex(entry => entry.option.selected);
        let target;

        if (e.code === "Home") target = entries[0];
        else if (e.code === "End") target = entries.at(-1);
        else if (e.code === "PageDown") target = entries[Math.min(current + 1, entries.length - 1)];
        else if (e.code === "PageUp") target = entries[Math.max(current - 1, 0)];
        else if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const key = e.key.toLocaleLowerCase(this.#locale || undefined);
            clearTimeout(this.#typedTimer);
            this.#typedTimer = setTimeout(() => this.#typed = "", 1000);
            this.#typed += key;

            // The same letter over and over moves through the options starting with it; more letters narrow down,
            // starting at the selected option itself.
            const repeated = [...this.#typed].every(letter => letter === key);
            const prefix = repeated ? key : this.#typed;
            const start = repeated ? current + 1 : Math.max(current, 0);
            const startsWith = entry => entry.label.toLocaleLowerCase(this.#locale || undefined).startsWith(prefix);

            target = entries.slice(start).find(startsWith) ?? entries.slice(0, start).find(startsWith);
        } else {
            return false;
        }

        if (!target || (target.option.selected && this.#select.selectedOptions.length === 1)) return true;

        this.#source.selectOnly(target);
        this.#select.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        this.#select.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
    }

    /**
     * The select's label, for the popover's: from aria-labelledby, aria-label or its <label>s, in that order, as
     * screen readers name it. A picker inside a label adds none of its own text: not its options, popover or badges.
     */
    #label() {
        const select = this.#select;
        const textOf = node => node.nodeType === Node.TEXT_NODE ? node.data
            : node.localName === "select" || node.localName === "platy-picker" ? ""
                : [...node.childNodes].map(textOf).join("");

        const ids = select.getAttribute("aria-labelledby")?.trim();
        const root = select.getRootNode();
        const label = ids
            ? ids.split(/\s+/).map(id => root.getElementById?.(id)).filter(Boolean).map(textOf).join(" ")
            : select.getAttribute("aria-label") ?? [...select.labels].map(textOf).join(" ");

        return label.replace(/\s+/g, " ").trim();
    }

    // -----------------------------------------------------------------
    // Select interaction (open/close, outside click, focus)
    // -----------------------------------------------------------------

    /**
     * Whether the browser draws a closed multiple select (size 1) as a one-row list box, as Firefox and Safari do,
     * rather than as a button whose list is its picker, as Chrome does. Having base-select doesn't tell: Safari 27
     * has it and still draws a list box. So it's measured, once, on a hidden select: a list box lays its options out,
     * where a button lays out none until its picker opens. The option's display is set, so the page's CSS can't
     * hide it.
     *
     * Then whether the list box lays its options out even when they're display: none, as Safari does, where Firefox
     * leaves them out. Safari also paints them with the style they had when it last worked it out, which it doesn't
     * do again when platypicker.css hides them (see #repaintListBox).
     */
    static get #listBox() {
        if (!PlatyPicker.#multipleIsListBox) {
            const probe = document.createElement("select");
            const option = new Option("a");
            probe.multiple = true;
            probe.size = 1;
            probe.append(option);
            probe.style.cssText = "position: fixed !important; visibility: hidden !important; pointer-events: none";
            option.style.cssText = "display: block !important";
            document.documentElement.append(probe);

            const drawn = option.getBoundingClientRect().height > 0;
            option.style.cssText = "display: none !important";

            PlatyPicker.#multipleIsListBox = {
                drawn,
                keepsHidden: drawn && option.getBoundingClientRect().height > 0,
            };
            probe.remove();
        }

        return PlatyPicker.#multipleIsListBox;
    }

    static get #isListBox() {
        return PlatyPicker.#listBox.drawn;
    }

    /**
     * Has Safari paint a closed multiple select's rows again, from their current style, by building the select's
     * box anew. It paints them from the style they had when last worked out, and hiding or showing them by
     * platypicker.css doesn't make it work that out again, so without this they stay painted, or hidden, until the
     * user scrolls or picks something.
     *
     * Meanwhile the first option is picked and unpicked, which leaves the selection as it was. Safari scrolls a list
     * box to the first option a script changes, and to that one each time after, and on a Mac a scroll shows the
     * list box's scrollbar for a moment, which nothing hides. The first option is in view, so the list box doesn't
     * scroll then, nor for the picks that follow. (After a group label, it's a row down, so the first pick still
     * scrolls once.)
     */
    #repaintListBox() {
        const select = this.#select;
        if (!select.multiple || select.size > 1 || !PlatyPicker.#listBox.keepsHidden) return;

        const focused = select.getRootNode().activeElement === select;
        const display = select.style.getPropertyValue("display");
        const priority = select.style.getPropertyPriority("display");

        select.style.setProperty("display", "none", "important");
        void select.offsetHeight; // The box is dropped here, and built anew below.

        const first = select.options[0];
        if (first) {
            first.selected = !first.selected;
            first.selected = !first.selected;
            this.#listBoxAnchored = true;
        }

        select.style.setProperty("display", display, priority);

        if (focused) select.focus({ preventScroll: true });
    }

    /**
     * Whether the select's own presses and keys would act on it in place, or open a picker of its own, rather than
     * leave the opening to Platypicker: a multiple select drawn as a list box, or a single select without
     * base-select, an ordinary dropdown. Then the script takes them over.
     */
    get #selectActsOnItsOwn() {
        return this.#select.multiple ? PlatyPicker.#isListBox : !PlatyPicker.#hasBaseSelect;
    }

    #wireSelect() {
        const { signal } = this.#abort;
        const popover = this.#view.popover;

        // With layout="native" the select is left to the browser: its presses, clicks and keys open its own picker.
        const native = () => this.#internals.states.has("native");

        this.#select.addEventListener("click", () => native() || this.#togglePopover(), { signal });

        this.#select.addEventListener("keydown", e => {
            if (native()) return;

            // A multiple select drawn as a list box would act on its own keys where they can't be seen (see
            // #selectByKey).
            if (this.#select.multiple && PlatyPicker.#isListBox && this.#selectByKey(e)) {
                e.preventDefault();
                return;
            }

            if (!["Enter", "Space", "ArrowDown", "ArrowUp", "F4"].includes(e.code)) return;

            // These would open the select's own dropdown, or change its value in place.
            if (this.#selectActsOnItsOwn) e.preventDefault();
            this.#togglePopover(true);
        }, { capture: true, signal });

        // A press would open the select's own dropdown, or pick a list box's row, so it's stopped, and the select
        // focused by hand, as stopping the press keeps focus from moving. The click that follows opens the popover.
        if (this.#selectActsOnItsOwn) {
            this.#select.addEventListener("mousedown", e => {
                if (e.button !== 0 || native()) return;
                e.preventDefault();
                this.#select.focus({ preventScroll: true });
            }, { signal });

            // A tap opens the browser's own picker on its own, which stopping the press doesn't prevent: Firefox for
            // Android shows a dialog of the options, empty for a multiple select, whose options aren't laid out.
            // So a tap is taken over. Stopping its touchend stops the press and the click the browser would make of
            // it, and the popover opens as the click would have opened it. A touch that moves is a scroll, left be.
            let touch = null;
            this.#select.addEventListener("touchstart", e => {
                touch = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
            }, { passive: true, signal });

            this.#select.addEventListener("touchend", e => {
                const start = touch;
                touch = null;
                if (!start || native() || !e.cancelable) return;

                const end = e.changedTouches[0];
                if (Math.hypot(end.clientX - start.x, end.clientY - start.y) > 10) return;

                e.preventDefault();
                this.#select.focus({ preventScroll: true });
                this.#togglePopover();
            }, { signal });
        }

        // The popover closes when focus leaves the picker, as by Tab past its end. Back to the select it stays open,
        // so that clicking the select toggles it rather than closing and reopening it. Focus going nowhere (another
        // window, or a click on the page, which the click listener below handles) leaves it open too.
        popover.addEventListener("focusout", e => {
            if (e.relatedTarget && !this.contains(e.relatedTarget)) this.#hidePopover();
        }, { signal });

        this.#select.addEventListener("change", async () => {
            if (!this.#select.options.length) return;
            await new Promise(resolve => requestAnimationFrame(resolve)); // let in-flight option mutations settle
            this.#view?.refresh();
            this.#tags?.refresh();
            this.#syncSelectedCount();
        }, { signal });

        // A form reset changes the selection without a change event, and only once the reset event has run.
        this.#select.form?.addEventListener("reset", () => setTimeout(() => this.#tags?.refresh()), { signal });

        // By the composed path, so that a click on a picker inside a shadow root counts as a click on it.
        document.addEventListener("click", e => {
            if (popover.matches(":popover-open") && !e.composedPath().includes(this))
                this.#hidePopover();
        }, { signal });

        document.addEventListener("keydown", e => {
            if (e.code === "Escape" && popover.matches(":popover-open"))
                this.#hidePopover();
        }, { signal });

        // Runs right before the popover shows, whatever opened it, so it never shows a stale list.
        popover.addEventListener("beforetoggle", e => {
            if (e.newState !== "open") return;

            this.#catchUp();
            this.#view.trim();
            this.#view.refresh(); // Picks up selection changes that fire no change event, like select.value = x.
            this.#view.setLabel(this.#label()); // The label may have changed since the last time.
            this.#syncLayout(); // So may the screen, for the sheet.
            this.#syncLanguage(); // And the language. This also counts the selected options for the sheet.
        }, { signal });

        popover.addEventListener("toggle", e => {
            this.#internals.states[e.newState === "open" ? "add" : "delete"]("open");
            this.#select.setAttribute("aria-expanded", e.newState === "open");
            this.#tags?.refresh(); // Catches selection changes that fire no change event, like select.value = x.

            if (e.newState === "open") {
                this.#view.syncControls();
                this.#view.focusInitial({ search: !this.#internals.states.has("sheet") });
                this.#sheet.rise(); // Once the list has scrolled to the selected row.
            } else {
                this.#sheet.close();
            }
        }, { signal });
    }

    // -----------------------------------------------------------------
    // Keeping up with changes to the options
    // -----------------------------------------------------------------

    /**
     * Called for every change to the options. While the popover is closed nothing is done until it opens. While it
     * is open, a burst of changes is applied once it pauses, and at least every #reconcileMaxWait milliseconds.
     */
    #optionsChanged() {
        // A select that had no options yet gets its first one for the list box to stay at (see #repaintListBox).
        if (!this.#listBoxAnchored && this.#select.options.length) this.#repaintListBox();

        this.#stale = true;
        this.#scheduleTagsRefresh();
        if (!this.#view.popover.matches(":popover-open")) return;

        const now = performance.now();
        this.#staleSince ??= now;

        clearTimeout(this.#reconcileTimer);
        this.#reconcileTimer = setTimeout(() => this.#catchUp(),
            Math.max(0, Math.min(PlatyPicker.#reconcileDelay, this.#staleSince + PlatyPicker.#reconcileMaxWait - now)));
    }

    /**
     * The badges show while the popover is closed, so unlike the list they can't wait for it to open. They read the
     * select directly, and a burst of changes to the options updates them once.
     */
    #scheduleTagsRefresh() {
        if (!this.#tags) return;

        clearTimeout(this.#tagsTimer);
        this.#tagsTimer = setTimeout(() => this.#tags?.refresh(), PlatyPicker.#reconcileDelay);
    }

    /** Applies pending changes to the options, if there are any. */
    #catchUp() {
        clearTimeout(this.#reconcileTimer);
        this.#staleSince = null;

        if (!this.#view) return;
        if (this.#source.takePendingChanges()) this.#stale = true;
        if (!this.#stale) return;

        this.#stale = false;
        this.#source.rebuild();
        this.#view.reconcile();
    }

    /**
     * Decides between the sheet and the popover (see layout), as the custom state sheet, which platypicker.css styles
     * the popover by. Runs as the popover opens, and when the layout attribute changes while it's open.
     */
    #syncLayout() {
        const layout = this.layout;
        const sheet = layout === "sheet" || (layout === "auto" && matchMedia(PlatyPicker.sheetMedia).matches);
        this.#internals.states[sheet ? "add" : "delete"]("sheet");
        this.#view.setSheet(sheet);
        if (sheet) this.#sheet.open();
        else this.#sheet.close();
    }

    /**
     * Tells the sheet's heading how many options are selected, in a multiple select, and of how many with a max (where
     * disabled ones don't count, as for the limit). Only the sheet shows the count, so the popover doesn't count them;
     * counting the selected options of a long select takes a moment.
     */
    #syncSelectedCount() {
        if (!this.#select.multiple || !this.#internals.states.has("sheet")) {
            this.#view.setSelectedCount("", 0);
            return;
        }

        const max = this.max;
        const count = max === undefined ? this.#select.selectedOptions.length : this.#source.selectedCount;
        const text = max === undefined
            ? Languages.format(this.#text("selectedLabel"), count, this.#locale)
            : Languages.format(this.#text("selectedOfMaxLabel"), count, this.#locale, { max });
        this.#view.setSelectedCount(text, count);
    }

    /** Whether the browser's own picker opens rather than the popover: layout="native". */
    get #isNative() {
        return this.layout === "native";
    }

    /**
     * Steps aside for the browser's own picker, or back, as the native state, which platypicker.css lets the
     * browser's picker show by. It's decided ahead of any press, since the browser opens its picker on the press
     * itself. The select only says it opens the popover while it does.
     */
    #syncNative(connecting = false) {
        const native = this.#isNative;
        const changed = native !== this.#internals.states.has("native");
        this.#internals.states[native ? "add" : "delete"]("native");

        // The select's rows were just hidden by platypicker.css, as it was enhanced, or shown or hidden again.
        if (connecting || changed) this.#repaintListBox();

        if (native) {
            this.#hidePopover();
            for (const name of ["aria-haspopup", "aria-controls", "aria-expanded"]) this.#select.removeAttribute(name);
        } else if (!this.#select.hasAttribute("aria-haspopup")) {
            this.#select.setAttribute("aria-haspopup", "dialog");
            this.#select.setAttribute("aria-controls", this.#view.popover.id);
            this.#select.setAttribute("aria-expanded", "false");
            this.#tags?.refresh(); // Hidden while native, so they're measured again.
        }
    }

    #togglePopover(forceOpen = false) {
        const popover = this.#view.popover;
        const willOpen = forceOpen || !popover.matches(":popover-open");
        if (willOpen) popover.togglePopover(true);
        else this.#hidePopover();
        if (!willOpen) this.#select.focus();
    }

    /** Hides the popover. As the sheet, it may slide down before it hides (see Sheet's hide). */
    #hidePopover() {
        this.#sheet.hide();
    }
}

customElements.define("platy-picker", PlatyPicker);