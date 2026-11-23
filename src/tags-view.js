"use strict";

import { addClasses } from "./classes.js";
import { hideBrokenImages, syncIcon, syncImage } from "./decorations.js";

/**
 * The badges shown over a closed multiple select: one per selected option, on one line, with a "+N" count for
 * those that don't fit. Each badge has a remove button, except the last one left on a required select.
 *
 * The layer is anchored over the select and lets clicks through to it, so the select still opens the popover, takes
 * focus and is what forms and screen readers see. Only the remove buttons catch clicks, and they are mouse only:
 * the layer is hidden from assistive technology, which reads the selection from the select itself.
 */
export default class TagsView {
    // At most this many badges are made. More than fit on one line is pointless, and select all on a long list
    // mustn't make thousands of them.
    static #maxTags = 20;

    #select;
    #actions;
    #root;
    #placeholder;
    #count;
    #tags = [];                         // { element, image, icon, label, remove }, the first `#shown` in use
    #shown = 0;
    #total = 0;
    #config = {};
    #optionsByRemove = new WeakMap();
    #resizeObserver;

    constructor({ select, actions, signal }) {
        this.#select = select;
        this.#actions = actions;

        this.#root = document.createElement("div");
        this.#root.setAttribute("aria-hidden", "true");
        addClasses(this.#root, "tags");

        this.#placeholder = document.createElement("span");
        addClasses(this.#placeholder, "tagsPlaceholder");

        this.#count = document.createElement("span");
        addClasses(this.#count, "tagCount");

        this.#root.append(this.#placeholder, this.#count);
        select.insertAdjacentElement("afterend", this.#root);

        this.#root.addEventListener("click", e => {
            const option = this.#optionsByRemove.get(e.target.closest(".pp-tag-remove"));
            if (!option) return;

            e.preventDefault(); // Inside a <label>, the click would otherwise go on to the select and open it.
            this.#actions.remove(option);
        }, { signal });

        hideBrokenImages(this.#root, ["tagImage"], signal);

        this.#resizeObserver = new ResizeObserver(() => this.#fit());
        this.#resizeObserver.observe(select);
    }

    destroy() {
        this.#resizeObserver.disconnect();
        this.#root.remove();
        this.#tags = [];
    }

    /** Applies the element's settings: { placeholder, removeLabel, formatCount }. */
    configure(config) {
        this.#config = config;
        this.#placeholder.textContent = config.placeholder ?? "";
        for (const tag of this.#tags) tag.remove.title = config.removeLabel ?? "";
        this.refresh();
    }

    /** "+N", with N in the picker's language. */
    #formatCount(count) {
        return this.#config.formatCount?.(count) ?? `+${count}`;
    }

    /** Reads which options are selected and shows them. Inexpensive however many there are. */
    refresh() {
        const options = [];
        let total = 0;

        for (const option of this.#select.selectedOptions) {
            if (option.hidden || option.parentElement?.hidden) continue;

            total++;
            if (options.length < TagsView.#maxTags) options.push(option);
        }

        // The last selected option of a required select can't be removed here.
        const removable = !(this.#select.required && total === 1);

        options.forEach((option, i) => {
            const tag = this.#tags[i] ?? this.#createTag();
            const text = option.textContent.trim();

            if (tag.label.textContent !== text) tag.label.textContent = text;
            tag.icon = syncIcon(tag.icon, (option.dataset.icon ?? "").trim(), "tagIcon", tag.label);
            tag.image = syncImage(tag.image, (option.dataset.image ?? "").trim(), "tagImage", tag.icon ?? tag.label);
            tag.remove.hidden = !removable;
            this.#optionsByRemove.set(tag.remove, option);
        });

        for (let i = options.length; i < this.#shown; i++) this.#tags[i].element.remove();
        for (let i = this.#shown; i < options.length; i++) this.#count.before(this.#tags[i].element);

        this.#shown = options.length;
        this.#total = total;
        this.#placeholder.hidden = total > 0;
        this.#fit();
    }

    #createTag() {
        const element = document.createElement("span");
        addClasses(element, "tag");

        const label = document.createElement("span");
        addClasses(label, "tagLabel");

        const remove = document.createElement("span");
        remove.title = this.#config.removeLabel ?? "";
        addClasses(remove, "tagRemove");

        element.append(label, remove);

        const tag = { element, image: null, icon: null, label, remove };
        this.#tags.push(tag);
        return tag;
    }

    /**
     * Shows as many badges as fit on the line, leaving room for the count of the rest. The first badge is always
     * shown, and is cut short when even it doesn't fit.
     */
    #fit() {
        const tags = this.#tags.slice(0, this.#shown);
        const count = this.#count;

        if (!tags.length) {
            count.hidden = true;
            return;
        }

        // Measured at full width: nothing may shrink while the badges are measured.
        this.#root.toggleAttribute("data-measuring", true);
        for (const tag of tags) tag.element.hidden = false;
        count.hidden = false;
        count.textContent = this.#formatCount(this.#total); // The widest the count can get.

        // Distances along the line from its start edge: the left, or the right in a right-to-left page.
        const style = getComputedStyle(this.#root);
        const box = this.#root.getBoundingClientRect();
        const rtl = style.direction === "rtl";
        const endOf = rect => rtl ? box.right - rect.left : rect.right - box.left;
        const room = box.width - parseFloat(rtl ? style.paddingLeft : style.paddingRight) -
            parseFloat(rtl ? style.borderLeftWidth : style.borderRightWidth);
        const gap = parseFloat(style.columnGap) || 0;
        const countWidth = count.getBoundingClientRect().width;

        let fitting = 1;
        for (let i = 1; i < tags.length; i++) {
            const rest = this.#total - (i + 1);
            if (endOf(tags[i].element.getBoundingClientRect()) + (rest > 0 ? gap + countWidth : 0) > room) break;
            fitting = i + 1;
        }

        for (let i = fitting; i < tags.length; i++) tags[i].element.hidden = true;

        const rest = this.#total - fitting;
        count.hidden = rest === 0;
        count.textContent = this.#formatCount(rest);
        this.#root.toggleAttribute("data-measuring", false);
    }
}