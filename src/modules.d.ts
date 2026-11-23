// The modules the README imports by path, which have no .d.ts of their own. platypicker.d.ts references this file,
// so importing platypicker brings them in.

/**
 * One of Platypicker's translations, as an object of texts. A picker loads it on its own when it needs it; import it
 * to bundle it instead, and register it: `PlatyPicker.languages.de = de`.
 */
declare module "platypicker/src/languages/*.js" {
    const texts: import("./languages.js").Texts;
    export default texts;
}

/**
 * The Bootstrap skin: fills the class plugs with Bootstrap's classes. Import it before platypicker, for its side
 * effects only. Needs Bootstrap 5.3 or later.
 */
declare module "platypicker/src/skins/bootstrap.js" {}

/**
 * The Tailwind skin, for Tailwind 4: feeds the look Tailwind's theme variables. Import it before platypicker, for its
 * side effects only.
 */
declare module "platypicker/src/skins/tailwind.js" {}