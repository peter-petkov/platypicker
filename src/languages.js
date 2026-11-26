"use strict";

import Languages from "burrowkit/languages.js";

/**
 * The texts of a picker, in the language of its nearest lang attribute (see Burrowkit's languages.js).
 *
 * Platypicker ships translations in src/languages/, one file per language, each a plain object of texts as its
 * default export. A language registered in `languages` (PlatyPicker.languages) wins over a shipped translation of the
 * same language, text by text. Whatever a language leaves out comes from PlatyPicker.languageMap, English by default.
 */

/** Languages registered by the page: code -> texts. The same object is PlatyPicker.languages. */
export const languages = {};

export default new Languages({
    // The translations in src/languages/, by code.
    shipped: [
        "ar", "bg", "bn", "de", "es", "fr", "hi", "id", "it", "ja", "ko", "mr", "pl", "pt", "ru", "ta", "te", "tr",
        "ur", "vi", "zh-Hans", "zh-Hant",
    ],
    // A path bundlers can follow: they split each file out and load it on demand, as browsers do.
    load: code => import(`./languages/${code}.js`),
    registered: languages,
    name: "Platypicker",
});