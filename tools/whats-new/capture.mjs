// Takes the pictures and clips of the docs page's What's new section, from stage.html, in your installed Chrome and
// with ffmpeg on the PATH. Each comes in light and dark, into docs/whats-new/<version>/.
//
//   node tools/whats-new/capture.mjs [scene ...]
//
// With no scenes it takes them all: look, skins, badges, long, phone and languages. Stills are WebP. Clips are MP4
// with a WebP poster (their first frame): skins and languages crossfade between stills, the others are filmed as they
// play. Set CHROME to Chrome's path if it isn't where Windows installs it, and HEADED=1 to watch.
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const VERSION = "2.0";
const root = fileURLToPath(new URL("../..", import.meta.url));
const out = join(root, "docs", "whats-new", VERSION);
const scale = 2;
const wide = { width: 520, height: 340 };
const tall = { width: 260, height: 500 };

const executablePath = [process.env.CHROME, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
    .find(path => path && existsSync(path));
if (!executablePath) throw new Error("No Chrome found. Set CHROME to its path.");

const types = {
    ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".ico": "image/x-icon",
};
const server = createServer(async (request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url, "http://localhost").pathname));
    try {
        const body = await readFile(join(root, path));
        response.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" });
        response.end(body);
    } catch {
        response.writeHead(404);
        response.end();
    }
});
await new Promise(resolve => server.listen(0, resolve));

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const ffmpeg = args => execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
const h264 = ["-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "24", "-preset", "slow", "-movflags", "+faststart"];

const browser = await puppeteer.launch({ executablePath, headless: !process.env.HEADED });
const temp = await mkdtemp(join(tmpdir(), "platypicker-whats-new-"));

// Opens a scene of the stage at its size, once its pickers are ready.
async function open(query, theme, viewport = wide) {
    const page = await browser.newPage();
    // Drawn at twice its size with CSS zoom rather than a device scale factor, which Chrome's screencast ignores.
    await page.setViewport({ width: viewport.width * scale, height: viewport.height * scale });
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]);
    page.on("pageerror", error => console.error("  page error:", error.message));
    await page.goto(`http://localhost:${server.address().port}/tools/whats-new/stage.html?${query}&theme=${theme}&zoom=${scale}`);
    await page.waitForSelector("html[data-ready]");
    return page;
}

// Opens a multiple select by its arrow, since the middle of the field may be a badge's ×, and shows the top of the list.
async function openByArrow(page) {
    const rtl = await page.$eval("select", select => getComputedStyle(select).direction === "rtl");
    const field = await (await page.$("select")).boundingBox();
    await page.mouse.click(rtl ? field.x + 14 : field.x + field.width - 14, field.y + field.height / 2);
    await wait(500);
    await page.$eval(".pp-menu", menu => menu.scrollTop = 0);
    await wait(100);
}

// Films what act does on the page, then encodes it as an MP4 with a poster. Chrome's screencast is used directly
// rather than page.screencast(), to get every frame Chrome draws at its full size. Each frame is held until the next one, as Chrome only sends one when something changes.
async function film(page, name, act) {
    const client = await page.createCDPSession();
    const frames = [];
    client.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
        frames.push({ data, time: metadata.timestamp });
        client.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    });
    await client.send("Page.startScreencast", { format: "png" });
    await wait(500);
    await act();
    const end = frames.at(-1).time + 0.5;
    await client.send("Page.stopScreencast");
    await client.detach();

    const dir = join(temp, name);
    await mkdir(dir);
    const list = [];
    for (const [index, frame] of frames.entries()) {
        const file = join(dir, `${String(index).padStart(5, "0")}.png`);
        await writeFile(file, Buffer.from(frame.data, "base64"));
        list.push(`file '${file.replaceAll("\\", "/")}'`, `duration ${((frames[index + 1]?.time ?? end) - frame.time).toFixed(4)}`);
    }
    list.push(list.at(-2));
    await writeFile(join(dir, "frames.txt"), list.join("\n"));

    const mp4 = join(out, `${name}.mp4`);
    ffmpeg(["-f", "concat", "-safe", "0", "-i", join(dir, "frames.txt"), "-vf", "fps=30", ...h264, mp4]);
    ffmpeg(["-i", join(dir, "00000.png"), "-c:v", "libwebp", "-quality", "88", join(out, `${name}.webp`)]);
}

// Crossfades stills into a loop that ends where it starts, each held for hold seconds.
function crossfade(stills, name, hold = 2.2, fade = 0.5) {
    const inputs = [...stills, stills[0]].flatMap((still, index, all) =>
        ["-loop", "1", "-framerate", "30", "-t", String(index === all.length - 1 ? fade : hold + fade), "-i", still]);
    const steps = stills.map((_, index) => {
        const from = index ? `[x${index}]` : "[0]";
        return `${from}[${index + 1}]xfade=transition=fade:duration=${fade}:offset=${(hold * (index + 1)).toFixed(2)}[x${index + 1}]`;
    });
    const mp4 = join(out, `${name}.mp4`);
    ffmpeg([...inputs, "-filter_complex", steps.join(";"), "-map", `[x${stills.length}]`, ...h264, mp4]);
    ffmpeg(["-i", stills[0], "-c:v", "libwebp", "-quality", "88", join(out, `${name}.webp`)]);
}

