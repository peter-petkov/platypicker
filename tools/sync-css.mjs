// Writes the CSS shared with every component built on Burrowkit into src/platypicker.css, between its markers, under
// Platypicker's names:
//
//   node tools/sync-css.mjs             (or npm run sync:css)     rewrites the region
//   node tools/sync-css.mjs --check     (or npm run check:css)    changes nothing; fails if the region differs
//
// The work is Burrowkit's (burrowkit/tools/sync-css.mjs); this file holds Platypicker's settings.
import { fileURLToPath } from "node:url";
import { syncCss } from "burrowkit/tools/sync-css.mjs";

await syncCss({
    root: fileURLToPath(new URL("..", import.meta.url)),
    css: "platypicker.css",
    host: "platy-picker",
    prefix: "pp",
    name: "platypicker",
});