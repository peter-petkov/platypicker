// Writes dist/, a minified copy of src/ file by file, each with a source map into src/:
//
//   node tools/build.mjs        (or npm run build)
//
// The files aren't bundled. They import each other by the same relative paths as in src/, so the skins share
// classes.js with the picker and the translations still load on demand. A page takes every file from the same
// folder, src/ or dist/, never some from each. The CSS keeps its nesting, which every supported browser has.
import { readdir, rm } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = join(root, "src");
const dist = join(root, "dist");

const files = (await readdir(src, { recursive: true }))
    .filter(file => /\.(js|css)$/.test(file))
    .map(file => join(src, file));

await rm(dist, { recursive: true, force: true });
await build({
    entryPoints: files,
    outdir: dist,
    outbase: src,
    bundle: false,
    minify: true,
    sourcemap: true,
    sourcesContent: false,  // The maps point to the files in src/, which the package has too.
    legalComments: "none",
    target: "esnext",
    logLevel: "warning",
});

console.log(`Built ${files.length} files into ${relative(root, dist)}/`);