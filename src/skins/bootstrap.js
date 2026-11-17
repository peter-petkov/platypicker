"use strict";

/**
 * The Bootstrap skin. Import it before platypicker, so the pickers are created with its classes:
 *
 *   import "platypicker/src/skins/bootstrap.js";
 *   import "platypicker";
 *
 * The select gets Bootstrap's form-select class, so it looks like the page's other selects, sizes and validation
 * states included. The popover and the badges take their colors, radius and shadow from Bootstrap's own variables,
 * so they follow the page's theme, its dark mode (data-bs-theme="dark", on the whole page or part of it) and any
 * custom colors. Needs Bootstrap 5.3 or later.
 *
 * Only form-select is added as a class: the select's base look has no specificity, so it wins whichever stylesheet
 * loads first. Everything else is set by the stylesheet below, which the page doesn't have to link.
 */
import { classes } from "../classes.js";

if (customElements.get("platy-picker")) {
    console.warn("Platypicker: import the Bootstrap skin before platypicker, or the pickers already in the page miss its classes.");
}

classes.select = [classes.select, "form-select"].filter(Boolean).join(" ");

// A skin's values are the --_pp-skin-* variables, read after the page's --platypicker-* ones (see platypicker.css).
// The few rules after them adjust what variables can't, at the same specificity as the base look, which they follow.
const css = `
@supports (appearance: base-select) and selector(::picker(select)) {
    :where(platy-picker) {
        --_pp-skin-bg: var(--bs-body-bg);
        --_pp-skin-color: var(--bs-body-color);
        --_pp-skin-muted-color: var(--bs-secondary-color);
        --_pp-skin-header-color: var(--bs-secondary-color);
        --_pp-skin-border-color: var(--bs-border-color-translucent);
        --_pp-skin-field-border-color: var(--bs-border-color);
        --_pp-skin-hover-bg: var(--bs-tertiary-bg);
        --_pp-skin-accent-color: var(--bs-link-color);
        --_pp-skin-disabled-color: var(--bs-tertiary-color);
        --_pp-skin-danger-color: var(--bs-form-invalid-border-color);
        --_pp-skin-highlight-bg: var(--bs-highlight-bg);
        --_pp-skin-highlight-color: var(--bs-highlight-color, inherit);
        --_pp-skin-tag-bg: var(--bs-secondary-bg-subtle);
        --_pp-skin-tag-border-color: var(--bs-secondary-border-subtle);
        --_pp-skin-radius: var(--bs-border-radius);
        --_pp-skin-menu-radius: var(--bs-border-radius);
        --_pp-skin-shadow: var(--bs-box-shadow);
    }

    :where(platy-picker) {
        /* The menu's outline, like a Bootstrap dropdown's. */
        .pp-menu {
            border-color: var(--bs-border-color-translucent);
        }

        /* The search box focuses like a form-control. */
        .pp-search:focus-visible {
            outline: 0;
            border-color: var(--bs-primary-border-subtle);
            box-shadow: 0 0 0 var(--bs-focus-ring-width, .25rem) var(--bs-focus-ring-color);
        }

        /* The badges line up with form-select's padding, and their chevron is form-select's. */
        .pp-tags {
            padding: 0 2.25rem 0 .4375rem;

            &::after {
                right: .75rem;
                width: 1rem;
                height: .75rem;
                background-color: var(--bs-body-color);
                mask: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='none' stroke='black' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m2 5 6 6 6-6'/%3e%3c/svg%3e") center / 16px 12px no-repeat;
            }
        }

        .pp-tags-placeholder {
            padding-left: .3125rem;
        }
    }
}`;

const sheet = new CSSStyleSheet();
sheet.replaceSync(css);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];