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
 * The sheet can be dragged by its bar (the handle, heading and search box), or pulled down by the list once it's
 * scrolled to the top. Let go, it settles at half or full height, whichever is nearer, or closes when it's let go low
 * enough. A flick goes on in its direction: up to full height, down a step. Dragged while the keyboard is up, the
 * sheet goes back to the height it was dragged to once the keyboard is put away. Snapping to the other height or
 * closing gives a light tick on phones that can vibrate (Android).
 *
 * Phones put the keyboard over the page rather than shrinking it, so a sheet along the bottom of the layout viewport
 * would sit behind it. The visual viewport says where the keyboard is, and the sheet sits on top of it (see the
 * --_pp-keyboard and --_pp-viewport properties in platypicker.css), moving onto it and off it in one glide with its
 * change of height. Browsers tell the keyboard's comings and goings in their own ways and order (see #watchViewport);
 * iOS also scrolls the page around a focused box, which the sheet works around where it can.
 *
 * Android's Back button closes the sheet, through a CloseWatcher where there is one, which adds no history entry.
 */
export default class Sheet {
    // A flick, in pixels per millisecond: let go moving at least this fast, the sheet goes on in that direction.
    static #flickSpeed = .5;

    // How far a touch on the search box moves, in pixels, before it drags the sheet rather than being a tap.
    static #dragFromSearchAfter = 8;

    // Let go lower than this share of half height, the sheet closes.
    static #closeBelow = .65;

    // How much of the screen something must take to count as the on-screen keyboard, in pixels. Less is taken for
    // a browser's own toolbar, which can sit over the bottom of the page too.
    static #keyboardAtLeast = 120;

    // Whether the browser scrolls the page to keep a focused box clear of the keyboard as the box takes focus, as
    // Safari on iOS does (and so every browser on iOS), told by a property only it has. Others do so, if at all,
    // only once the keyboard is in (see #searchFocused).
    static #scrollsAsFocused = CSS.supports("-webkit-touch-callout", "none");

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
    #keyboardUp = false;    // Whether the on-screen keyboard is up, as the visual viewport tells.
    #awaitingKeyboard = false; // The search box has focus, and the sheet waits for the keyboard to grow (see #searchFocused).
    #growTimer = 0;         // Grows it anyway, if no keyboard comes.
    #keyboardGone = null;   // While the visual viewport is listened to: moves the sheet down as the keyboard goes.
    #drag = null;           // While the sheet is dragged: where it started, where it is, and how fast it moves.
    #pull = null;           // While a touch on the list may turn into pulling the sheet down: where it started.
    #closeWatcher = null;   // Closes the sheet on Back, while it's open.
    #settling = null;       // While the closed sheet slides away: stops waiting for it to be gone.
    #hiding = null;         // While the sheet slides down before hiding (see hide): stops waiting for it.
    #risen = [];            // While the rows rise as the sheet opens (see rise): the rows, each with its turn.
    #riseTimer = 0;
    #spring = 0;            // While a let-go sheet springs to its height (see #springTo): the next frame's request.
    #cutCard = null;        // The group's card cut off under its stuck header (see #cutUnderHeader).
    #cutFrame = 0;

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

