"use strict";

/**
 * What the sheet does (layout="sheet"), on top of how the popover behaves: its heights, and the on-screen keyboard.
 *
 * The sheet opens at half height. The search box taking focus brings up the keyboard, so the sheet grows to full
 * height for the matches, and goes back to the height it had once the keyboard is put away: by Cancel (shown while
 * there's a search to clear), by scrolling the list, or by focus leaving the search box. Picking a row or select all / none while searching keeps focus in
 * the search box, and so the keyboard up.
 *
 * Phones put the keyboard over the page rather than shrinking it, so a sheet along the bottom of the layout viewport
 * would sit behind it. The visual viewport says where the keyboard is, and the sheet sits on top of it (see the
 * --_pp-keyboard and --_pp-viewport properties in platypicker.css).
 */
export default class Sheet {
    #popover;
    #bar;
    #search;
    #cancel;
    #list;
    #clearSearch;

    #active = false;    // Whether the popover is open as the sheet.
    #full = false;      // Full height, rather than half.
    #restore = null;    // While the search box has focus: whether the sheet was full height before it took it.
    #viewport = null;   // Stops listening to the visual viewport, while it's listened to.

    constructor({ popover, bar, search, cancel, list, clearSearch, signal }) {
        this.#popover = popover;
        this.#bar = bar;
        this.#search = search;
        this.#cancel = cancel;
        this.#list = list;
        this.#clearSearch = clearSearch;

        search.addEventListener("focus", () => this.#searchFocused(), { signal });
        search.addEventListener("blur", () => this.#searchBlurred(), { signal });
        search.addEventListener("input", () => this.#syncCancel(), { signal });

        // Pressing a button would take focus from the search box, and put the keyboard away. Not stopped for the
        // keyboard: Tab still moves focus.
        const keepFocus = e => {
            if (this.#searching && e.target.closest("button")) e.preventDefault();
        };
        list.addEventListener("mousedown", keepFocus, { signal });
        bar.addEventListener("mousedown", keepFocus, { signal });

        // Scrolling the list means the user is looking through the matches, so the keyboard goes. Only a scroll
        // the user makes: the list also scrolls itself, as it shows more rows or the selected one.
        const dismiss = () => this.#searching && search.blur();
        list.addEventListener("touchmove", dismiss, { passive: true, signal });
        list.addEventListener("wheel", dismiss, { passive: true, signal });

        cancel.addEventListener("click", () => this.#cancelSearch(), { signal });
        signal.addEventListener("abort", () => this.close());
    }

    /** Starts acting as the sheet, at half height. Runs as the popover opens as the sheet. */
    open() {
        if (this.#active) return;

        this.#active = true;
        this.#full = false;
        this.#restore = null;
        this.#apply();
        this.#syncCancel(); // The search stays from the last time the picker was open, and Cancel with it.
        this.#watchViewport();
    }

    /** Stops acting as the sheet, as the popover closes or turns back into a popover. */
    close() {
        if (!this.#active) return;

        this.#active = false;
        this.#viewport?.abort();
        this.#viewport = null;
        this.#syncCancel();
        delete this.#popover.dataset.height;
        this.#popover.style.removeProperty("--_pp-keyboard");
        this.#popover.style.removeProperty("--_pp-viewport");
    }

    get #searching() {
        return this.#active && this.#search.getRootNode().activeElement === this.#search;
    }

    #apply() {
        this.#popover.dataset.height = this.#full ? "full" : "half";
    }

    /** Cancel shows while there's a search to clear, in the sheet only. */
    #syncCancel() {
        this.#cancel.hidden = !(this.#active && this.#search.value);
    }

    #searchFocused() {
        if (!this.#active) return;

        this.#restore ??= this.#full;
        this.#full = true;
        this.#apply();
    }

    #searchBlurred() {
        if (!this.#active || this.#restore === null) return;

        this.#full = this.#restore;
        this.#restore = null;
        this.#apply();
    }

    /** Clears the search and puts the keyboard away, leaving focus on the list for the keyboard. */
    #cancelSearch() {
        this.#clearSearch();
        this.#syncCancel();

        const row = this.#list.querySelector(".pp-item[tabindex='0']");
        if (row) row.focus({ preventScroll: true });
        else this.#search.blur();
    }

    /** Keeps the sheet above the on-screen keyboard, from where the visual viewport says it is. */
    #watchViewport() {
        const viewport = window.visualViewport;
        if (!viewport) return;

        this.#viewport = new AbortController();
        const sync = () => {
            const keyboard = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
            this.#popover.style.setProperty("--_pp-keyboard", `${Math.round(keyboard)}px`);
            this.#popover.style.setProperty("--_pp-viewport", `${Math.round(viewport.height)}px`);
        };

        viewport.addEventListener("resize", sync, { signal: this.#viewport.signal });
        viewport.addEventListener("scroll", sync, { signal: this.#viewport.signal });
        sync();
    }
}