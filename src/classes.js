"use strict";

/**
 * The classes Platypicker puts on the elements it creates.
 *
 * Every part gets a fixed pp-* class, which the script and platypicker.css rely on, plus the classes in its plug
 * below. The plugs are the hook for framework presets: a preset fills them with its framework's classes, and is
 * imported before any picker is created. Elements read their plug when they are created, the state plugs
 * (itemSelected, itemDisabled) whenever their state changes.
 */
export const classes = {
    host: "",           // <platy-picker>
    select: "",         // the <select> it wraps
    menu: "",           // the popover
    bar: "",            // the search box and buttons above the list
    handle: "",         // the grab handle at the top of the sheet (layout="sheet")
    heading: "",        // the sheet's heading: its title and selected count
    title: "",          // the sheet's title, the select's label
    selectedCount: "",  // how many options are selected, under the sheet's title (multiple selects)
    searchRow: "",      // the search box, with the sheet's Cancel button beside it
    search: "",         // the search box
    button: "",         // select all and select none, and the sheet's Cancel
    list: "",           // the <ul> of options
    item: "",           // an option's row
    itemSelected: "",   // a row whose option is selected
    itemDisabled: "",   // a row whose option is disabled, or can't be picked as max options are selected
    image: "",          // a row's picture before the label (data-image)
    icon: "",           // a row's icon before the label (data-icon)
    label: "",          // a row's label
    subtext: "",        // a row's subtext (data-subtext)
    check: "",          // a row's check mark, shown while its option is selected
    group: "",          // an option group: its header and the list of its rows
    groupList: "",      // the list of a group's rows
    header: "",         // an option group's label
    divider: "",        // an <hr> between options
    empty: "",          // "No matches", under the list when a search finds nothing
    counter: "",        // how many options there are, or match the search, at the bottom (the counter attribute)
    placeholder: "",    // a skeleton row's content
    placeholderBar: "", // the bar inside it
    tags: "",           // the badges over a closed multiple select
    tag: "",            // a badge
    tagImage: "",       // a badge's picture (data-image)
    tagIcon: "",        // a badge's icon (data-icon)
    tagLabel: "",       // a badge's label
    tagRemove: "",      // a badge's remove button
    tagCount: "",       // the "+N" count of the badges that don't fit
    tagsPlaceholder: "", // shown instead of badges while nothing is selected
};

const fixed = {
    select: "pp-select",
    menu: "pp-menu",
    bar: "pp-bar",
    handle: "pp-handle",
    heading: "pp-heading",
    title: "pp-title",
    selectedCount: "pp-selected-count",
    searchRow: "pp-search-row",
    search: "pp-search",
    button: "pp-button",
    list: "pp-list",
    item: "pp-item",
    image: "pp-item-image",
    icon: "pp-item-icon",
    label: "pp-item-label",
    subtext: "pp-item-subtext",
    check: "pp-item-check",
    group: "pp-group",
    groupList: "pp-group-list",
    header: "pp-header",
    divider: "pp-divider",
    empty: "pp-empty",
    counter: "pp-counter",
    status: "pp-status",
    placeholder: "pp-placeholder",
    placeholderBar: "pp-placeholder-bar",
    tags: "pp-tags",
    tag: "pp-tag",
    tagImage: "pp-tag-image",
    tagIcon: "pp-tag-icon",
    tagLabel: "pp-tag-label",
    tagRemove: "pp-tag-remove",
    tagCount: "pp-tag-count",
    tagsPlaceholder: "pp-tags-placeholder",
};

/** A part's fixed pp-* class. */
export const fixedClass = part => fixed[part];

const plug = part => String(classes[part] ?? "").split(/\s+/).filter(Boolean);

/** Adds a part's fixed class and the classes in its plug. */
export function addClasses(element, part) {
    element.classList.add(...[fixed[part], ...plug(part)].filter(Boolean));
}

/** Removes a part's fixed class and the classes in its plug. */
export function removeClasses(element, part) {
    element.classList.remove(...[fixed[part], ...plug(part)].filter(Boolean));
}

/** Adds or removes the classes in a state plug. */
export function toggleClasses(element, part, force) {
    for (const name of plug(part)) element.classList.toggle(name, force);
}