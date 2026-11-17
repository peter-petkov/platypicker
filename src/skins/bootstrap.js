"use strict";

/**
 * The Bootstrap skin. Import it before platypicker, so the pickers are created with its classes:
 *
 *   import "platypicker/src/skins/bootstrap.js";
 *   import "platypicker";
 *
 * It dresses the picker in Bootstrap's own classes: form-select for the select, a dropdown-menu with dropdown-items,
 * a dropdown-header and dropdown-dividers for the popover, form-control for the search box, btn-link buttons, badges
 * with a btn-close for a multiple select, and placeholder bars for the skeleton rows. Platypicker's own paint steps
 * aside for skinned pickers, so these classes decide the look whichever stylesheet loads first. A few small rules
 * cover what Bootstrap has no class for: the check mark, search matches and where the badges sit.
 * Needs Bootstrap 5.3 or later.
 */
import { classes } from "../classes.js";

if (customElements.get("platy-picker")) {
    console.warn("Platypicker: import the Bootstrap skin before platypicker, or the pickers already in the page miss its classes.");
}

const plugs = {
    host: "pp-skin pp-skin-bootstrap",
    select: "form-select",
    menu: "dropdown-menu p-0",
    bar: "p-2 bg-body border-bottom",
    search: "form-control form-control-sm",
    button: "btn btn-link btn-sm",
    list: "list-unstyled mb-0 py-1",
    item: "dropdown-item",
    subtext: "small",
    header: "dropdown-header",
    divider: "dropdown-divider",
    placeholder: "placeholder-glow",
    placeholderBar: "placeholder col-8",
    tag: "badge text-secondary-emphasis bg-secondary-subtle border border-secondary-subtle",
    tagRemove: "btn-close p-0",
    tagCount: "badge text-body-secondary border",
    tagsPlaceholder: "text-body-secondary",
};

for (const [part, value] of Object.entries(plugs)) {
    classes[part] = [classes[part], value].filter(Boolean).join(" ");
}

// What Bootstrap has no class for. The variables feed the check mark, the select all spinner and search matches.
// The subtext is secondary gray, and with the check mark takes the row's own color while it's pressed or disabled
// (text-body-secondary would win over those, with its !important). The rest lines the badges up with form-select's
// padding and draws its chevron, which Bootstrap leaves off multiple selects. They're one notch above Platypicker's
// layout rules, which they adjust.
const css = `
@supports (appearance: base-select) and selector(::picker(select)) {
    platy-picker.pp-skin-bootstrap {
        --_pp-skin-accent-color: var(--bs-link-color);
        --_pp-skin-highlight-bg: var(--bs-highlight-bg);
        --_pp-skin-highlight-color: var(--bs-highlight-color, inherit);

        .pp-item-subtext {
            color: var(--bs-secondary-color);
        }

        .pp-item:is(:active, :disabled) > .pp-item-subtext {
            color: inherit;
        }

        .pp-item[aria-pressed="true"]:active > .pp-item-check {
            background-color: currentColor;
        }

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