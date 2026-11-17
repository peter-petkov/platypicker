"use strict";

import Highlighter from "./highlighter.js";
import ListView from "./list-view.js";
import OptionSource from "./option-source.js";

// While the popover is open, changes to the options are applied once they pause for RECONCILE_DELAY milliseconds,
// and at least every RECONCILE_MAX_WAIT milliseconds while they keep coming.
const RECONCILE_DELAY = 50;
const RECONCILE_MAX_WAIT = 250;

// Select all and select none show a spinner when they change at least this many options. Changing that many can
// freeze the page for a moment, since the browser does the work in one go.
const BUSY_THRESHOLD = 1000;

/** Resolves once the browser has painted the next frame. */
const afterPaint = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve)));

export default class PlatyPicker extends HTMLElement {
    static #registry = new WeakMap(); // <select> -> PlatyPicker instance

    static get maxHighlights() {
        return Highlighter.maxHighlights;
    }

    static set maxHighlights(value) {
        Highlighter.maxHighlights = value;
    }

    /** How many rows are rendered at a time. A batch-size attribute on the element overrides it. */
    static defaultBatchSize = 50;

    static languageMap = {
        searchPlaceholder: "Type to filter...",
        selectAllLabel: "Select all",
        selectNoneLabel: "Select none",
    };

    static get(select) {
        return PlatyPicker.#registry.get(select);
    }

    static #isSupported = CSS.supports("appearance", "base-select");

    static observedAttributes = [
        "search",
        "controls",
        "search-placeholder",
        "select-all-label",
        "select-none-label",
        "placeholders",
        "batch-size",
    ];

