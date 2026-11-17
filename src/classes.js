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
    host: "dropdown",                                                   // <platy-picker>
    select: "",                                                         // the <select> it wraps
    menu: "dropdown-menu rounded-3 shadow p-0",                         // the popover
    bar: "input-group p-2 bg-body-tertiary border-bottom sticky-top",   // the search box and buttons above the list
    search: "form-control form-control-sm",                             // the search box
    button: "btn btn-outline-secondary btn-sm",                         // select all and select none
    list: "list-unstyled d-grid gap-1 p-2 mb-0",                        // the <ul> of options
    item: "dropdown-item rounded-2",                                    // an option's row
    itemSelected: "active",                                             // a row whose option is selected
    itemDisabled: "disabled",                                           // a row whose option is disabled
    label: "",                                                          // a row's label
    subtext: "text-body-tertiary",                                      // a row's subtext (data-subtext)
    header: "dropdown-header",                                          // an option group's label
    divider: "dropdown-divider",                                        // an <hr> between options
    placeholder: "placeholder-wave w-100",                              // a skeleton row's content
    placeholderBar: "placeholder col-12 rounded-pill",                  // the bar inside it
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