"use strict";

/**
 * How the sheet's rows move as a search changes which of them show: the rows that stay glide from where they were to
 * their new place, the rows that go fade out where they were, and the rows that come fade in. A group's card resizes
 * along with its rows.
 *
 * Each search renders the list anew, so rows are matched up by their option, and groups by their group, rather than
 * by element: take() notes where the rows in view are before a search, and play() animates the new ones from there
 * after it. The rows that go are gone from the list by then, so copies of their text fade out on a layer over the
 * list, hidden from screen readers and out of reach of the pointer and the keyboard.
 *
 * Only what's in view is measured and animated. A search typed while the last one is still gliding starts from
 * wherever its rows have got to.
 */
export default class Glide {
    static #duration = 280;
    static #easing = "cubic-bezier(.2, .9, .25, 1)";
    static #fadeOutDuration = 120;
    static #fadeInDuration = 200;
    static #fadeInDelay = 140; // So the rows that come show once those that go have faded, and most gliding is done.

    // Left off the copies of the rows that go: they'd clash with the real rows, or let the copies be focused.
    static #skipAttributes = new Set(["id", "tabindex", "role", "type", "title", "aria-labelledby"]);

    #popover;
    #layer = null;

    constructor(popover) {
        this.#popover = popover;
    }

    /**
     * Notes where the rows and groups are, before a search renders the list anew. `rows` gives each row in order as
     * { key, group, button }, keyed by its option; `groups` maps each group to its item (its header, then its card).
     * Every rendered row is noted, also those scrolled out of view: one that the search brings into view glides in
     * from where it was, rather than showing up in the way of those gliding past it.
     */
    take(scroller, rows, groups) {
        const takenRows = new Map();
        for (const { key, group, button } of rows)
            takenRows.set(key, { rect: button.parentElement.getBoundingClientRect(), group, button });

        const takenGroups = new Map();
        for (const [group, item] of groups) {
            const [header, card] = item.children;
            takenGroups.set(group, { header, card, headerRect: header.getBoundingClientRect(),
                cardRect: card.getBoundingClientRect() });
        }

        return { view: scroller.getBoundingClientRect(), rows: takenRows, groups: takenGroups };
    }

