"use strict";

// The skins the docs page can show its examples in. Each brings its framework's stylesheets, Platypicker's skin
// module for it, and how the framework switches to dark mode. An entry here appears in the page's skin switch and in
// the Skins section.
window.PLATY_SKINS = {
    base: {
        label: "Base",
        description: "Platypicker's own look, with no framework.",
    },
    bootstrap: {
        label: "Bootstrap",
        description: "Bootstrap's form-select, dropdown, form-control, button, badge and placeholder classes. Needs Bootstrap 5.3 or later.",
        stylesheets: ["https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css"],
        stylesheetName: "bootstrap.min.css",
        module: "../src/skins/bootstrap.js",
        importPath: "platypicker/src/skins/bootstrap.js",
        setTheme: (root, dark) => root.dataset.bsTheme = dark ? "dark" : "light",
    },
};