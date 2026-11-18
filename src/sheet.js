"use strict";

/**
 * What the sheet does (layout="sheet"), on top of how the popover behaves: its heights, dragging it, the on-screen
 * keyboard, and the Back button.
 *
 * The sheet opens at half height. The search box taking focus brings up the keyboard, so the sheet grows to full
 * height for the matches, and goes back to the height it had once the keyboard is put away: by Cancel (shown while
 * searching or while there's a search to clear), by scrolling the list, or by focus leaving the search box. Picking
 * a row or select all / none while searching keeps focus in the search box, and so the keyboard up.
 *
 * On a short screen, as a phone on its side, there's no half height: the sheet opens at full height, narrower and
 * centred (see platypicker.css).
 *
 * The sheet can be dragged by its bar (the handle and heading), or pulled down by the list once it's scrolled to the
 * top. Let go, it settles at half or full height, whichever is nearer, or closes when it's let go low enough. A flick
 * goes on in its direction: up to full height, down a step. Dragged while the keyboard is up, the sheet goes back to
 * the height it was dragged to once the keyboard is put away. Snapping to the other height or closing gives a light
 * tick on phones that can vibrate (Android).
 *
 * Phones put the keyboard over the page rather than shrinking it, so a sheet along the bottom of the layout viewport
 * would sit behind it. The visual viewport says where the keyboard is, and the sheet sits on top of it (see the
 * --_pp-keyboard and --_pp-viewport properties in platypicker.css).
 *
 * Android's Back button closes the sheet, through a CloseWatcher where there is one, which adds no history entry.
 */
export default class Sheet {
    // A flick, in pixels per millisecond: let go moving at least this fast, the sheet goes on in that direction.
    static #flickSpeed = .5;

    // Let go lower than this share of half height, the sheet closes.
    static #closeBelow = .65;

    // A screen too short for half height, as a phone on its side. The same as in platypicker.css.
    static #shortScreen = "(max-height: 500px)";

    // Whether a closing popover can stay in the top layer while it slides away (see hide).
    static #canSlideAway = CSS.supports("overlay", "auto") && CSS.supports("transition-behavior", "allow-discrete");

    #popover;
    #bar;
    #search;
    #cancel;
    #list;
    #clearSearch;
    #close;

    #active = false;        // Whether the popover is open as the sheet.
    #full = false;          // Full height, rather than half.
    #restore = null;        // While the search box has focus: whether the sheet was full height before it took it.
    #viewport = null;       // Stops listening to the visual viewport, while it's listened to.
    #drag = null;           // While the sheet is dragged: where it started, where it is, and how fast it moves.
    #pull = null;           // While a touch on the list may turn into pulling the sheet down: where it started.
    #closeWatcher = null;   // Closes the sheet on Back, while it's open.
    #settling = null;       // While the closed sheet slides away: stops waiting for it to be gone.
    #hiding = null;         // While the sheet slides down before hiding (see hide): stops waiting for it.

    constructor({ popover, bar, search, cancel, list, clearSearch, close, signal }) {
        this.#popover = popover;
        this.#bar = bar;
        this.#search = search;
        this.#cancel = cancel;
        this.#list = list;
        this.#clearSearch = clearSearch;
        this.#close = close;

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

        this.#wireBarDrag(signal);
        this.#wireListPull(signal);
        this.#wireOutsideTaps(signal);
    }

    /**
     * A tap outside the sheet, on the dimmed page, only closes it, as a tap on a backdrop does: nothing under it
     * reacts, not another picker nor this one's own select. A popover's backdrop doesn't catch taps (they go through
     * to the page), so they're caught on their way there, before anything on the page sees them. The press is
     * stopped too, so it doesn't move focus or open a native select.
     */
    #wireOutsideTaps(signal) {
        const outside = e => this.#active && !e.composedPath().includes(this.#popover);

        document.addEventListener("pointerdown", e => {
            if (outside(e)) e.preventDefault();
        }, { capture: true, signal });

