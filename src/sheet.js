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

    // How far up the screen something must reach to count as the on-screen keyboard, in pixels. Less is taken for
    // a browser's own toolbar, which can sit over the bottom of the page too.
    static #keyboardAtLeast = 120;

    // A screen too short for half height, as a phone on its side. The same as in platypicker.css.
    static #shortScreen = "(max-height: 500px)";

    // The spring a let-go sheet settles by (see #springTo): seconds a swing takes, how damped it is (1 doesn't
    // overshoot), and the most speed it takes from the finger, in pixels per second.
    static #springResponse = .45;
    static #springDamping = .75;
    static #springMaxSpeed = 4000;

    // As the sheet opens, how many rows rise one after another; the rest in view rise with the last of them.
    static #riseSteps = 12;

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
    #risen = [];            // While the rows rise as the sheet opens (see rise): the rows, each with its turn.
    #riseTimer = 0;
    #spring = 0;            // While a let-go sheet springs to its height (see #springTo): the next frame's request.

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

        // A row bounces as it's picked or unpicked, by tap, click or key alike.
        list.addEventListener("click", e => {
            const row = e.target.closest(".pp-item");
            if (!this.#active || !row || row.matches(":disabled, [aria-disabled='true']") ||
                matchMedia("(prefers-reduced-motion: reduce)").matches) return;
            row.animate([{ scale: 1 }, { scale: .975, offset: .4 }, { scale: 1 }], { duration: 240, easing: "ease-out" });
        }, { signal });

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
        cancelAnimationFrame(this.#spring); // It slides away at the height it had come to.
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
        cancelAnimationFrame(this.#spring);
        delete popover.dataset.height;
        delete popover.dataset.dragging;
        delete popover.dataset.closing;
        for (const name of ["--_pp-keyboard", "--_pp-viewport", "--_pp-drag-height", "--_pp-backdrop-opacity",
            "--_pp-height-duration", "--_pp-height-ease", "--_pp-keyboard-duration"])
            popover.style.removeProperty(name);
        this.#stopRising();
    }

    /**
     * Has the rows in view rise into place one after another (see platypicker.css), as the sheet opens. Runs once
     * the popover is open and the list has scrolled to the selected row. Rows rendered later, as the list is
     * searched or scrolled, just appear.
     */
    rise() {
        if (!this.#active || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        this.#stopRising();

        const list = this.#list;
        const bottom = list.scrollTop + list.clientHeight;
        let step = 0;
        for (const element of list.querySelectorAll(".pp-header, .pp-item")) {
            if (element.offsetTop + element.offsetHeight <= list.scrollTop) continue;
            if (element.offsetTop >= bottom) break;
            element.dataset.rise = "";
            element.style.setProperty("--_pp-rise", Math.min(step++, Sheet.#riseSteps));
            this.#risen.push(element);
        }

        this.#riseTimer = setTimeout(() => this.#stopRising(), 400 + Sheet.#riseSteps * 26);
    }

    #stopRising() {
        clearTimeout(this.#riseTimer);
        for (const element of this.#risen) {
            delete element.dataset.rise;
            element.style.removeProperty("--_pp-rise");
        }
        this.#risen = [];
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
        return this.#screenHeight * .56;
    }

    /** Full height, in pixels: all of the screen the stylesheet goes by but a 2.5rem strip at the top. */
    get #fullHeight() {
        return this.#screenHeight - 2.5 * parseFloat(getComputedStyle(document.documentElement).fontSize);
    }

    /** The screen the stylesheet goes by, in pixels: the sheet's height limit, which the stylesheet sets. */
    get #screenHeight() {
        return parseFloat(getComputedStyle(this.#popover).maxHeight) || window.innerHeight;
    }

    #startDrag(y) {
        cancelAnimationFrame(this.#spring); // Caught while springing to a height.
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

        this.#popover.style.removeProperty("--_pp-backdrop-opacity");
        if (!to) {
            this.#stopSpring();
            return;
        }

        this.#full = to === "full";
        if (this.#restore !== null) this.#restore = this.#full; // Where it goes back to once the keyboard is away.
        this.#apply();

        // A finger that had stopped before letting go gives the sheet no speed of its own.
        const moving = performance.now() - drag.time < 80;
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) this.#stopSpring();
        else this.#springTo(to === "full" ? this.#fullHeight : this.#halfHeight, drag.height,
            moving ? -drag.speed * 1000 : 0);
    }

    /**
     * Springs the let-go sheet to the height it settles at, starting at the speed the finger moved it. The
     * stylesheet's spring (a transition of fixed length) would start over at its own speed, and slow down a fast
     * drag let go just short of the height. It stays a drag (data-dragging) until it comes to rest at that height.
     * Speeds are in pixels per second, growing positive.
     */
    #springTo(target, height, speed) {
        const omega = 2 * Math.PI / Sheet.#springResponse;
        const zeta = Sheet.#springDamping;
        speed = Math.max(-Sheet.#springMaxSpeed, Math.min(Sheet.#springMaxSpeed, speed));

        // Past full height there's only the strip at the top of the screen to go into. The further the spring goes
        // past it, the less of that the sheet takes, so it eases toward the top of the screen and never hits it.
        const full = this.#fullHeight;
        const strip = this.#screenHeight - full;
        const shown = h => h <= full || strip <= 0 ? h : full + strip * (1 - Math.exp(-(h - full) / strip));

        cancelAnimationFrame(this.#spring);
        let last = performance.now();
        const step = now => {
            // A frame's time can come before the moment the spring started; that frame doesn't move it.
            const dt = Math.max(0, Math.min(.032, (now - last) / 1000)) / 4;
            last = now;
            for (let i = 0; i < 4; i++) {
                speed += (-omega * omega * (height - target) - 2 * zeta * omega * speed) * dt;
                height += speed * dt;
            }
            if (Math.abs(height - target) < .5 && Math.abs(speed) < 20) {
                this.#stopSpring();
                return;
            }
            this.#popover.style.setProperty("--_pp-drag-height", `${shown(height)}px`);
            this.#spring = requestAnimationFrame(step);
        };
        this.#spring = requestAnimationFrame(step);
    }

    /** Ends a drag's spring, or the drag itself, leaving the sheet at the height the stylesheet gives it. */
    #stopSpring() {
        cancelAnimationFrame(this.#spring);
        this.#spring = 0;
        delete this.#popover.dataset.dragging;
        this.#popover.style.removeProperty("--_pp-drag-height");
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

        const watching = this.#viewport = new AbortController();
        const popover = this.#popover;

        // The keyboard has finished moving by the time the browser says where it is (Firefox for Android says so
        // once, after its slide), so the sheet takes its new place at once rather than sliding there after it.
        // A keyboard put away by its own button (Android's, in place of Back) leaves focus in the search box, so
        // the sheet wouldn't know. Its going counts as putting it away: focus leaves the search box, and the sheet
        // goes back to its height.
        let keyboardUp = false;
        let keyboardTimer = 0;

        const measure = () => {
            const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
            const up = inset > Sheet.#keyboardAtLeast;
            const wentAway = keyboardUp && !up;
            if (wentAway && this.#searching) this.#search.blur();
            keyboardUp = up;

            // Only the keyboard moves and sizes the sheet. Without it, the stylesheet's steady height applies, so a
            // browser's toolbar sliding in or out as the page scrolls (which changes the visual viewport too)
            // doesn't make the sheet jump.
            const keyboard = up ? `${Math.round(inset)}px` : "";
            const height = up ? `${Math.round(viewport.height)}px` : "";
            if (popover.style.getPropertyValue("--_pp-keyboard") === keyboard &&
                popover.style.getPropertyValue("--_pp-viewport") === height) return;

            // Once the keyboard has gone, the sheet moves down to where it was and back to its height, animated as
            // after Cancel: its place above the keyboard and its height change together, so it doesn't drop first
            // and grow back after.
            // The height doesn't spring here, as the place can't.
            if (wentAway) {
                clearTimeout(keyboardTimer);
                const together = [["--_pp-keyboard-duration", ".3s"], ["--_pp-height-duration", ".3s"],
                    ["--_pp-height-ease", "cubic-bezier(.2, .9, .25, 1)"]];
                for (const [name, value] of together) popover.style.setProperty(name, value);
                keyboardTimer = setTimeout(() => {
                    for (const [name] of together) popover.style.removeProperty(name);
                }, 400);
            } else {
                popover.style.setProperty("--_pp-height-duration", "0s");
                requestAnimationFrame(() => requestAnimationFrame(() => popover.style.removeProperty("--_pp-height-duration")));
            }
            for (const [name, value] of [["--_pp-keyboard", keyboard], ["--_pp-viewport", height]]) {
                if (value) popover.style.setProperty(name, value);
                else popover.style.removeProperty(name);
            }
        };

        // A keyboard coming up can be told in a few steps: the visual viewport shrinks, then scrolls to keep the
        // search box in view, a frame or so later. Measured in between, the sheet would sit too high for a moment,
        // so it's measured once they've stopped.
        let timer = 0;
        const settle = () => {
            clearTimeout(timer);
            timer = setTimeout(() => watching.signal.aborted || measure(), 60);
        };

        viewport.addEventListener("resize", settle, { signal: watching.signal });
        viewport.addEventListener("scroll", settle, { signal: watching.signal });
        watching.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            clearTimeout(keyboardTimer);
        });
        measure();
    }
}