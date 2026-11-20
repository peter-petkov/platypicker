"use strict";

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
    static #validity = new Map(); // locale -> whether it's a valid tag

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

    // Accents that searching ignores: those of Latin, Greek and Cyrillic, and the optional vowel marks of Arabic and
    // Hebrew. Not every combining mark: the vowel signs of Indic scripts and the voicing marks of Japanese kana are
    // as much a part of the letter as its shape.
    static #accents = /[̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-ً︯-ٰٟ֑-ׇ]/g;

    // Letters that have no accent to take off, but are searched for as their plain counterparts.
    static #letters = { "ß": "ss", "æ": "ae", "œ": "oe", "ø": "o", "ł": "l", "đ": "d", "ð": "d", "þ": "th", "ς": "σ" };
    static #lettersPattern = /[ßæœøłđðþς]/g;

    /**
     * A text as search compares it: lower case by the locale's rules (Turkish İ is i), without accents, so that
     * "zurich" finds "Zürich", and with ß, ø, æ and the like spelled out plainly.
     */
    static fold(text, locale) {
        return text.toLocaleLowerCase(Languages.#valid(locale))
            .normalize("NFD")
            .replace(Languages.#accents, "")
            .replace(Languages.#lettersPattern, letter => Languages.#letters[letter]);
    }

    /**
     * A text made ready for match(): folded a letter at a time, remembering which letters of the text each folded
     * unit came from and whether it starts a word. A letter's accents count as part of it, so a match never cuts one
     * off.
     */
    static prepare(text, locale) {
        const folded = Languages.fold(text, locale);
        const starts = [];
        const ends = [];
        const words = [];

        // Plain ASCII folds one letter to one unit, so the folded text lines up with the text as it is.
        if (folded.length === text.length && /^[\x00-\x7f]*$/.test(text)) {
            let previous = "";
            for (let i = 0; i < text.length; i++) {
                starts.push(i);
                ends.push(i + 1);
                words.push(Languages.#startsWord(previous, text[i]));
                previous = text[i];
            }
            return { folded, starts, ends, words };
        }

        let joined = "";
        let previous = "";      // the last letter that wasn't an accent
        let units = [];         // the folded units of that letter
        for (let i = 0; i < text.length;) {
            const letter = String.fromCodePoint(text.codePointAt(i));
            const part = Languages.fold(letter, locale);
            const next = i + letter.length;

            if (part) {
                units = [];
                for (let unit = 0; unit < part.length; unit++) {
                    units.push(starts.length);
                    starts.push(i);
                    ends.push(next);
                    words.push(unit === 0 && Languages.#startsWord(previous, letter));
                }
                joined += part;
                previous = letter;
            } else {
                // An accent, or another mark searching ignores: it goes with the letter before it.
                for (const unit of units) ends[unit] = next;
            }

            i = next;
        }

        return { folded: joined, starts, ends, words };
    }

    /**
     * Where a folded query matches a prepared text (see prepare), as a list of { start, end } in the text itself, or
     * null when it doesn't.
     *
     * The query's letters match in order, each one either right after the one before it or at the start of a word,
     * so "nyc" matches New York City and "unk" United Kingdom. Spaces in the query are left out of this. Among the
     * ways to match, the one in the fewest pieces wins, then the earliest. When the letters can't match like that,
     * the query still matches wherever it occurs as a whole, as "rich" does in Zürich.
     */
    static match(prepared, query) {
        if (!query) return null;

        const { folded, starts, ends } = prepared;
        const runs = Languages.#initials(prepared, query.replace(/\s+/g, ""));
        if (runs) return runs.map(([first, last]) => ({ start: starts[first], end: ends[last] }));

        const at = folded.indexOf(query);
        return at < 0 ? null : [{ start: starts[at], end: ends[at + query.length - 1] }];
    }

    /** Whether the letters of a query occur in a folded text in order, spaces in the query left out. */
    static mayMatch(folded, query) {
        let at = 0;
        for (const unit of query) {
            if (/\s/.test(unit)) continue;

            at = folded.indexOf(unit, at) + 1;
            if (!at) return false;
        }
        return true;
    }

    // A letter starts a word when it's a letter or a digit and comes first, after a space or punctuation, as an
    // upper case letter after a lower case one ("macOS"), or where letters and digits meet ("iPhone15").
    static #startsWord(previous, letter) {
        if (!/[\p{L}\p{N}]/u.test(letter)) return false;
        if (!previous || !/[\p{L}\p{N}]/u.test(previous)) return true;
        if (/\p{Ll}/u.test(previous) && /\p{Lu}/u.test(letter)) return true;
        return /\p{L}/u.test(previous) !== /\p{L}/u.test(letter);
    }

    /**
     * The best way the query's letters match in order, each right after the one before or at the start of a word,
     * as [first, last] runs of folded units; null when there's none.
     */
    static #initials({ folded, words }, query) {
        const length = folded.length;
        if (!query || query.length > length || !Languages.mayMatch(folded, query)) return null;

        const wordStarts = [];
        for (let i = 0; i < length; i++) if (words[i]) wordStarts.push(i);

        // pieces[q * length + t]: the fewest further pieces the rest of the query needs once its letter q matched
        // at t; next[...] is where letter q + 1 then goes.
        const none = 0x7fff;
        const pieces = new Int16Array(query.length * length).fill(none);
        const next = new Int32Array(query.length * length);

        for (let q = query.length - 1; q >= 0; q--) {
            for (let t = 0; t < length; t++) {
                if (folded[t] !== query[q]) continue;

                const cell = q * length + t;
                if (q === query.length - 1) {
                    pieces[cell] = 0;
                    continue;
                }

                const after = cell + length;    // letter q + 1, at t
                if (t + 1 < length && pieces[after + 1] !== none) {
                    pieces[cell] = pieces[after + 1];
                    next[cell] = t + 1;
                }

                for (const start of wordStarts) {
                    if (start <= t + 1 || pieces[after + start - t] === none) continue;

                    const count = pieces[after + start - t] + 1;
                    if (count < pieces[cell]) {
                        pieces[cell] = count;
                        next[cell] = start;
                    }
                }
            }
        }

        let first = -1;
        for (const start of wordStarts)
            if (pieces[start] !== none && (first < 0 || pieces[start] < pieces[first])) first = start;
        if (first < 0) return null;

        const runs = [[first, first]];
        for (let q = 0, t = first; q < query.length - 1; q++) {
            t = next[q * length + t];
            const run = runs[runs.length - 1];
            if (t === run[1] + 1) run[1] = t;
            else runs.push([t, t]);
        }
        return runs;
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
            const locales = Languages.#valid(locale);
            formats = { plurals: new Intl.PluralRules(locales), numbers: new Intl.NumberFormat(locales) };
            Languages.#formats.set(key, formats);
        }

        return formats;
    }

    // The locale if it's a valid tag, otherwise undefined: the browser's own language.
    static #valid(locale) {
        if (!locale) return undefined;
        if (!Languages.#validity.has(locale)) {
            let valid = true;
            try {
                Intl.getCanonicalLocales(locale);
            } catch {
                valid = false;
            }
            Languages.#validity.set(locale, valid);
        }
        return Languages.#validity.get(locale) ? locale : undefined;
    }
}