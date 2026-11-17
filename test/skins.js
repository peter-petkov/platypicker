"use strict";

// The skins the docs page can show its examples in. Each brings its framework's stylesheets, Platypicker's skin
// module for it, how the framework switches to dark mode, and the styles it gives <body>, which the examples' shadow
// roots have no part of. An entry here appears in the page's skin switch, with its icon, and in the Skins section.
window.PLATY_SKINS = {
    base: {
        label: "Base",
        description: "Platypicker's own look, with no framework.",
        icon: "../platylogo.png",
    },
    bootstrap: {
        label: "Bootstrap",
        description: "Bootstrap's form-select, dropdown, form-control, button, badge and placeholder classes. Needs Bootstrap 5.3 or later.",
        stylesheets: ["https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css"],
        stylesheetName: "bootstrap.min.css",
        module: "../src/skins/bootstrap.js",
        importPath: "platypicker/src/skins/bootstrap.js",
        setTheme: (root, dark) => root.dataset.bsTheme = dark ? "dark" : "light",
        rootCss: "font-family: var(--bs-body-font-family); font-size: var(--bs-body-font-size); font-weight: var(--bs-body-font-weight); line-height: var(--bs-body-line-height); color: var(--bs-body-color);",
        // Bootstrap Icons' bootstrap-fill, in Bootstrap's purple.
        icon: "data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%237952b3'%3e%3cpath d='M6.375 7.125V4.658h1.78c.973 0 1.542.457 1.542 1.237 0 .802-.604 1.23-1.764 1.23zm0 3.762h1.898c1.184 0 1.81-.48 1.81-1.377 0-.885-.65-1.348-1.886-1.348H6.375z'/%3e%3cpath d='M4.002 0a4 4 0 0 0-4 4v8a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4V4a4 4 0 0 0-4-4zm1.06 12V3.545h3.399c1.587 0 2.543.809 2.543 2.11 0 .884-.65 1.675-1.483 1.816v.1c1.143.117 1.904.931 1.904 2.033 0 1.488-1.084 2.396-2.888 2.396z'/%3e%3c/svg%3e",
    },
};