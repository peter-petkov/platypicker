// Writes dist/, Platypicker bundled into single files, each with a source map into src/:
//
//   node tools/build.mjs        (or npm run build)
//
//   platypicker.js                      the picker, with every translation, as a plain script
//   platypicker.esm.js                  the same, as a module whose default export is the element class
//   platypicker.bootstrap.js            the plain script, with the Bootstrap skin applied first
//   platypicker.bootstrap.esm.js        the module, with the Bootstrap skin applied first
//   platypicker.tailwind.js             the plain script, with the Tailwind skin applied first
//   platypicker.tailwind.esm.js         the module, with the Tailwind skin applied first
//   platypicker.css                     the stylesheet
//
// and each of them minified too, as .min.js and .min.css (platypicker.esm.min.js, platypicker.min.css).
//
// The plain scripts need no module support: each runs as a <script src> (or a module script), defines <platy-picker>
// and sets window.PlatyPicker. The modules define <platy-picker> as they're imported and export the class, for an
// //
// The work is Burrowkit's (burrowkit/tools/build.mjs); this file holds Platypicker's settings.
import { fileURLToPath } from "node:url";
import { build } from "burrowkit/tools/build.mjs";

await build({
    root: fileURLToPath(new URL("..", import.meta.url)),
    name: "platypicker",
    global: "PlatyPicker",
    entry: "platypicker.js",
    skins: ["bootstrap", "tailwind"],
    css: "platypicker.css",
});