        list.addEventListener("scroll", () => {
            if (this.#active && !this.#cutFrame) this.#cutFrame = requestAnimationFrame(() => this.#cutUnderHeader());
        }, { passive: true, signal });

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
     *
     * iOS acts on the touch itself, before any click: it moves focus and opens a native select's own picker as the
     * touch ends, and stopping the press doesn't prevent that. So a touch outside is taken over: its end is stopped,
     * which stops all of that and the click, and a tap closes the sheet there. Its moves are stopped too, so the
     * dimmed page doesn't scroll under the sheet.
     */
    #wireOutsideTaps(signal) {
        const outside = e => this.#active && !e.composedPath().includes(this.#popover);

        document.addEventListener("pointerdown", e => {
            if (outside(e)) e.preventDefault();
        }, { capture: true, signal });

        let touch = null;
        document.addEventListener("touchstart", e => {
            touch = outside(e) && e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
        }, { capture: true, passive: true, signal });

        document.addEventListener("touchmove", e => {
            if (touch && e.cancelable) e.preventDefault();
        }, { capture: true, passive: false, signal });

        document.addEventListener("touchcancel", () => touch = null, { capture: true, signal });

        document.addEventListener("touchend", e => {
            const start = touch;
            touch = null;
            if (!start || !this.#active || !e.cancelable) return;

            e.preventDefault();
            const end = e.changedTouches[0];
            if (Math.hypot(end.clientX - start.x, end.clientY - start.y) <= 10) this.hide();
        }, { capture: true, passive: false, signal });

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

    /**
     * The bar drags the sheet, by any pointer, except on its buttons. On the search box a touch or pen drags it once
     * it has moved a few pixels, more down or up than across, so a tap still goes to the box and brings up the
     * keyboard. A mouse there selects text instead.
     */
    #wireBarDrag(signal) {
        const bar = this.#bar;
        let press = null; // A touch on the search box that may yet turn into a drag.

        bar.addEventListener("pointerdown", e => {
            press = null;
            if (!this.#active || e.button !== 0 || e.target.closest("button")) return;

            if (e.target.closest("input")) {
                if (e.pointerType !== "mouse") press = { id: e.pointerId, x: e.clientX, y: e.clientY };
                return;
            }

            bar.setPointerCapture(e.pointerId);
            this.#startDrag(e.clientY);
        }, { signal });

        bar.addEventListener("pointermove", e => {
            if (press?.id === e.pointerId) {
                const dx = Math.abs(e.clientX - press.x), dy = Math.abs(e.clientY - press.y);
                if (dy < Sheet.#dragFromSearchAfter || dy < dx) {
                    if (dx >= Sheet.#dragFromSearchAfter) press = null; // Across: left to the box.
                    return;
                }
                // From where the finger is now, so the sheet doesn't jump the distance it took to tell a drag.
                bar.setPointerCapture(e.pointerId);
                this.#startDrag(e.clientY);
                press = null;
            }

            if (this.#drag && bar.hasPointerCapture(e.pointerId)) this.#moveDrag(e.clientY);
        }, { signal });

        bar.addEventListener("pointerup", () => {
            press = null;
            this.#endDrag();
        }, { signal });

        bar.addEventListener("pointercancel", () => {
            press = null;
            this.#endDrag({ cancelled: true });
        }, { signal });

        // A tap on the search box focuses it without scrolling. Left to the browser, iOS scrolls the page as the
        // box takes focus, though the box is in view, and the sheet, fixed as it is, visibly lags behind that
        // scroll and catches up. A tap in the box while it has focus is left be, to place the caret.
        const search = this.#search;
        let tap = null;
        search.addEventListener("touchstart", e => {
            tap = this.#active && !this.#searching && e.touches.length === 1
                ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
        }, { passive: true, signal });

        search.addEventListener("touchend", e => {
            const start = tap;
            tap = null;
            if (!start || !this.#active || !e.cancelable) return;

            const end = e.changedTouches[0];
            if (Math.hypot(end.clientX - start.x, end.clientY - start.y) >= Sheet.#dragFromSearchAfter) return;
            e.preventDefault();
            search.focus({ preventScroll: true });
        }, { signal });
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
        this.#awaitingKeyboard = false;
        clearTimeout(this.#growTimer);
        this.#keyboardGone = null;
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
        cancelAnimationFrame(this.#cutFrame);
        this.#cutFrame = 0;
        this.#cut(null);
    }

    /**
     * A group's header sticks to the top of the list (see platypicker.css) with nothing behind it, so the sheet shows
     * through it as it does everywhere else. Its rows don't pass under it: the group's card is cut off at the header's
     * bottom, so they vanish there. Only the group at the top of the list can be under its header, so the groups are
     * looked at from the top down until one starts below it.
     */
    #cutUnderHeader() {
        this.#cutFrame = 0;
        const top = this.#list.getBoundingClientRect().top;

        for (const group of this.#list.children) {
            if (!group.matches(".pp-group")) continue;
            const box = group.getBoundingClientRect();
            if (box.top > top) break;
            if (box.bottom <= top) continue;

            const header = group.firstElementChild;
            const card = group.lastElementChild;
            const under = header.getBoundingClientRect().bottom - card.getBoundingClientRect().top;
            this.#cut(under > 0 ? card : null, under);
            return;
        }
        this.#cut(null);
    }

    #cut(card, by = 0) {
        if (this.#cutCard && this.#cutCard !== card) this.#cutCard.style.removeProperty("mask-image");
        this.#cutCard = card;
        card?.style.setProperty("mask-image", `linear-gradient(transparent ${by}px, #000 ${by}px)`);
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

    /**
     * The search box taking focus grows the sheet to full height, at once, so that the box is near the top by the
     * time the keyboard is in: a browser that scrolls a box the keyboard covers into view once it's in (Firefox for
     * Android) would otherwise throw the half-height sheet up the screen.
     *
     * iOS decides that as the box takes focus, while the box is still low on a half-height sheet, so there the sheet
     * waits for the keyboard instead, and grows once it's there, to its full height above it, moving and growing in
     * one: grown at once, it would first reach for the top of the whole screen, then jump to its place above the
     * keyboard, a long way, as iOS scrolls the page meanwhile. Without a keyboard after a moment (a keyboard of its
     * own on a tablet), it grows anyway.
     */
    #searchFocused() {
        if (!this.#active) return;

        this.#restore ??= this.#full;
        this.#syncCancel();
        if (this.#full) return;

        if (Sheet.#scrollsAsFocused && this.#viewport && !this.#keyboardUp &&
            matchMedia("(pointer: coarse)").matches) {
            this.#awaitingKeyboard = true;
            clearTimeout(this.#growTimer);
            this.#growTimer = setTimeout(() => this.#growForKeyboard(), 600);
            return;
        }

        this.#full = true;
        this.#apply();
    }

    /** Grows the sheet to full height for the search, once the keyboard is up or hasn't come. */
    #growForKeyboard() {
        clearTimeout(this.#growTimer);
        if (!this.#awaitingKeyboard) return;

        this.#awaitingKeyboard = false;
        if (!this.#searching) return;
        this.#full = true;
        this.#apply();
    }

    /**
     * The search box losing focus takes the sheet back to the height it had before. With the keyboard up, as after
     * Cancel, the keyboard goes with it, so the sheet moves down off it and changes height in one, as the keyboard
     * slides away: its height alone would first shrink to half of what the keyboard leaves, then grow again once the
     * keyboard has gone.
     */
    #searchBlurred() {
        this.#awaitingKeyboard = false;
        clearTimeout(this.#growTimer);
        this.#syncCancel();
        if (!this.#active) return;

        this.#keyboardGone?.();
        if (this.#restore === null) return;
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
        this.#awaitingKeyboard = false; // Dragged to a height of the user's own, which the keyboard keeps.
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

        // While the keyboard stays up, the sheet follows what the visual viewport says at once. As the keyboard comes
        // or goes, it moves and changes height in one glide (see moveTogether).
        // A keyboard put away by its own button (Android's, in place of Back) leaves focus in the search box, so
        // the sheet wouldn't know. Its going counts as putting it away: focus leaves the search box, and the sheet
        // goes back to its height.
        this.#keyboardUp = false;
        let keyboardTimer = 0;
        let movedAt = -Infinity; // When the sheet last moved with the keyboard (see moveTogether).
        let panWaitUntil = 0;    // Until when it waits for iOS to scroll the search box into view (see measure).

        // The screen's height without the keyboard, as the sheet opens: the visual viewport at its tallest since.
        // Not the window's height later, which iOS may shrink while the keyboard is up.
        let tallest = Math.max(window.innerHeight, viewport.height * viewport.scale);

        const measure = () => {
            // Whether the keyboard is up is told by how much the visual viewport shrank from its tallest, at its
            // scale, so zooming in doesn't count.
            // Only while the search box has focus: the keyboard is the search box's, and once it has lost focus
            // the keyboard is going, whatever the visual viewport still says (see #keyboardGone).
            tallest = Math.max(tallest, viewport.height * viewport.scale);
            const up = this.#searching && tallest - viewport.height * viewport.scale > Sheet.#keyboardAtLeast;

            // Where the sheet's bottom goes: the visual viewport's bottom, measured up from the layout viewport's,
            // which the sheet is fixed to. iOS may scroll the visual viewport down as the keyboard comes up, to keep
            // the search box out from under it, and even shrink the layout viewport, so its bottom can be below the
            // layout viewport's, and the sheet's bottom with it.
            const inset = window.innerHeight - viewport.height - viewport.offsetTop;
            const wentAway = this.#keyboardUp && !up;
            const grows = up && this.#awaitingKeyboard;

            // A search box the keyboard has come up over is about to be scrolled into view by iOS, which takes the
            // visual viewport down and shrinks the layout viewport, and that can come later than the keyboard's
            // steps are waited out for. Placed before it, the sheet would grow towards a place far too high, and
            // come back down once it came. So it waits for that scroll, for a moment at most.
            if (!grows) panWaitUntil = 0;
            else if (this.#search.getBoundingClientRect().bottom > viewport.offsetTop + viewport.height) {
                const now = performance.now();
                panWaitUntil ||= now + 300;
                if (now < panWaitUntil) {
                    clearTimeout(timer);
                    timer = setTimeout(() => watching.signal.aborted || measure(), panWaitUntil - now);
                    return;
                }
            }

            if (wentAway && this.#searching) this.#search.blur();
            const wasUp = this.#keyboardUp;
            this.#keyboardUp = up;

            // Only the keyboard moves and sizes the sheet. Without it, the stylesheet's steady height applies, so a
            // browser's toolbar sliding in or out as the page scrolls (which changes the visual viewport too)
            // doesn't make the sheet jump.
            const keyboard = up ? `${Math.round(inset)}px` : "";
            const height = up ? `${Math.round(viewport.height)}px` : "";
            if (!grows && popover.style.getPropertyValue("--_pp-keyboard") === keyboard &&
                popover.style.getPropertyValue("--_pp-viewport") === height) return;

            // The sheet glides (see moveTogether):
            // - once the keyboard has gone, down to where it was and back to its height;
            // - as it grows onto the keyboard it waited for (see #searchFocused);
            // - on iOS, as the keyboard comes up under it at full height. Its top may move too there: its height
            //   without the keyboard is of the small viewport (svh), shorter than the window while Safari's toolbar
            //   is out of the way. Elsewhere its top stays put and only its bottom moves, behind the keyboard, so it's
            //   placed at once: a glide would only show as its top dipping (Firefox);
            // - for a correction right after a glide: the keyboard's steps can come further apart than they're
            //   waited out for (see settle), and the sheet then glides on to its place rather than jumping.
            // Otherwise it's placed at once.
            const cameUp = up && !wasUp && Sheet.#scrollsAsFocused;
            if (wentAway || grows || cameUp || performance.now() - movedAt < 400) moveTogether();
            else {
                popover.style.setProperty("--_pp-height-duration", "0s");
                requestAnimationFrame(() => requestAnimationFrame(() => popover.style.removeProperty("--_pp-height-duration")));
            }
            place(keyboard, height);
            if (grows) this.#growForKeyboard();
        };

        // The sheet's place above the keyboard and its height change together, animated as one, so it doesn't drop
        // first and grow back after. The height doesn't spring here, as the place can't.
        const moveTogether = () => {
            movedAt = performance.now();
            clearTimeout(keyboardTimer);
            const together = [["--_pp-keyboard-duration", ".3s"], ["--_pp-height-duration", ".3s"],
                ["--_pp-height-ease", "cubic-bezier(.2, .9, .25, 1)"]];
            for (const [name, value] of together) popover.style.setProperty(name, value);
            keyboardTimer = setTimeout(() => {
                for (const [name] of together) popover.style.removeProperty(name);
            }, 400);
        };

        const place = (keyboard, height) => {
            for (const [name, value] of [["--_pp-keyboard", keyboard], ["--_pp-viewport", height]]) {
                if (value) popover.style.setProperty(name, value);
                else popover.style.removeProperty(name);
            }
        };

        // The search box losing focus puts the keyboard away, so the sheet moves down as it goes, rather than once
        // the visual viewport says it has gone: iOS says so only once the keyboard is down, and till then still
        // gives the viewport as it was with the keyboard up, so the sheet would stay up there over the page for a
        // moment. The caller changes the sheet's height in the same go.
        this.#keyboardGone = () => {
            if (!this.#keyboardUp) return;
            this.#keyboardUp = false;
            moveTogether();
            place("", "");
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