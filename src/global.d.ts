// The global the scripts in dist/ set, for pages that load one with a <script> tag. Opt in with
// "types": ["platypicker/src/global"] in tsconfig.json or jsconfig.json, or with
// /// <reference types="platypicker/src/global" /> at the top of a file. It brings in the rest of the types too.
import type PlatyPickerClass from "./platypicker.js";

declare global {
    /** The `<platy-picker>` element class, set by the scripts in dist/. */
    var PlatyPicker: typeof PlatyPickerClass;
    /** A `<platy-picker>` element. */
    type PlatyPicker = PlatyPickerClass;
}