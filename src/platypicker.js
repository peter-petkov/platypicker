"use strict";

export default class PlatyPicker extends HTMLElement {
    static #registry = new WeakMap(); // <select> -> PlatyPicker instance
    static #highlight = new Highlight();
    static #highlightRegistered = false;

    static maxHighlights = 100;

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
    ];

    #internals;
    #select;
    #popover;
    #list;
    #search;
    #selectAllButton;
    #selectNoneButton;
    #abort;
    #ownHighlightRanges = new Set();
    #typeAheadBuffer = "";
    #typeAheadTimer;
    #optionsObserver;
    #havePlaceholdersBeenAppendedAlready;

    constructor() {
        super();
        this.#internals = this.attachInternals();

        if (!PlatyPicker.#highlightRegistered) {
            CSS.highlights.set("platypicker-highlight", PlatyPicker.#highlight);
            PlatyPicker.#highlightRegistered = true;
        }
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

        this.#buildPopover();
        this.#buildControls();
        this.#setListItems();
        this.#wireSelect();
        this.#wireKeyboardTypeAhead();
        this.#wireOptionsObserver();

        PlatyPicker.#registry.set(this.#select, this);
    }

    disconnectedCallback() {
        if (!this.#select || !PlatyPicker.#registry.has(this.#select)) return;

        this.#abort.abort();
        this.#optionsObserver?.disconnect();
        this.#clearOwnHighlights();

        PlatyPicker.#registry.delete(this.#select);
        this.#popover?.remove();

        this.#select.classList.remove("platypicker");
        this.classList.remove("dropdown");

        this.#select = this.#popover = this.#list = null;
        this.#search = this.#selectAllButton = this.#selectNoneButton = null;
        this.#optionsObserver = null;
    }

    attributeChangedCallback(name) {
        if (!this.#search) return; // not connected yet; initial render reads attributes directly

        switch (name) {
            case "search":
                this.#search.classList.toggle("d-none", !this.search);
                break;
            case "controls":
                this.#selectAllButton.disabled = this.#selectNoneButton.disabled = !this.controls;
                break;
            case "search-placeholder":
                this.#search.placeholder = this.searchPlaceholder;
                break;
            case "select-all-label":
                this.#selectAllButton.textContent = this.selectAllLabel;
                break;
            case "select-none-label":
                this.#selectNoneButton.textContent = this.selectNoneLabel;
                break;
            case "placeholders":
                if (this.placeholders && !this.#havePlaceholdersBeenAppendedAlready) {
                    this.#appendPlaceholders(this.placeholders);
                    this.#havePlaceholdersBeenAppendedAlready = true;
                } else if (!this.placeholders) {
                    this.querySelectorAll("li:has(.dropdown-item .placeholder)")
                        ?.forEach(el => el.remove());
                    this.#havePlaceholdersBeenAppendedAlready = false;
                }

                break;
        }
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

    // -----------------------------------------------------------------
    // Popover & controls construction
    // -----------------------------------------------------------------

    #buildPopover() {
        this.#popover = document.createElement("div");
        this.#popover.classList.add("dropdown-menu", "rounded-3", "shadow", "p-0");
        this.#popover.popover = "manual";
        this.#select.insertAdjacentElement("afterend", this.#popover);

        this.#list = document.createElement("ul");
        this.#list.classList.add("list-unstyled", "d-grid", "gap-1", "p-2", "mb-0");
    }

    #buildControls() {
        const { signal } = this.#abort;

        const form = document.createElement("form");
        form.classList.add("input-group", "p-2", "bg-body-tertiary", "border-bottom", "sticky-top");
        form.addEventListener("submit", e => e.preventDefault(), { signal });
        this.#popover.append(form);

        this.#search = document.createElement("input");
        this.#search.type = "search";
        this.#search.name = "platypicker-search";
        this.#search.autofocus = true;
        this.#search.classList.add("form-control", "form-control-sm");
        this.#search.placeholder = this.searchPlaceholder;
        this.#search.classList.toggle("d-none", !this.search);
        this.#search.addEventListener("input", () => this.#filterList(this.#search.value), { signal });
        this.#search.addEventListener("keydown", e => {
            if (e.code === "Escape") this.#select.click();
        }, { signal });
        form.append(this.#search);

        this.#selectAllButton = this.#buildActionButton(this.selectAllLabel, () => {
            for (const option of [...this.#select.options].filter(o => this.#isSelectable(o)))
                option.selected = true;
            this.#select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        this.#selectAllButton.classList.toggle("d-none", !this.controls || !this.#select.multiple);
        form.append(this.#selectAllButton);

        this.#selectNoneButton = this.#buildActionButton(this.selectNoneLabel, () => {
            this.#select.value = "";
            this.#select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        this.#selectNoneButton.classList.toggle("d-none", !this.controls || this.#select.required);
        form.append(this.#selectNoneButton);

        this.#popover.append(this.#list);
    }

    #buildActionButton(label, onClick) {
        const button = document.createElement("button");
        button.type = "button";
        button.classList.add("btn", "btn-outline-secondary", "btn-sm");
        button.textContent = label;
        button.disabled = !this.controls;
        button.addEventListener("click", onClick, { signal: this.#abort.signal });
        return button;
    }

    #isSelectable(option) {
        return !option.disabled &&
            !option.closest("optgroup")?.disabled &&
            !option.popoverItem?.classList.contains("d-none");
    }

    // -----------------------------------------------------------------
    // List rendering (mirrors <select>'s options/optgroups/<hr>s)
    // -----------------------------------------------------------------

    #setListItems() {
        this.#list.replaceChildren();

        for (const child of this.#select.children) {
            if (child.hidden) continue;

            if (child instanceof HTMLOptionElement) {
                this.#addOptionItem(child);
            } else if (child instanceof HTMLOptGroupElement) {
                const header = document.createElement("h6");
                header.classList.add("dropdown-header");
                header.textContent = child.label;
                this.#list.append(this.#wrapInListItem(header));
                child.header = header;

                for (const option of child.children) {
                    if (option.hidden) continue;

                    this.#addOptionItem(option);
                }

                if (child.nextElementSibling instanceof HTMLOptionElement) {
                    const divider = document.createElement("hr");
                    divider.classList.add("dropdown-divider");
                    this.#list.append(this.#wrapInListItem(divider));
                    child.divider = divider;
                }
            } else if (child instanceof HTMLHRElement) {
                const divider = document.createElement("hr");
                divider.classList.add("dropdown-divider");
                this.#list.append(this.#wrapInListItem(divider));
            }
        }

        if (this.placeholders && !this.#havePlaceholdersBeenAppendedAlready) {
            this.#appendPlaceholders(this.placeholders);
            this.#havePlaceholdersBeenAppendedAlready = true;
        }
    }

    #appendPlaceholders(count = 10) {
        for (let i = 0; i < count; i++) {
            this.#addOptionItem({
                innerHTML:
                    `<div class="placeholder-wave w-100">
                        <span class="placeholder col-12 rounded-pill"></span>
                    </div>`
            }, true);
        }
    }

    #wrapInListItem(element) {
        const li = document.createElement("li");
        li.append(element);
        return li;
    }

    #addOptionItem(option, isPlaceholder = false) {
        const item = document.createElement("button");
        item.type = "button";
        item.classList.add("dropdown-item", "rounded-2");
        item.innerHTML = option.innerHTML;
        if (!isPlaceholder) {
            if (option.title) item.title = option.title;
            if (option.selected && !option.disabled) item.classList.add("active");
            if (option.disabled || option?.closest("optgroup")?.disabled) item.classList.add("disabled");

            const subtext = document.createElement("small");
            subtext.classList.add("text-body-tertiary");
            subtext.textContent = option.dataset?.subtext ?? "";
            item.append(subtext);

            item.option = option;
            option.popoverItem = item;

            item.addEventListener("click", () =>
                this.#activateOption(option, item), { signal: this.#abort.signal });
        } else item.disabled = true;

        this.#list.append(this.#wrapInListItem(item));

        const query = this.#search.value.trim().toLowerCase();
        if (query) this.#highlightMatch(item, query);
    }

    #activateOption(option, item) {
        if (this.#select.multiple) {
            option.selected = !option.selected;
        } else {
            this.#select.value = option.value;
            this.#refreshSelectionState();
            this.#popover.hidePopover();
        }

        item.scrollIntoView({ block: "nearest" });
        if (!this.#select.multiple) this.#select.focus();
        this.#select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    #refreshSelectionState() {
        const query = this.#search.value.trim().toLowerCase();

        for (const item of this.#list.querySelectorAll("li > .dropdown-item:not(:has(.placeholder))")) {
            const option = item.option;
            let changed = false;

            if (item.firstChild.textContent !== option.textContent) {
                item.firstChild.textContent = option.textContent;
                changed = true;
            }

            const subtext = item.querySelector("small");
            if (option.dataset.subtext && subtext.textContent !== option.dataset.subtext) {
                subtext.textContent = option.dataset.subtext;
                changed = true;
            }

            item.classList.remove("active");
            if (changed && query) this.#highlightMatch(item, query);
        }

        for (const option of this.#select.selectedOptions)
            option.popoverItem?.classList.add("active");
    }

    // -----------------------------------------------------------------
    // Filtering & CSS Custom Highlight
    // -----------------------------------------------------------------

    #filterList(rawValue) {
        const query = rawValue.trim().toLowerCase();
        this.#clearOwnHighlights();

        if (!query) {
            for (const el of this.#list.querySelectorAll(".d-none"))
                if (el !== this.#search) el.classList.remove("d-none");

            return;
        }

        let optgroup = null;
        let optgroupHasMatch = false;

        for (const item of this.#list.querySelectorAll("li > .dropdown-item")) {
            const option = item.option;
            const text = option?.textContent?.toLowerCase().trim();
            const subtext = option?.dataset.subtext?.toLowerCase().trim() ?? "";
            const currentOptgroup = option?.closest("optgroup");
            const optgroupLabel = currentOptgroup?.label?.toLowerCase().trim() ?? "";

            if (currentOptgroup !== optgroup) {
                optgroup = currentOptgroup;
                optgroupHasMatch = false;
            }

            const matches = text && text.includes(query) || subtext.includes(query);
            const optgroupMatches = optgroupLabel.includes(query);
            item.classList.toggle("d-none", !matches && !optgroupMatches);

            if (matches) {
                this.#highlightMatch(item, query);
                if (optgroup) {
                    optgroupHasMatch = true;
                    optgroup.header.classList.remove("d-none");
                    optgroup.divider?.classList.remove("d-none");
                }
            } else if (optgroupMatches && !optgroupHasMatch) {
                this.#highlightOptgroupMatch(currentOptgroup.header, query);
                optgroupHasMatch = true;
                optgroup.header.classList.remove("d-none");
                optgroup.divider?.classList.remove("d-none");
            } else if (optgroup && !optgroupHasMatch) {
                optgroup.header.classList.add("d-none");
                optgroup.divider?.classList.add("d-none");
            }
        }
    }

    #highlightMatch(item, query) {
        if (PlatyPicker.#highlight.size >= PlatyPicker.maxHighlights) return;

        const optionText = item.option.textContent.trim().toLowerCase();
        this.#applyHighlightRange(item, "textRange", item.firstChild, optionText, query);

        const optionSubtext = item.option.dataset.subtext?.trim().toLowerCase();
        if (optionSubtext && optionSubtext !== optionText)
            this.#applyHighlightRange(item, "subtextRange", item.querySelector("small").firstChild, optionSubtext, query);
    }

    #highlightOptgroupMatch(item, query) {
        if (PlatyPicker.#highlight.size >= PlatyPicker.maxHighlights) return;

        const optgroupText = item.textContent.trim().toLowerCase();
        this.#applyHighlightRange(item, "textRange", item.firstChild, optgroupText, query);
    }

    #applyHighlightRange(item, key, node, haystack, query) {
        const start = haystack.indexOf(query);
        if (start < 0 || !node) {
            this.#dropHighlightRange(item, key);
            return;
        }

        const range = item[key] ??= new Range();
        range.setStart(node, start);
        range.setEnd(node, start + query.length);
        PlatyPicker.#highlight.add(range);
        this.#ownHighlightRanges.add(range);
    }

    #dropHighlightRange(item, key) {
        if (!item[key]) return;

        PlatyPicker.#highlight.delete(item[key]);
        this.#ownHighlightRanges.delete(item[key]);
        delete item[key];
    }

    // Only clears ranges owned by this instance - a shared Highlight is a
    // page-wide resource, so wiping the whole thing would clobber any other
    // open picker.
    #clearOwnHighlights() {
        for (const range of this.#ownHighlightRanges) PlatyPicker.#highlight.delete(range);
        this.#ownHighlightRanges.clear();
    }

    // -----------------------------------------------------------------
    // Select interaction (open/close, outside click, focus)
    // -----------------------------------------------------------------

    #wireSelect() {
        const { signal } = this.#abort;

        this.#select.addEventListener("click", () => this.#togglePopover(), { signal });

        this.#select.addEventListener("keydown", e => {
            if (e.code === "Enter" || e.code === "Space" || e.code === "ArrowDown")
                this.#togglePopover(true);
        }, { capture: true, signal });

        this.#select.addEventListener("change", async () => {
            if (!this.#select.options.length) return;
            await new Promise(resolve => requestAnimationFrame(resolve)); // let in-flight option mutations settle
            this.#refreshSelectionState();
        }, { signal });

        document.addEventListener("click", e => {
            if (this.#popover.matches(":popover-open") &&
                !this.#popover.contains(e.target) && !this.contains(e.target))
                this.#popover.hidePopover();
        }, { signal });

        document.addEventListener("keydown", e => {
            if (e.code === "Escape" && this.#popover.matches(":popover-open"))
                this.#popover.hidePopover();
        }, { signal });

        this.#popover.addEventListener("toggle", e => {
            this.#internals.states[e.newState === "open" ? "add" : "delete"]("open");

            if (e.newState === "open")
                this.#popover.querySelector("input:not(.d-none), .dropdown-item:not(.disabled, .d-none)")?.focus();
        }, { signal });
    }

    #togglePopover(forceOpen = false) {
        const willOpen = forceOpen || !this.#popover.matches(":popover-open");
        this.#popover.togglePopover(willOpen);
        if (!willOpen) this.#select.focus();
    }

    // -----------------------------------------------------------------
    // Keyboard type-ahead (mirrors native <select> "jump to option" behavior,
    // needed here because the real popover is hidden in favor of ours)
    // -----------------------------------------------------------------

    #wireKeyboardTypeAhead() {
        const { signal } = this.#abort;

        this.#popover.addEventListener("keydown", e => {
            if (this.#search.contains(e.target)) return;

            const char = e.key.toLowerCase();
            if (e.ctrlKey || e.altKey || e.metaKey || !/^[a-z0-9]$/.test(char)) return;

            this.#typeAheadBuffer += char;
            const match = this.#findTypeAheadMatch(this.#typeAheadBuffer);

            if (match) {
                if (this.#select.multiple) {
                    this.#select.selectedIndex = -1;
                    match.selected = true;
                    this.#select.dispatchEvent(new Event("change", { bubbles: true }));
                } else {
                    match.popoverItem.focus();
                }

                requestAnimationFrame(() => match.popoverItem?.scrollIntoView({ block: "nearest" }));

                clearTimeout(this.#typeAheadTimer);
                this.#typeAheadTimer = setTimeout(() => this.#typeAheadBuffer = "", 350);
            } else {
                this.#typeAheadBuffer = "";
            }
        }, { signal });

        this.#list.addEventListener("keydown", e => {
            if (e.code !== "Escape") return;
            this.#popover.hidePopover();
            this.#select.focus();
        }, { capture: true, signal });
    }

    #findTypeAheadMatch(buffer) {
        const isCandidate = option => this.#isSelectable(option) && option.textContent.toLowerCase().trim().startsWith(buffer);

        const current = this.#select.selectedOptions[0];
        return [...this.#select.options].find(o => o !== current && isCandidate(o)) ??
            (current && isCandidate(current) ? current : undefined);
    }

    // -----------------------------------------------------------------
    // Option list synchronization
    // -----------------------------------------------------------------

    #wireOptionsObserver() {
        this.#optionsObserver = new MutationObserver(PlatyPicker.#debounce(() => {
            if (this.#select.options.length !== this.#list.querySelectorAll(".dropdown-item:not(:has(.placeholder))").length ||
                [...this.#select.options].some(o => !o.popoverItem))
                this.#setListItems();
        }, 100));
        this.#optionsObserver.observe(this.#select, { childList: true, subtree: true });
    }

    // -----------------------------------------------------------------
    // Utilities
    // -----------------------------------------------------------------

    static #debounce(fn, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), wait);
        };
    }
}

customElements.define("platy-picker", PlatyPicker);