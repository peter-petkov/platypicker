/**
 * A text with a count, for the counts' plural forms. One of:
 *
 * - a string with `{count}`, and the text's other numbers, like `{total}`;
 * - plural forms picked by the language's plural rules, `other` being the fallback:
 *   `{ one: "{count} match", other: "{count} matches" }`;
 * - a function of the count and the other numbers, which gets them unformatted.
 *
 * `Numbers` are the text's other numbers, by name.
 */
export type CountedText<Numbers extends Record<string, number> = {}> =
    | string
    | PluralForms
    | ((count: number, numbers: Numbers) => string);

/** A text's plural forms, by Intl.PluralRules category. `other` is used for any form that's left out. */
export interface PluralForms {
    zero?: string;
    one?: string;
    two?: string;
    few?: string;
    many?: string;
    other: string;
}

/** The texts of a picker, in one language. */
export interface Texts {
    /** The search box's placeholder. English: "Type to filter...". */
    searchPlaceholder: string;
    /** The search box's accessible name. English: "Search". */
    searchLabel: string;
    /** The select all button. English: "All". */
    selectAllLabel: string;
    /** The select none button. English: "None". */
    selectNoneLabel: string;
    /** A badge's remove button, for screen readers. English: "Remove". */
    removeLabel: string;
    /** Under the list when a search finds nothing. English: "No matches". */
    noMatchesLabel: string;
    /** What screen readers hear once typing in the search box pauses: how many options match. */
    matchesLabel: CountedText;
    /** The counter (the `counter` attribute): how many rows of all the options are shown so far. */
    shownLabel: CountedText<{ total: number }>;
    /** The counter while `loading`: how many options are loaded so far. */
    loadedLabel: CountedText;
    /** The counter while searching: how many options match, of how many. */
    filteredLabel: CountedText<{ total: number }>;
    /** Under the sheet's title in a multiple select: how many options are selected. */
    selectedLabel: CountedText;
    /** The same with a limit (the `max` attribute). */
    selectedOfMaxLabel: CountedText<{ max: number }>;
    /** What screen readers hear when the limit (the `max` attribute) is reached. Its count is the limit. */
    limitReachedLabel: CountedText<{ max: number }>;
    /** Beside the sheet's search box while searching: clears the search and puts the keyboard away. */
    cancelLabel: string;
}

/**
 * Languages registered by the page, by code ("de", "pt-BR"). Each wins over a shipped translation of the same
 * language, text by text, so it can change a single text or be a whole language of its own. The same object is
 * `PlatyPicker.languages`.
 */
export const languages: Record<string, Partial<Texts>>;