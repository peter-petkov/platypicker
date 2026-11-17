"use strict";

/**
 * The Tailwind skin, for Tailwind 4. Import it before platypicker, so the pickers are created with its classes:
 *
 *   import "platypicker/src/skins/tailwind.js";
 *   import "platypicker";
 *
 * It dresses the picker in Tailwind utilities, in gray with an indigo accent, the look of Tailwind's own form
 * examples, with dark: variants for dark mode. Tailwind only generates the classes it finds in your sources, so point
 * it at this file, and import platypicker.css into its components layer so that the utilities win over its layout:
 *
 *   @import "tailwindcss";
 *   @import "platypicker/src/platypicker.css" layer(components);
 *   @source "../node_modules/platypicker/src/skins/tailwind.js";
 *
 * For other colors, change the plugs after importing this file, before importing platypicker.
 */
import { classes } from "../classes.js";

if (customElements.get("platy-picker")) {
    console.warn("Platypicker: import the Tailwind skin before platypicker, or the pickers already in the page miss its classes.");
}

const plugs = {
    // The accent (check mark, spinner) and search match colors, which the parts read from variables.
    host: "pp-skin pp-skin-tailwind [--_pp-skin-accent-color:var(--color-indigo-600)] [--_pp-skin-highlight-bg:var(--color-indigo-100)] [--_pp-skin-highlight-color:var(--color-indigo-900)] dark:[--_pp-skin-accent-color:var(--color-indigo-400)] dark:[--_pp-skin-highlight-bg:var(--color-indigo-900)] dark:[--_pp-skin-highlight-color:var(--color-indigo-100)]",
    select: "cursor-pointer rounded-md bg-white py-1.5 pr-8 pl-3 text-sm/6 text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600 user-invalid:outline-red-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 disabled:outline-gray-200 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:focus-visible:outline-indigo-500 dark:user-invalid:outline-red-400 dark:disabled:bg-white/10 dark:disabled:text-gray-500",
    menu: "rounded-md bg-white p-0 text-sm/6 text-gray-900 shadow-lg outline-1 outline-black/5 dark:bg-gray-800 dark:text-white dark:shadow-none dark:-outline-offset-1 dark:outline-white/10",
    bar: "gap-2 border-b border-gray-200 bg-white p-2 dark:border-white/10 dark:bg-gray-800",
    search: "rounded-md bg-white px-2.5 py-1 text-sm/6 text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500",
    button: "cursor-pointer rounded-md px-1.5 py-1 text-sm/6 font-medium text-indigo-600 hover:text-indigo-500 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300",
    list: "p-1",
    item: "cursor-pointer rounded-md py-1.5 pr-2 pl-2.5 text-gray-900 outline-none enabled:hover:bg-indigo-600 enabled:hover:text-white enabled:focus-visible:bg-indigo-600 enabled:focus-visible:text-white disabled:cursor-default disabled:text-gray-400 dark:text-white dark:enabled:hover:bg-indigo-500 dark:enabled:focus-visible:bg-indigo-500 dark:disabled:text-gray-500",
    subtext: "text-xs text-gray-500 dark:text-gray-400",
    header: "px-2.5 pt-2 pb-0.5 text-xs font-medium text-gray-500 dark:text-gray-400",
    divider: "mx-1.5 my-1 border-gray-200 dark:border-white/10",
    placeholderBar: "my-1.5 block h-3 w-2/3 animate-pulse rounded-full bg-gray-200 dark:bg-white/10",
    tags: "gap-1 pr-8 pl-1.5 text-gray-900 after:right-2.5 after:size-4 after:bg-gray-500 dark:text-white dark:after:bg-gray-400",
    tag: "gap-0.5 rounded-md bg-gray-100 px-1.5 text-xs/5 font-medium text-gray-700 dark:bg-white/10 dark:text-gray-300",
    tagRemove: "-mr-0.5 size-3.5 rounded-xs bg-current opacity-60 hover:opacity-100",
    tagCount: "rounded-md px-1.5 text-xs/5 font-medium text-gray-500 inset-ring inset-ring-gray-300 dark:text-gray-400 dark:inset-ring-white/15",
    tagsPlaceholder: "pl-1.5 text-gray-400 dark:text-gray-500",
};

for (const [part, value] of Object.entries(plugs)) {
    classes[part] = [classes[part], value].filter(Boolean).join(" ");
}

// What utilities can't say. The single select's chevron goes in the background, which a background utility would
// replace. The badges' × is a mask, which their color shows through. A row's subtext and check mark take its own
// color while it's hovered, focused, pressed or disabled. These rules are outside any layer, so they win over
// utilities.
const css = `
@supports (appearance: base-select) and selector(::picker(select)) {
    platy-picker.pp-skin-tailwind {
        > select.pp-select:not([multiple]) {
            background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%236b7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3e%3cpath d='m4 6 4 4 4-4'/%3e%3c/svg%3e");
            background-repeat: no-repeat;
            background-position: right .5rem center;
            background-size: 1rem;
        }

        .pp-tags::after {
            mask-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3e%3cpath d='m4 6 4 4 4-4'/%3e%3c/svg%3e");
        }

        .pp-tag-remove {
            mask: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='2' stroke-linecap='round'%3e%3cpath d='m4.5 4.5 7 7m0-7-7 7'/%3e%3c/svg%3e") center / .75rem no-repeat;
        }

        .pp-item:is(:enabled:is(:hover, :focus-visible, :active), :disabled) > .pp-item-subtext {
            color: inherit;
        }

        .pp-item[aria-pressed="true"]:enabled:is(:hover, :focus-visible, :active) > .pp-item-check {
            background-color: currentColor;
        }
    }
}`;

const sheet = new CSSStyleSheet();
sheet.replaceSync(css);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];