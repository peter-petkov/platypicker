// Writes dist/, Platypicker minified into single files, each with a source map into src/:
//
//   node tools/build.mjs        (or npm run build)
//
//   platypicker.min.js            the picker, with every translation, as a plain script
//   platypicker.bootstrap.min.js  the same, with the Bootstrap skin applied first
//   platypicker.tailwind.min.js   the same, with the Tailwind skin applied first
//   platypicker.min.css           the stylesheet
//
// The scripts need no module support: each runs as a <script src> (or a module script), defines <platy-picker> and
// sets window.PlatyPicker. They bundle the translations, which load on demand from src/, since a plain script can't
// find files beside it reliably; together they add about 4 kB gzipped. A skin has to set its classes before any
// picker is created, so each skin gets a build of its own rather than a file to load in the right order. The CSS
// keeps its nesting, which every supported browser has.
import { rm } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = join(root, "src");
const dist = join(root, "dist");

const options = {
    minify: true,
    sourcemap: true,
    sourcesContent: false,  // The maps point to the files in src/, which the package has too.
    legalComments: "none",
    target: "esnext",
    logLevel: "warning",
};

// A module script keeps its top-level names to itself, so the global is set on globalThis.
const script = skin => ({
    ...options,
    stdin: {
        contents: `${skin ? `import "./skins/${skin}.js";\n` : ""}` +
            `import PlatyPicker from "./platypicker.js";\nglobalThis.PlatyPicker = PlatyPicker;\n`,
        resolveDir: src,
        sourcefile: skin ? `platypicker.${skin}.js` : "platypicker.global.js",
    },
    bundle: true,
    format: "iife",
    outfile: join(dist, skin ? `platypicker.${skin}.min.js` : "platypicker.min.js"),
});

await rm(dist, { recursive: true, force: true });
await Promise.all([
    build(script()),
    build(script("bootstrap")),
    build(script("tailwind")),
    build({ ...options, entryPoints: [join(src, "platypicker.css")], outfile: join(dist, "platypicker.min.css") }),
]);

console.log(`Built 4 files into ${relative(root, dist)}/`);