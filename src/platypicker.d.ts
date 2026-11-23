import type { Classes } from "./classes.js";
import type { Texts } from "./languages.js";

export type { Classes, PartName } from "./classes.js";
export type { CountedText, PluralForms, Texts } from "./languages.js";

/** How a picker opens. See `PlatyPicker.layout`. */
export type Layout = "auto" | "sheet" | "popover" | "native";

/** The `detail` of a `loadmore` event. */
export interface LoadMoreDetail {
    /** What's in the search box, trimmed. Empty when not searching. */
    search: string;
    /** How many options to send: the picker's batch size. */
    batchSize: number;
}

/** The events a picker fires, on top of an element's own. */
export interface PlatyPickerEventMap extends HTMLElementEventMap {
    /**
     * More options are wanted, while `loading` is set: as soon as fewer than a batch are left to show, and again
     * whenever the end of the list comes into view. It bubbles.
     */
    loadmore: CustomEvent<LoadMoreDetail>;
}

/**
 * `<platy-picker>`: a searchable popover for the native `<select>` inside it, with badges for a multiple select,
 * long lists, a sheet on phones and 22 languages. The select stays the source of truth: its options are the list,
 * and picking sets them and fires `change` on it.
 *
 * Custom states: `:state(open)` while the picker is open, `:state(sheet)` while it opens as a sheet,
 * `:state(native)` while it uses the browser's own picker, and `:state(full)` while `max` options are selected.
 */
export default class PlatyPicker extends HTMLElement {
    /** How many rows are rendered at a time. A `batch-size` attribute on the element overrides it. Default 50. */
    static defaultBatchSize: number;

    /**
     * The media query under which a picker with `layout="auto"` (the default) opens as a sheet at the bottom of the
     * screen rather than a popover by its select: by default, a touch screen the size of a phone, either way up.
     * It's checked each time a picker opens.
     */
    static sheetMedia: string;

    /**
     * The extra classes each part gets, on top of its fixed pp-* class. A skin fills these with a framework's
     * classes, and must be imported before any picker is created. The same object is `classes` in
     * `platypicker/src/classes.js`.
     */
    static classes: Classes;

    /**
     * The texts, in English by default, for pickers whose language has no translation, and for whatever a language
     * leaves out.
     */
    static languageMap: Texts;

    /**
     * Languages of the page's own, by code ("de", "pt-BR"): each an object of texts like `languageMap`. A picker uses
     * the one of its nearest `lang` attribute, over Platypicker's own translation of it, if there is one.
     */
    static languages: Record<string, Partial<Texts>>;

    /** The picker that enhances a given `<select>`, if there is one. */
    static get(select: HTMLSelectElement): PlatyPicker | undefined;

    static readonly observedAttributes: string[];

    /**
     * Sets the select's value and updates the picker right away, without firing a `change` event. Changing the
     * selection from script otherwise shows only once the picker opens or closes.
     */
    setValue(value: string): void;

    /** Shows a filter input at the top of the list. Reflects the `search` attribute. */
    get search(): boolean;
    set search(value: boolean);

    /** Shows All / None buttons beside the search box. Reflects the `controls` attribute. */
    get controls(): boolean;
    set controls(value: boolean);

    /** Shows how many options there are, or how many match the search, under the list. Reflects `counter`. */
    get counter(): boolean;
    set counter(value: boolean);

    /**
     * How many skeleton rows to show at the end of the list while more options are on their way, or `undefined`
     * while off. The attribute without a valid non-negative integer means 10. Reflects `placeholders`.
     */
    get placeholders(): number | undefined;
    set placeholders(value: number | boolean);

    /**
     * How many options the list works with at a time: the rows shown first, how far ahead it searches, and the page
     * size `loadmore` suggests. 0 turns batching off, and a missing or invalid value means
     * `PlatyPicker.defaultBatchSize`. Reflects `batch-size`.
     */
    get batchSize(): number;
    set batchSize(value: number);

    /**
     * Says that more options are on their way, as when the page fetches them as the user scrolls. While it's set,
     * the end of the list stays marked, and a `loadmore` event asks for more. Reflects `loading`.
     */
    get loading(): boolean;
    set loading(value: boolean);

    /** Shown in a multiple select while nothing is selected. Reflects `placeholder`. */
    get placeholder(): string;
    set placeholder(value: string);

    /**
     * How the picker opens: `"popover"` by its select, `"sheet"` at the bottom of the screen, `"auto"` (the default),
     * a sheet where `PlatyPicker.sheetMedia` matches and a popover elsewhere, or `"native"`, the browser's own
     * picker, which never asks for more options. A missing or invalid value reads as `"auto"`. Reflects `layout`.
     */
    get layout(): Layout;
    set layout(value: Layout);

    /**
     * How many options a multiple select takes at most, or `undefined` for no limit. Once that many are selected,
     * the others can't be picked until one is unpicked. It only holds back the user: markup and script can select
     * more. Single selects and `layout="native"` ignore it. Setting `undefined` or `null` removes it. Reflects `max`.
     */
    get max(): number | undefined;
    set max(value: number | null | undefined);

    addEventListener<K extends keyof PlatyPickerEventMap>(
        type: K,
        listener: (this: PlatyPicker, event: PlatyPickerEventMap[K]) => any,
        options?: boolean | AddEventListenerOptions,
    ): void;
    addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
    ): void;
    removeEventListener<K extends keyof PlatyPickerEventMap>(
        type: K,
        listener: (this: PlatyPicker, event: PlatyPickerEventMap[K]) => any,
        options?: boolean | EventListenerOptions,
    ): void;
    removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions,
    ): void;
}

declare global {
    interface HTMLElementTagNameMap {
        "platy-picker": PlatyPicker;
    }
}