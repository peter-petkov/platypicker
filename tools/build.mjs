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
// import from a CDN or a local file. Both bundle the translations, which load on demand from src/, since a single
// file has nothing beside it to load them from; together they add about 4 kB gzipped. A skin has to set its classes
// before any picker is created, so each skin gets builds of its own rather than a file to load in the right order.
// The CSS keeps its nesting, which every supported browser has.
import { rm } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = join(root, "src");
const dist = join(root, "dist");

const options = {
    sourcemap: true,
    sourcesContent: false,  // The maps point to the files in src/, which the package has too.
    legalComments: "none",
    target: "esnext",
    logLevel: "warning",
};

// A module script keeps its top-level names to itself, so the plain script sets the global on globalThis. A module
// is always read as UTF-8, so it can keep the translations' letters rather than \u escapes.
const bundle = (skin, esm, minify) => {
    const name = ["platypicker", skin, esm && "esm", minify && "min", "js"].filter(Boolean).join(".");
    return {
        ...options,
        minify,
        stdin: {
            contents: (skin ? `import "./skins/${skin}.js";\n` : "") +
                `import PlatyPicker from "./platypicker.js";\n` +
                (esm ? "export default PlatyPicker;\n" : "globalThis.PlatyPicker = PlatyPicker;\n"),
            resolveDir: src,
            sourcefile: name.replace(".min", "").replace(/js$/, "entry.js"),  // Not src/platypicker.js itself.
        },
        bundle: true,
        format: esm ? "esm" : "iife",
        charset: esm ? "utf8" : "ascii",
        outfile: join(dist, name),
    };
};

const builds = [];
for (const skin of [null, "bootstrap", "tailwind"]) {
    for (const esm of [false, true]) {
        for (const minify of [false, true]) builds.push(bundle(skin, esm, minify));
    }
}
for (const minify of [false, true]) {
    builds.push({
        ...options,
        minify,
        entryPoints: [join(src, "platypicker.css")],
        outfile: join(dist, minify ? "platypicker.min.css" : "platypicker.css"),
    });
}

await rm(dist, { recursive: true, force: true });
await Promise.all(builds.map(options => build(options)));

console.log(`Built ${builds.length} files into ${relative(root, dist)}/`);