"use strict";

import validLocale from "burrowkit/locale.js";

/**
 * The texts of a picker, in the language of its nearest lang attribute.
 *
 * Platypicker ships translations in src/languages/, one file per language, each a plain object of texts as its
 * default export. A picker whose language has one loads it the first time it's needed, so an English page loads none.
 * A language registered in `languages` (PlatyPicker.languages) wins over a shipped translation of the same language,
 * text by text, so it can change a single text or be a whole language of its own. Whatever a language leaves out
 * comes from PlatyPicker.languageMap, English by default.
 *
 * A text with a count, like matchesLabel, is a string with {count}, an object of plural forms picked by the
 * language's plural rules ({ one: "{count} match", other: "{count} matches" }, other being the fallback), or a
 * function of the count. A text can have other numbers too, like filteredLabel's {total}; the form is still picked
 * by the count.
 */

/** Languages registered by the page: code -> texts. The same object is PlatyPicker.languages. */
export const languages = {};

export default class Languages {
    // The translations in src/languages/, by code.
    static shipped = [
        "ar", "bg", "bn", "de", "es", "fr", "hi", "id", "it", "ja", "ko", "mr", "pl", "pt", "ru", "ta", "te", "tr",
        "ur", "vi", "zh-Hans", "zh-Hant",
    ];

    // Codes that name a shipped translation by another name, in lower case.
    static #aliases = {
        "zh": "zh-Hans", "zh-cn": "zh-Hans", "zh-sg": "zh-Hans", "zh-my": "zh-Hans",
        "zh-tw": "zh-Hant", "zh-hk": "zh-Hant", "zh-mo": "zh-Hant",
    };

    static #loaded = new Map();   // shipped code -> its texts, once loaded
    static #loading = new Map();  // shipped code -> the promise of its texts, while loading
    static #failed = new Set();   // shipped codes that couldn't load, which aren't tried again
    static #formats = new Map();  // locale -> { plurals, numbers }

    /** The language of an element: its nearest lang attribute, also past shadow roots. "" when there is none. */
    static of(element) {
        for (let node = element; node; node = node.getRootNode().host) {
            const owner = node.closest?.("[lang]");
            if (owner) return owner.lang.trim();
        }
        return "";
    }

    /**
     * The texts for a language tag, as far as they're known now: the fallback, under a shipped translation once it
     * has loaded, under the page's own. When a shipped translation still has to load, it starts loading and
     * `ready` resolves once it has; otherwise `ready` is null.
     */
    static texts(tag, fallback) {
        const candidates = Languages.#candidates(tag);
        const own = candidates.map(code => Languages.#registered(code)).find(Boolean);
        const code = candidates.map(code => Languages.#shippedCode(code)).find(Boolean);

        const shipped = code && Languages.#loaded.get(code);
        const ready = code && !shipped && !Languages.#failed.has(code) ? Languages.#load(code) : null;

        return { texts: { ...fallback, ...shipped, ...own }, ready };
    }

    /**
     * A text with a count, for a locale: a string with {count}, plural forms, or a function, which gets the count
     * and the other numbers. The count and the other numbers, like { total } for {total}, are formatted for the
     * locale.
     */
    static format(text, count, locale, numbers = {}) {
        if (typeof text === "function") return text(count, numbers);

        const formats = Languages.#formatsFor(locale);
        const form = text && typeof text === "object"
            ? text[formats.plurals.select(count)] ?? text.other ?? ""
            : String(text ?? "");
        return Object.entries({ count, ...numbers })
            .reduce((result, [name, value]) => result.replaceAll(`{${name}}`, formats.numbers.format(value)), form);
    }

    /** Formats a number for a locale. */
    static number(count, locale) {
        return Languages.#formatsFor(locale).numbers.format(count);
    }

    // "zh-Hant-TW" -> ["zh-hant-tw", "zh-hant", "zh"], in lower case: from the exact tag to its base language.
    static #candidates(tag) {
        const parts = tag.toLowerCase().split(/[-_]/).filter(Boolean);
        return parts.map((_, i) => parts.slice(0, parts.length - i).join("-"));
    }

    static #registered(code) {
        const key = Object.keys(languages).find(key => key.toLowerCase() === code);
        return key ? languages[key] : undefined;
    }

    static #shippedCode(code) {
        if (code === "en") return undefined;
        return Languages.#aliases[code] ?? Languages.shipped.find(shipped => shipped.toLowerCase() === code);
    }

    static #load(code) {
        let promise = Languages.#loading.get(code);
        if (promise) return promise;

        // A path bundlers can follow: they split each file out and load it on demand, as browsers do.
        promise = import(`./languages/${code}.js`)
            .then(module => Languages.#loaded.set(code, module.default))
            .catch(error => {
                Languages.#failed.add(code);
                console.warn(`Platypicker: couldn't load the ${code} texts.`, error);
            })
            .finally(() => Languages.#loading.delete(code));

        Languages.#loading.set(code, promise);
        return promise;
    }

    static #formatsFor(locale) {
        const key = locale || "";
        let formats = Languages.#formats.get(key);

        if (!formats) {
            const locales = validLocale(locale);
            formats = { plurals: new Intl.PluralRules(locales), numbers: new Intl.NumberFormat(locales) };
            Languages.#formats.set(key, formats);
        }

        return formats;
    }
}