    /**
     * Animates the rows and groups rendered by a search from where take() found them before it. Only what was in
     * view, or is now, moves.
     */
    play(taken, scroller, rows, groups) {
        const view = scroller.getBoundingClientRect();
        const shown = new Map(); // key -> row, for every row the search shows
        for (const row of rows) shown.set(row.key, row);

        // The rows and groups that go fade out where they were. A row whose whole group goes, goes with its card.
        const layer = this.#layerOver(scroller);
        for (const [key, row] of taken.rows) {
            if (shown.has(key) || (row.group && !groups.has(row.group)) || !Glide.#inView(taken.view, row.rect))
                continue;
            this.#fadeOut(layer, row.button, row.rect);
        }
        for (const [group, old] of taken.groups) {
            if (groups.has(group)) continue;
            if (Glide.#inView(taken.view, old.headerRect)) this.#fadeOut(layer, old.header, old.headerRect);
            if (Glide.#inView(taken.view, old.cardRect)) this.#fadeOut(layer, old.card, old.cardRect);
        }

        // Groups that stay glide, their cards resizing with their rows; groups that come fade in.
        const cards = new Map(); // group -> its card's new place, for the rows on it
        for (const [group, item] of groups) {
            const [header, card] = item.children;
            const headerRect = header.getBoundingClientRect();
            const cardRect = card.getBoundingClientRect();
            cards.set(group, cardRect);

            const old = taken.groups.get(group);
            const inView = Glide.#inView(view, headerRect) || Glide.#inView(view, cardRect);
            if (!old) {
                if (inView) Glide.#fadeIn(item);
                continue;
            }
            if (!inView && !Glide.#inView(taken.view, old.headerRect) && !Glide.#inView(taken.view, old.cardRect))
                continue;

            Glide.#glide(header, old.headerRect.top - headerRect.top);
            const offset = old.cardRect.top - cardRect.top;
            if (Math.abs(offset) < .5 && Math.abs(old.cardRect.height - cardRect.height) < .5) continue;
            card.animate([
                { translate: `0 ${offset}px`, height: `${old.cardRect.height}px` },
                { translate: "0 0", height: `${cardRect.height}px` },
            ], { duration: Glide.#duration, easing: Glide.#easing });
        }

        // Rows that stay glide, on their card if they're on one; rows that come fade in, unless their group does.
        for (const { key, group, button } of shown.values()) {
            const item = button.parentElement;
            const rect = item.getBoundingClientRect();
            const old = taken.rows.get(key);
            if (!old) {
                if (Glide.#inView(view, rect) && (!group || taken.groups.has(group))) Glide.#fadeIn(item);
                continue;
            }
            if (!Glide.#inView(view, rect) && !Glide.#inView(taken.view, old.rect)) continue;

            const oldCard = group && taken.groups.get(group)?.cardRect;
            const card = group && cards.get(group);
            Glide.#glide(item, oldCard && card
                ? (old.rect.top - oldCard.top) - (rect.top - card.top)
                : old.rect.top - rect.top);
        }
    }

    static #inView(view, rect) {
        return rect.bottom > view.top && rect.top < view.bottom && rect.height > 0;
    }

    static #glide(element, offset) {
        if (Math.abs(offset) < .5) return;
        element.animate([{ translate: `0 ${offset}px` }, { translate: "0 0" }],
            { duration: Glide.#duration, easing: Glide.#easing });
    }

    static #fadeIn(element) {
        element.animate([{ opacity: 0 }, { opacity: 1 }],
            { duration: Glide.#fadeInDuration, delay: Glide.#fadeInDelay, easing: "ease-out", fill: "backwards" });
    }

    /**
     * Fades out a copy of something that's gone from the list, where it was: its text, without the card behind it.
     * The sheet's cards are see-through, so a copy with its card would darken whatever glides under it, and leave a
     * lighter strip where a gap opens. The cards that stay draw the background as they glide into place.
     */
    #fadeOut(layer, element, rect) {
        const copy = Glide.#copy(element);
        const box = layer.getBoundingClientRect();
        Object.assign(copy.style, {
            position: "absolute",
            top: `${rect.top - box.top}px`,
            left: `${rect.left - box.left}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            margin: "0",
            boxSizing: "border-box",
            background: "none",
            boxShadow: "none",
        });
        layer.append(copy);

        const fade = copy.animate([{ opacity: 1 }, { opacity: 0 }],
            { duration: Glide.#fadeOutDuration, easing: "ease-out", fill: "forwards" });
        fade.finished.then(() => copy.remove(), () => copy.remove());
    }

    /**
     * A copy that looks the same and does nothing: buttons become divs with the same classes and state, so nothing
     * that looks for rows or focusable elements finds them.
     */
    static #copy(element) {
        const copy = element.cloneNode(true);
        const plain = node => {
            for (const name of Glide.#skipAttributes) node.removeAttribute(name);
            if (node.localName !== "button") return node;

            const div = document.createElement("div");
            for (const { name, value } of node.attributes) div.setAttribute(name, value);
            if (node.disabled) div.setAttribute("aria-disabled", "true");
            div.removeAttribute("disabled");
            div.append(...node.childNodes);
            return div;
        };

        for (const node of copy.querySelectorAll("*")) {
            const replaced = plain(node);
            if (replaced !== node) node.replaceWith(replaced);
        }
        return plain(copy);
    }

    /** The layer the copies fade out on: over the list, and clipped to it. */
    #layerOver(scroller) {
        let layer = this.#layer;
        if (!layer) {
            layer = this.#layer = document.createElement("div");
            layer.className = "pp-glide-layer";
            layer.setAttribute("aria-hidden", "true");
            layer.inert = true;
        }
        if (layer.parentElement !== this.#popover) this.#popover.append(layer);

        Object.assign(layer.style, {
            top: `${scroller.offsetTop}px`,
            left: `${scroller.offsetLeft}px`,
            width: `${scroller.clientWidth}px`,
            height: `${scroller.clientHeight}px`,
        });
        return layer;
    }
}