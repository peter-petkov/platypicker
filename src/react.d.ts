// <platy-picker> in JSX, for React, Preact's React compat and other renderers that use React's types. Opt in with
// import type {} from "platypicker/src/react.js"; in any one file of the project. Needs @types/react. It's a
// type-only import: there's no react.js to load.
//
// React 18 sets every prop of a custom element as an attribute, so leave a boolean out rather than passing false:
// search={false} would still turn it on. React 19 sets the properties, which takes false as off.
import type { HTMLAttributes, DetailedHTMLProps } from "react";
import type PlatyPicker from "./platypicker.js";
import type { Layout, LoadMoreDetail } from "./platypicker.js";

/** The props of `<platy-picker>`: its attributes, and the loadmore event in React 19. */
export interface PlatyPickerProps extends DetailedHTMLProps<HTMLAttributes<PlatyPicker>, PlatyPicker> {
    /** Shows a filter input at the top of the list. */
    search?: boolean;
    /** Shows All / None buttons beside the search box. */
    controls?: boolean;
    /** Shows how many options there are, or how many match the search, under the list. */
    counter?: boolean;
    /** Skeleton rows at the end of the list while more options are on their way. `true` means 10. */
    placeholders?: number | boolean;
    /** How many options the list works with at a time. */
    "batch-size"?: number;
    /** Shown in a multiple select while nothing is selected. */
    placeholder?: string;
    /** Says that more options are on their way. */
    loading?: boolean;
    /** How the picker opens. */
    layout?: Layout;
    /** How many options a multiple select takes at most. */
    max?: number;
    /** More options are wanted, while `loading` is set. React 19 and later. */
    onloadmore?: (event: CustomEvent<LoadMoreDetail>) => void;
}

declare module "react" {
    namespace JSX {
        interface IntrinsicElements {
            "platy-picker": PlatyPickerProps;
        }
    }
}