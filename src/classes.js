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
    search: "",         // the search box
    button: "",         // select all and select none
    list: "",           // the <ul> of options
    item: "",           // an option's row
    itemSelected: "",   // a row whose option is selected
    itemDisabled: "",   // a row whose option is disabled
    label: "",          // a row's label
    subtext: "",        // a row's subtext (data-subtext)
    check: "",          // a row's check mark, shown while its option is selected
    header: "",         // an option group's label
    divider: "",        // an <hr> between options
    placeholder: "",    // a skeleton row's content
    placeholderBar: "", // the bar inside it
};

const fixed = {
    select: "pp-select",
    menu: "pp-menu",
    bar: "pp-bar",
    search: "pp-search",
    button: "pp-button",
    list: "pp-list",
    item: "pp-item",
    label: "pp-item-label",
    subtext: "pp-item-subtext",
    check: "pp-item-check",
    header: "pp-header",
    divider: "pp-divider",
    placeholder: "pp-placeholder",
    placeholderBar: "pp-placeholder-bar",
};

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