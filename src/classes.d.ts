/**
 * The classes Platypicker puts on the elements it creates.
 *
 * Every part gets a fixed pp-* class, which the script and platypicker.css rely on, plus the classes in its plug.
 * The plugs are the hook for skins: a skin fills them with its framework's classes, and is imported before any
 * picker is created. Elements read their plug when they are created, the state plugs (itemSelected, itemDisabled)
 * whenever their state changes.
 */

/** The parts of a picker that have a class plug. */
export interface Classes {
    /** `<platy-picker>`. A skin that dresses the picker in a framework's classes includes `pp-skin` here. */
    host: string;
    /** The `<select>` it wraps (`pp-select`). */
    select: string;
    /** The popover (`pp-menu`). */
    menu: string;
    /** The search box and buttons above the list (`pp-bar`). */
    bar: string;
    /** The grab handle at the top of the sheet, with `layout="sheet"` (`pp-handle`). */
    handle: string;
    /** The sheet's heading: its title and selected count (`pp-heading`). */
    heading: string;
    /** The sheet's title, the select's label (`pp-title`). */
    title: string;
    /** How many options are selected, under the sheet's title, in a multiple select (`pp-selected-count`). */
    selectedCount: string;
    /** The search box, with the sheet's Cancel button beside it (`pp-search-row`). */
    searchRow: string;
    /** The search box (`pp-search`). */
    search: string;
    /** Select all and select none, and the sheet's Cancel (`pp-button`). */
    button: string;
    /** The `<ul>` of options (`pp-list`). */
    list: string;
    /** An option's row (`pp-item`). */
    item: string;
    /** State plug: a row whose option is selected. */
    itemSelected: string;
    /** State plug: a row whose option is disabled, or can't be picked as `max` options are selected. */
    itemDisabled: string;
    /** A row's picture before the label, from `data-image` (`pp-item-image`). */
    image: string;
    /** A row's icon before the label, from `data-icon` (`pp-item-icon`). */
    icon: string;
    /** A row's label (`pp-item-label`). */
    label: string;
    /** A row's subtext, from `data-subtext` (`pp-item-subtext`). */
    subtext: string;
    /** A row's check mark, shown while its option is selected (`pp-item-check`). */
    check: string;
    /** An option group: its header and the list of its rows (`pp-group`). */
    group: string;
    /** The list of a group's rows (`pp-group-list`). */
    groupList: string;
    /** An option group's label (`pp-header`). */
    header: string;
    /** An `<hr>` between options (`pp-divider`). */
    divider: string;
    /** "No matches", under the list when a search finds nothing (`pp-empty`). */
    empty: string;
    /** How many options there are, or match the search, at the bottom, with the `counter` attribute (`pp-counter`). */
    counter: string;
    /** A skeleton row's content (`pp-placeholder`). */
    placeholder: string;
    /** The bar inside a skeleton row (`pp-placeholder-bar`). */
    placeholderBar: string;
    /** The badges over a closed multiple select (`pp-tags`). */
    tags: string;
    /** A badge (`pp-tag`). */
    tag: string;
    /** A badge's picture, from `data-image` (`pp-tag-image`). */
    tagImage: string;
    /** A badge's icon, from `data-icon` (`pp-tag-icon`). */
    tagIcon: string;
    /** A badge's label (`pp-tag-label`). */
    tagLabel: string;
    /** A badge's remove button (`pp-tag-remove`). */
    tagRemove: string;
    /** The "+N" count of the badges that don't fit (`pp-tag-count`). */
    tagCount: string;
    /** Shown instead of badges while nothing is selected (`pp-tags-placeholder`). */
    tagsPlaceholder: string;
}

/** The name of a part with a class plug. */
export type PartName = keyof Classes;

/**
 * The extra classes each part gets, on top of its fixed pp-* class, as a space-separated string. Empty by default.
 * The same object is `PlatyPicker.classes`. Fill it before any picker is created.
 */
export const classes: Classes;