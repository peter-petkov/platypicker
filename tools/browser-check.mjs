// Opens the docs page in your installed Firefox (or Chrome), or in Playwright's WebKit, headless and in a temporary
// profile, and reports what that browser supports of what Platypicker uses. For checking Firefox, and WebKit as a
// stand-in for Safari, from the command line.
//
//   node tools/browser-check.mjs [firefox|chrome|webkit] [--page docs/index.html#search] [--run script.js] [--shot out.png]
//
// --run evaluates a script in the page once it has loaded, and prints what it returns (it may await). --shot saves a
// screenshot of the viewport. The browser is found where Windows installs it; set FIREFOX or CHROME to its path
// otherwise. WebKit is Playwright's own build, installed once with `npx playwright-core install webkit`. It is the
// engine Safari uses, not Safari itself, so treat what it shows as a hint and confirm in a real Safari. The repository
// is served on a free port for the run.
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { webkit } from "playwright-core";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const option = name => {
    const at = args.indexOf(name);
    return at >= 0 ? args.splice(at, 2)[1] : undefined;
};

const page = option("--page") ?? "docs/index.html";
const run = option("--run");
const shot = option("--shot");
const browserName = args[0] ?? "firefox";

const paths = {
    firefox: [process.env.FIREFOX, "C:\\Program Files\\Mozilla Firefox\\firefox.exe", "/usr/bin/firefox",
        "/Applications/Firefox.app/Contents/MacOS/firefox"],
    chrome: [process.env.CHROME, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "/usr/bin/google-chrome",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
};
const isWebKit = browserName === "webkit";
const executablePath = isWebKit ? webkit.executablePath() : paths[browserName]?.find(path => path && existsSync(path));
if (isWebKit && !existsSync(executablePath)) throw new Error("No WebKit found. Run: npx playwright-core install webkit");
if (!executablePath) throw new Error(`No ${browserName} found. Set ${browserName.toUpperCase()} to its path.`);

const types = {
    ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
    ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon", ".svg": "image/svg+xml",
};

const server = createServer(async (request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url, "http://localhost").pathname));
    try {
        // In the npm workspace, a dependency sits in the workspace's node_modules one folder up, where Node finds it.
        const body = await readFile(join(root, path)).catch(error => {
            if (!path.replaceAll("\\", "/").startsWith("/node_modules/")) throw error;
            return readFile(join(root, "..", path));
        });
        response.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" });
        response.end(body);
    } catch {
        response.writeHead(404);
        response.end();
    }
});
await new Promise(resolve => server.listen(0, resolve));

// A separate instance, so a Firefox you have open is left alone.
const extraArgs = browserName === "firefox" ? ["--new-instance", "--no-remote"] : [];
const headless = !process.env.HEADED;
const viewport = { width: 1280, height: 900 };
const browser = isWebKit
    ? await webkit.launch({ headless })
    : await puppeteer.launch({ browser: browserName, executablePath, headless, args: extraArgs });
try {
    // Playwright and Puppeteer pages share the calls used below, apart from how the viewport is set.
    const tab = isWebKit ? await browser.newPage({ viewport }) : await browser.newPage();
    if (!isWebKit) await tab.setViewport(viewport);
    const errors = [];
    tab.on("pageerror", error => errors.push(error.message));
    tab.on("console", message => message.type() === "error" && errors.push(message.text()));

    await tab.goto(`http://localhost:${server.address().port}/${page}`);
    await new Promise(resolve => setTimeout(resolve, 1500));

    const report = await tab.evaluate(() => {
        const css = (property, value) => CSS.supports(property, value);
        const selector = text => CSS.supports(`selector(${text})`);

        return {
            userAgent: navigator.userAgent,
            "appearance: base-select": css("appearance", "base-select"),
            "::picker(select)": selector("::picker(select)"),
            "anchor-name": css("anchor-name", "--a"),
            "position-anchor": css("position-anchor", "--a"),
            "anchor()": css("top", "anchor(bottom)"),
            "anchor(inside)": css("inset-inline-start", "anchor(inside)"),
            "anchor-size()": css("min-width", "anchor-size(width)"),
            "position-try-fallbacks": css("position-try-fallbacks", "flip-block"),
            "anchor-scope": css("anchor-scope", "all"),
            "popover": "popover" in HTMLElement.prototype,
            "CSS.highlights": "highlights" in CSS,
            "CustomStateSet": typeof CustomStateSet !== "undefined",
            "light-dark()": css("color", "light-dark(red, blue)"),
            "nesting (&)": selector("&"),
            ":dir()": selector(":dir(rtl)"),
            ":user-invalid": selector(":user-invalid"),
            "forced-color-adjust": css("forced-color-adjust", "none"),
            "scheduler.yield": typeof globalThis.scheduler?.yield === "function",
            "pickers enhanced": document.querySelectorAll("platy-picker > select.pp-select").length,
        };
    });

    console.log(`${browserName}: ${await browser.version()}`);
    for (const [name, value] of Object.entries(report)) console.log(`  ${name.padEnd(26)} ${value}`);

    if (run) {
        const code = await readFile(run, "utf8");
        const result = await tab.evaluate(`(async () => { ${code} })()`);
        console.log("run:", JSON.stringify(result, null, 2));
    }

    if (shot) {
        await tab.screenshot({ path: shot });
        console.log("screenshot:", shot);
    }

    if (errors.length) console.log("errors:", errors);
} finally {
    await browser.close();
    server.close();
}