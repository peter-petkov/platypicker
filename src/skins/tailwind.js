"use strict";

/**
 * The Tailwind skin, for Tailwind 4. Import it before platypicker, so the pickers are created with its class:
 *
 *   import "platypicker/src/skins/tailwind.js";
 *   import "platypicker";
 *
 * Tailwind has no component classes to borrow, but Tailwind 4 publishes its theme as CSS variables. The skin keeps
 * Platypicker's own look and feeds it those: gray with an indigo accent, the look of Tailwind's form examples, with
 * its radius and shadow. Each value falls back to Tailwind's default, since Tailwind only outputs the variables a
 * project uses, so it needs nothing in your Tailwind setup and follows your theme where you change it. Dark mode
 * follows color-scheme, as the base look does. Your --platypicker-* variables still win over all of it.
 */
import { classes } from "../classes.js";

if (customElements.get("platy-picker")) {
    console.warn("Platypicker: import the Tailwind skin before platypicker, or the pickers already in the page miss its class.");
}

classes.host = [classes.host, "pp-skin-tailwind"].filter(Boolean).join(" ");

// Tailwind's default values, for the variables a project hasn't output.
const defaults = {
    "gray-100": "oklch(96.7% .003 264.542)",
    "gray-200": "oklch(92.8% .006 264.531)",
    "gray-300": "oklch(87.2% .01 258.338)",
    "gray-400": "oklch(70.7% .022 261.325)",
    "gray-500": "oklch(55.1% .027 264.364)",
    "gray-800": "oklch(27.8% .033 256.848)",
    "gray-900": "oklch(21% .034 264.665)",
    "indigo-100": "oklch(93% .034 272.788)",
    "indigo-400": "oklch(67.3% .182 276.935)",
    "indigo-600": "oklch(51.1% .262 276.966)",
    "indigo-900": "oklch(35.9% .144 278.697)",
    "red-400": "oklch(70.4% .191 22.216)",
    "red-600": "oklch(57.7% .245 27.325)",
    "white": "#fff",
};

const color = name => `var(--color-${name}, ${defaults[name]})`;
const white = percent => `color-mix(in oklab, ${color("white")} ${percent}%, transparent)`;

// Light and dark, as Tailwind's examples pair them.
const css = `
platy-picker.pp-skin-tailwind {
    --_pp-skin-bg: light-dark(${color("white")}, ${color("gray-800")});
    --_pp-skin-color: light-dark(${color("gray-900")}, ${color("white")});
    --_pp-skin-muted-color: light-dark(${color("gray-500")}, ${color("gray-400")});
    --_pp-skin-header-color: light-dark(${color("gray-500")}, ${color("gray-400")});
    --_pp-skin-border-color: light-dark(${color("gray-200")}, ${white(10)});
    --_pp-skin-field-border-color: light-dark(${color("gray-300")}, ${white(15)});
    --_pp-skin-hover-bg: light-dark(${color("gray-100")}, ${white(5)});
    --_pp-skin-accent-color: light-dark(${color("indigo-600")}, ${color("indigo-400")});
    --_pp-skin-disabled-color: light-dark(${color("gray-400")}, ${color("gray-500")});
    --_pp-skin-danger-color: light-dark(${color("red-600")}, ${color("red-400")});
    --_pp-skin-highlight-bg: light-dark(${color("indigo-100")}, ${color("indigo-900")});
    --_pp-skin-highlight-color: light-dark(${color("indigo-900")}, ${color("indigo-100")});
    --_pp-skin-tag-bg: light-dark(${color("gray-100")}, ${white(10)});
    --_pp-skin-tag-border-color: light-dark(${color("gray-200")}, ${white(10)});
    --_pp-skin-radius: var(--radius-md, .375rem);
    --_pp-skin-menu-radius: var(--radius-md, .375rem);
    --_pp-skin-shadow: var(--shadow-lg, 0 10px 15px -3px rgb(0 0 0 / .1), 0 4px 6px -4px rgb(0 0 0 / .1));
}`;

const sheet = new CSSStyleSheet();
sheet.replaceSync(css);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];