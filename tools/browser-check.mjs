// Opens the docs page in your installed Firefox (or Chrome), or in Playwright's WebKit, headless, and reports what that
// browser supports of what Platypicker uses and how many pickers it enhanced:
//
//   node tools/browser-check.mjs [firefox|chrome|webkit] [--page docs/index.html#search] [--run script.js] [--shot out.png]
//
// The work is Burrowkit's (burrowkit/tools/browser-check.mjs, which explains the options); this file holds
// Platypicker's settings.
import { fileURLToPath } from "node:url";
import { check } from "burrowkit/tools/browser-check.mjs";

await check({
    root: fileURLToPath(new URL("..", import.meta.url)),
    enhanced: "platy-picker > select.pp-select",
});