    #internals;
    #select;
    #source;
    #highlighter;
    #view;
    #abort;
    #stale = false;             // Whether the options changed since the list last caught up with them.
    #staleSince = null;         // When the first of those changes came in.
    #reconcileTimer;

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
        if (!this.#select || PlatyPicker.#registry.has(this.#select)) return;

        if (!PlatyPicker.#isSupported) return; // graceful degradation: leave the native <select> untouched

        this.#abort = new AbortController();

        this.classList.add("dropdown");
        this.#select.classList.add("platypicker");

        this.#source = new OptionSource(this.#select);
        this.#highlighter = new Highlighter();
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
            },
        });

        this.#view.configure(this.#viewConfig());
        this.#view.render();

        this.#wireSelect();
        this.#source.observe(() => this.#optionsChanged());

        PlatyPicker.#registry.set(this.#select, this);
    }

    disconnectedCallback() {
        if (!this.#select || !PlatyPicker.#registry.has(this.#select)) return;

        this.#abort.abort();
        clearTimeout(this.#reconcileTimer);
        this.#source.disconnect();
        this.#highlighter.clear();
        this.#view.destroy();

        PlatyPicker.#registry.delete(this.#select);

        this.#select.classList.remove("platypicker");
        this.classList.remove("dropdown");

        this.#select = this.#source = this.#highlighter = this.#view = null;
    }

    attributeChangedCallback() {
        if (!this.#view) return; // not connected yet; the initial render reads the attributes directly

        this.#view.configure(this.#viewConfig());
    }

    setValue(value) {
        if (!this.#select) return;

        this.#source.setValue(value);
        this.#view.refresh();
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
     * How many rows are rendered at a time, the next batch following as the user scrolls down. 0 turns batching off,
     * and a missing or invalid value means the default.
     */
    get batchSize() {
        const value = this.getAttribute("batch-size")?.trim();

        return /^\d+$/.test(value ?? "") ? Number(value) : PlatyPicker.defaultBatchSize;
    }

    set batchSize(value) {
        this.setAttribute("batch-size", value);
    }

    get searchPlaceholder() {
        return this.getAttribute("search-placeholder") ?? PlatyPicker.languageMap.searchPlaceholder;
    }

    set searchPlaceholder(value) {
        this.setAttribute("search-placeholder", value);
    }

    get selectAllLabel() {
        return this.getAttribute("select-all-label") ?? PlatyPicker.languageMap.selectAllLabel;
    }

    set selectAllLabel(value) {
        this.setAttribute("select-all-label", value);
    }

    get selectNoneLabel() {
        return this.getAttribute("select-none-label") ?? PlatyPicker.languageMap.selectNoneLabel;
    }

    set selectNoneLabel(value) {
        this.setAttribute("select-none-label", value);
    }

    #viewConfig() {
        return {
            search: this.search,
            controls: this.controls,
            searchPlaceholder: this.searchPlaceholder,
            selectAllLabel: this.selectAllLabel,
            selectNoneLabel: this.selectNoneLabel,
            placeholders: this.placeholders,
            batchSize: this.batchSize,
        };
    }

    // -----------------------------------------------------------------
    // What the user does in the list
    // -----------------------------------------------------------------

    #activate(entry) {
        if (this.#select.multiple) {
            this.#source.setSelected(entry, !this.#source.isSelected(entry));
        } else {
            this.#source.selectOnly(entry);
            this.#view.refresh();
            this.#view.popover.hidePopover();
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
        if (count < BUSY_THRESHOLD) {
            change();
            return true;
        }

        const view = this.#view;
        view.setBusy(action, true);

        try {
            await afterPaint();
            if (this.#view !== view) return false;

            change();
            return true;
        } finally {
            view.setBusy(action, false);
        }
    }

    #close() {
        this.#view.popover.hidePopover();
        this.#select.focus();
    }

    // -----------------------------------------------------------------
    // Select interaction (open/close, outside click, focus)
    // -----------------------------------------------------------------

    #wireSelect() {
        const { signal } = this.#abort;
        const popover = this.#view.popover;

        this.#select.addEventListener("click", () => this.#togglePopover(), { signal });

        this.#select.addEventListener("keydown", e => {
            if (e.code === "Enter" || e.code === "Space" || e.code === "ArrowDown")
                this.#togglePopover(true);
        }, { capture: true, signal });

        this.#select.addEventListener("change", async () => {
            if (!this.#select.options.length) return;
            await new Promise(resolve => requestAnimationFrame(resolve)); // let in-flight option mutations settle
            this.#view?.refresh();
        }, { signal });

        document.addEventListener("click", e => {
            if (popover.matches(":popover-open") && !popover.contains(e.target) && !this.contains(e.target))
                popover.hidePopover();
        }, { signal });

        document.addEventListener("keydown", e => {
            if (e.code === "Escape" && popover.matches(":popover-open"))
                popover.hidePopover();
        }, { signal });

        // Runs right before the popover shows, whatever opened it, so it never shows a stale list.
        popover.addEventListener("beforetoggle", e => {
            if (e.newState !== "open") return;

            this.#catchUp();
            this.#view.refresh(); // Picks up selection changes that fire no change event, like select.value = x.
        }, { signal });

        popover.addEventListener("toggle", e => {
            this.#internals.states[e.newState === "open" ? "add" : "delete"]("open");

            if (e.newState === "open") {
                this.#view.syncControls();
                this.#view.focusInitial();
            }
        }, { signal });
    }

    // -----------------------------------------------------------------
    // Keeping up with changes to the options
    // -----------------------------------------------------------------

    /**
     * Called for every change to the options. While the popover is closed nothing is done until it opens. While it
     * is open, a burst of changes is applied once it pauses, and at least every RECONCILE_MAX_WAIT milliseconds.
     */
    #optionsChanged() {
        this.#stale = true;
        if (!this.#view.popover.matches(":popover-open")) return;

        const now = performance.now();
        this.#staleSince ??= now;

        clearTimeout(this.#reconcileTimer);
        this.#reconcileTimer = setTimeout(() => this.#catchUp(),
            Math.max(0, Math.min(RECONCILE_DELAY, this.#staleSince + RECONCILE_MAX_WAIT - now)));
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

    #togglePopover(forceOpen = false) {
        const popover = this.#view.popover;
        const willOpen = forceOpen || !popover.matches(":popover-open");
        popover.togglePopover(willOpen);
        if (!willOpen) this.#select.focus();
    }
}

customElements.define("platy-picker", PlatyPicker);