const scenes = {
    // A single select with its search open on "an", in the base look.
    async look(theme) {
        const page = await open("scene=look", theme);
        await page.click("select");
        await page.keyboard.type("an", { delay: 60 });
        await wait(500);
        await page.screenshot({ path: join(out, `look-${theme}.webp`), type: "webp", quality: 90 });
        await page.close();
    },

    // The same open multiple select in each skin.
    async skins(theme) {
        const stills = [];
        for (const skin of ["base", "bootstrap", "tailwind"]) {
            const page = await open(`scene=skins&skin=${skin}`, theme);
            await openByArrow(page);
            const still = join(temp, `skins-${skin}-${theme}.png`);
            await page.screenshot({ path: still });
            stills.push(still);
            await page.close();
        }
        crossfade(stills, `skins-${theme}`);
    },

    // Picking a few foods, closing, removing a badge, then clearing with None.
    async badges(theme) {
        const page = await open("scene=badges", theme);
        await film(page, `badges-${theme}`, async () => {
            await page.click("select");
            await wait(500);
            const items = await page.$$(".pp-item");
            for (const index of [0, 2, 3, 6]) {
                await items[index].click();
                await wait(420);
            }
            await page.keyboard.press("Escape");
            await wait(1100);
            // The badges are a picture under the select, which takes the click where the × is drawn.
            const remove = await (await page.$(".pp-tag-remove")).boundingBox();
            await page.mouse.click(remove.x + remove.width / 2, remove.y + remove.height / 2);
            await wait(1100);
            await openByArrow(page);
            await page.click('.pp-button[data-action="none"]');
            await wait(500);
            await page.keyboard.press("Escape");
            await wait(900);
        });
        await page.close();
    },

    // Scrolling 100,000 cars as the counter counts up, then searching them.
    async long(theme) {
        const page = await open("scene=long", theme);
        await film(page, `long-${theme}`, async () => {
            await page.click("select");
            await wait(700);
            // An even scroll for two seconds, as a flick of the wheel would be too fast to follow.
            await page.evaluate(() => new Promise(resolve => {
                const list = document.querySelector(".pp-menu");
                const start = performance.now();
                const step = now => {
                    list.scrollTop += 9;
                    if (now - start < 2000) requestAnimationFrame(step);
                    else resolve();
                };
                requestAnimationFrame(step);
            }));
            await wait(600);
            await page.focus(".pp-search");
            await page.keyboard.type("tesla model y", { delay: 90 });
            await wait(1400);
            await page.keyboard.press("Escape");
            await wait(900);
        });
        await page.close();
    },

    // A phone: the sheet opens, is dragged to full height, and a city is picked, then picked back.
    async phone(theme) {
        const page = await open("scene=phone", theme, tall);
        const iframe = await page.waitForSelector("iframe");
        const frame = await iframe.contentFrame();
        await frame.waitForSelector("html[data-ready]");

        // Where an element of the phone's page is on the stage: the frame is scaled down by a transform, which
        // Puppeteer's own clicks inside frames don't account for.
        const at = async (selector, text = "") => {
            const outer = await iframe.evaluate(node => {
                const box = node.getBoundingClientRect();
                return { x: box.x, y: box.y, scale: box.width / node.offsetWidth };
            });
            const inner = await frame.evaluate((selector, text) => {
                const node = [...document.querySelectorAll(selector)].find(node => node.textContent.includes(text));
                const box = node.getBoundingClientRect();
                return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
            }, selector, text);
            return { x: outer.x + inner.x * outer.scale, y: outer.y + inner.y * outer.scale };
        };
        const tap = async (selector, text) => {
            const { x, y } = await at(selector, text);
            await page.mouse.click(x, y);
        };

        await film(page, `phone-${theme}`, async () => {
            await tap("select");
            await wait(1000);
            const { x, y } = await at(".pp-bar");
            await page.mouse.move(x, y);
            await page.mouse.down();
            for (let step = 1; step <= 20; step++) {
                await page.mouse.move(x, y - step * 24);
                await wait(20);
            }
            await page.mouse.up();
            await wait(900);
            await tap(".pp-item", "Tokyo");
            await wait(1100);
            await tap("select");
            await wait(1100);
            await tap(".pp-item", "Paris");
            await wait(1000);
        });
        await page.close();
    },

    // The same picker in German, Japanese and Arabic.
    async languages(theme) {
        const stills = [];
        for (const lang of ["de", "ja", "ar"]) {
            const page = await open(`scene=languages&lang=${lang}`, theme);
            await openByArrow(page);
            const still = join(temp, `languages-${lang}-${theme}.png`);
            await page.screenshot({ path: still });
            stills.push(still);
            await page.close();
        }
        crossfade(stills, `languages-${theme}`);
    },
};

try {
    await mkdir(out, { recursive: true });
    const names = process.argv.slice(2);
    for (const name of names.length ? names : Object.keys(scenes)) {
        if (!scenes[name]) throw new Error(`No scene called ${name}. Scenes: ${Object.keys(scenes).join(", ")}`);
        for (const theme of ["light", "dark"]) {
            console.log(`${name} (${theme})`);
            await scenes[name](theme);
        }
    }
} finally {
    await browser.close();
    server.close();
    await rm(temp, { recursive: true, force: true });
}