        document.addEventListener("click", e => {
            if (!outside(e)) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            this.hide();
        }, { capture: true, signal });
    }

    /**
     * Hides the popover, which the picker does through here wherever it hides it. A closing popover leaves the top
     * layer at once unless overlay can be transitioned, which keeps it there while it slides away (see
     * platypicker.css). Where it can't (Firefox, so far), the open sheet slides down first, and hides once it's
     * down. Elsewhere, and outside the sheet, it hides at once.
     */
    hide() {
        const popover = this.#popover;
        if (!popover.matches(":popover-open") || this.#hiding) return;

        if (!this.#active || Sheet.#canSlideAway || matchMedia("(prefers-reduced-motion: reduce)").matches) {
            popover.hidePopover();
            return;
        }

        const hiding = this.#hiding = new AbortController();
        const finish = () => {
            if (hiding.signal.aborted) return;
            hiding.abort();
            this.#hiding = null;
            if (popover.matches(":popover-open")) popover.hidePopover();
            delete popover.dataset.closing;
        };

        popover.dataset.closing = "";
        popover.addEventListener("transitionend", e => {
            if (e.target === popover && e.propertyName === "translate") finish();
        }, { signal: hiding.signal });
        setTimeout(finish, 400);
    }

    /** The bar drags the sheet, by any pointer, except on its buttons and the search box. */
    #wireBarDrag(signal) {
        const bar = this.#bar;

        bar.addEventListener("pointerdown", e => {
            if (!this.#active || e.button !== 0 || e.target.closest("button, input")) return;
            bar.setPointerCapture(e.pointerId);
            this.#startDrag(e.clientY);
        }, { signal });

        bar.addEventListener("pointermove", e => {
            if (this.#drag && bar.hasPointerCapture(e.pointerId)) this.#moveDrag(e.clientY);
        }, { signal });

        bar.addEventListener("pointerup", () => this.#endDrag(), { signal });
        bar.addEventListener("pointercancel", () => this.#endDrag({ cancelled: true }), { signal });
    }

    /**
     * A touch on the list scrolled to its top that moves down pulls the sheet down instead of scrolling. Which it is
     * gets decided by the first move, since a touch the browser has started scrolling can't be taken over.
     */
    #wireListPull(signal) {
        const list = this.#list;

        list.addEventListener("touchstart", e => {
            this.#pull = this.#active && e.touches.length === 1 ? { y: e.touches[0].clientY, pulling: null } : null;
        }, { passive: true, signal });

        list.addEventListener("touchmove", e => {
            const pull = this.#pull;
            if (!pull) return;

            const y = e.touches[0].clientY;
            if (pull.pulling === null) {
                if (Math.abs(y - pull.y) < 2) return;
                pull.pulling = y > pull.y && list.scrollTop <= 0;
                if (!pull.pulling) {
                    this.#pull = null;
                    return;
                }
                this.#startDrag(pull.y);
            }

            if (e.cancelable) e.preventDefault();
            this.#moveDrag(y);
        }, { passive: false, signal });

        const end = () => {
            if (this.#pull?.pulling) this.#endDrag();
            this.#pull = null;
        };
        list.addEventListener("touchend", end, { signal });
        list.addEventListener("touchcancel", end, { signal });
    }

    /** Starts acting as the sheet, at half height. Runs as the popover opens as the sheet. */
    open() {
        if (this.#active) return;

        this.#settling?.abort(); // Opened again before it finished sliding away.
        this.#settling = null;
        this.#resetLook();

        this.#active = true;
        this.#full = false;
        this.#restore = null;
        this.#apply();
        this.#syncCancel(); // The search stays from the last time the picker was open, and Cancel with it.
        this.#watchViewport();
        this.#watchBack();
    }

    /**
     * Stops acting as the sheet, as the popover closes or turns back into a popover. The sheet keeps its height and
     * place until it has slid away (see #resetLookOnceGone), so it slides down from where it was.
     */
    close() {
        if (!this.#active) return;

        this.#active = false;
        this.#viewport?.abort();
        this.#viewport = null;
        this.#closeWatcher?.destroy();
        this.#closeWatcher = null;
        this.#hiding?.abort(); // Closed some other way while sliding down to hide.
        this.#hiding = null;
        this.#drag = null;
        this.#pull = null;
        this.#syncCancel();
        this.#resetLookOnceGone();
    }

    /**
     * Resets the height and place the script gave the sheet once it has slid away: when its slide ends, or after a
     * moment where there's no slide (with reduced motion, or in a browser that hides it at once).
     */
    #resetLookOnceGone() {
        this.#settling?.abort();
        const settling = this.#settling = new AbortController();

        const done = () => {
            if (settling.signal.aborted) return;
            settling.abort();
            this.#settling = null;
            if (!this.#active) this.#resetLook();
        };
        this.#popover.addEventListener("transitionend", e => {
            if (e.target === this.#popover && e.propertyName === "translate") done();
        }, { signal: settling.signal });
        setTimeout(done, 500);
    }

    #resetLook() {
        const popover = this.#popover;
        delete popover.dataset.height;
        delete popover.dataset.dragging;
        delete popover.dataset.closing;
        for (const name of ["--_pp-keyboard", "--_pp-viewport", "--_pp-drag-height", "--_pp-backdrop-opacity"])
            popover.style.removeProperty(name);
    }

    get #searching() {
        return this.#active && this.#search.getRootNode().activeElement === this.#search;
    }

    #apply() {
        this.#popover.dataset.height = this.#full ? "full" : "half";
    }

    /**
     * Cancel shows in the sheet while the search box has focus, as a way to put the keyboard away, and while there's
     * a search to clear.
     */
    #syncCancel() {
        this.#cancel.hidden = !(this.#active && (this.#searching || this.#search.value));
    }

    #searchFocused() {
        if (!this.#active) return;

        this.#restore ??= this.#full;
        this.#full = true;
        this.#apply();
        this.#syncCancel();
    }

    #searchBlurred() {
        this.#syncCancel();
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

    // -----------------------------------------------------------------
    // Dragging
    // -----------------------------------------------------------------

    /**
     * Half height, in pixels: a little over half of what the keyboard leaves of the screen, as in the stylesheet. A
     * short screen has none: the sheet is full height there, so a drag settles at full height or closes.
     */
    get #halfHeight() {
        if (matchMedia(Sheet.#shortScreen).matches) return this.#fullHeight;

        const viewport = parseFloat(this.#popover.style.getPropertyValue("--_pp-viewport")) || window.innerHeight;
        return viewport * .56;
    }

    /** Full height, in pixels: the sheet's height limit, which the stylesheet sets. */
    get #fullHeight() {
        return parseFloat(getComputedStyle(this.#popover).maxHeight) || window.innerHeight;
    }

    #startDrag(y) {
        const height = this.#popover.getBoundingClientRect().height;
        this.#drag = { startY: y, startHeight: height, height, y, time: performance.now(), speed: 0 };
        this.#popover.dataset.dragging = "";
        this.#popover.style.setProperty("--_pp-drag-height", `${height}px`);
    }

    /** Follows the pointer, and fades the dimmed page with the sheet as it goes below half height. */
    #moveDrag(y) {
        const drag = this.#drag;
        if (!drag) return;

        const now = performance.now();
        const speed = (y - drag.y) / Math.max(1, now - drag.time); // Down is positive.
        drag.speed = drag.speed * .2 + speed * .8;
        drag.y = y;
        drag.time = now;
        drag.height = Math.min(this.#fullHeight, Math.max(0, drag.startHeight - (y - drag.startY)));

        this.#popover.style.setProperty("--_pp-drag-height", `${drag.height}px`);
        this.#popover.style.setProperty("--_pp-backdrop-opacity", Math.min(1, drag.height / this.#halfHeight).toFixed(3));
    }

    /** Settles the sheet where it was let go: at half or full height, or closed. A cancelled drag goes back. */
    #endDrag({ cancelled = false } = {}) {
        const drag = this.#drag;
        if (!drag) return;

        this.#drag = null;
        const to = cancelled || !this.#active ? null : this.#settleAt(drag);

        // Closed, it keeps the height it was let go at, and slides away from there.
        if (to === "closed") {
            Sheet.#tick();
            this.#close();
            return;
        }
        if (to && (to === "full") !== this.#full) Sheet.#tick();

        delete this.#popover.dataset.dragging;
        this.#popover.style.removeProperty("--_pp-drag-height");
        this.#popover.style.removeProperty("--_pp-backdrop-opacity");
        if (!to) return;

        this.#full = to === "full";
        if (this.#restore !== null) this.#restore = this.#full; // Where it goes back to once the keyboard is away.
        this.#apply();
    }

    /**
     * A light tick, as a drag snaps the sheet to its other height or closes it. Only where there's a vibration API,
     * which phones have on Android; iOS has none, and there it does nothing. The drag's end is the user's doing, as
     * the browser asks before it vibrates.
     */
    static #tick() {
        try {
            navigator.vibrate?.(10);
        } catch {
            // Some browsers throw rather than ignore it, in a frame they don't allow it in.
        }
    }

    /** Where a drag let go settles: "half", "full" or "closed". */
    #settleAt({ height, speed }) {
        const half = this.#halfHeight;
        const full = this.#fullHeight;

        if (speed >= Sheet.#flickSpeed) return height > half + 1 ? "half" : "closed";
        if (speed <= -Sheet.#flickSpeed) return "full";
        if (height < half * Sheet.#closeBelow) return "closed";
        return height > (half + full) / 2 ? "full" : "half";
    }

    // -----------------------------------------------------------------
    // Back button and keyboard
    // -----------------------------------------------------------------

    /**
     * Closes the sheet on Android's Back button (and Escape, which the picker handles already). A CloseWatcher adds
     * no history entry, unlike the older way of pushing one. Browsers without it (Firefox, Safari) have no Back to
     * close the sheet with: it closes by a drag, a tap on the page, or Escape.
     */
    #watchBack() {
        if (!("CloseWatcher" in window)) return;

        try {
            const watcher = this.#closeWatcher = new CloseWatcher();
            watcher.addEventListener("close", () => {
                if (this.#closeWatcher !== watcher) return;
                this.#closeWatcher = null;
                this.#close();
            });
        } catch {
            // A page may only create so many without the user doing something in between; the sheet does without.
        }
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