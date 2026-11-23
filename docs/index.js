"use strict";

// ---------------------------------------------------------------------------
// Theme. Runs immediately because this file is loaded in <head>, so the page never flashes the wrong theme.
// ---------------------------------------------------------------------------

let themePreference = "auto"; // auto | light | dark

try {
    themePreference = localStorage.getItem("pp-theme") || "auto";
} catch {
}

// Auto leaves the attribute off, so the page's "color-scheme: light dark" follows the system.
function applyTheme() {
    if (themePreference === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = themePreference;
}

applyTheme();

// ---------------------------------------------------------------------------
// Skin. With one other than Base, each example runs in a shadow root of its own that has the framework's stylesheet
// (see skins.js and skinStage), so the framework dresses the examples and leaves the rest of the page alone, and
// popovers still open over the page. ?skin= in the address wins over the saved choice.
// ---------------------------------------------------------------------------

let skinName = "base";

try {
    skinName = localStorage.getItem("pp-skin") || "base";
} catch {
}

skinName = new URLSearchParams(location.search).get("skin") ?? skinName;
if (!Object.hasOwn(PLATY_SKINS, skinName)) skinName = "base";

const skin = PLATY_SKINS[skinName];
const skinned = skinName !== "base";

// ---------------------------------------------------------------------------
// Page setup. The "interactive" ready state comes after parsing but BEFORE deferred module scripts run, so the
// demo selects are filled before the platypicker module defines <platy-picker> and reads their options.
// ---------------------------------------------------------------------------

document.addEventListener("readystatechange", () => {
    if (document.readyState === "interactive") init();
});

function init() {
    fillSelects(document);
    setupExamples();
    setupSkins();
    setupCodeBlocks();
    setupSkinSwitch();
    setupPagePickers();
    setupTheme();
    setupSkinTheme();
    setupVersion();
    setupPhoneNavigation();
    setupNavigation();
    setupSupportNotice();
    setupLiveDemo();
    setupTheming();
    setupPlayground();
    setupLoadingDemo();
    setupBenchmark();
    setupWhatsNew();
}

// ---------------------------------------------------------------------------
// Demo data. An item is a label, or [label, subtext]. Subtext is only used when the select asks for it,
// as in data-fill="cities:subtext". An emoji at the start of a label becomes the option's data-icon.
// ---------------------------------------------------------------------------

const DATA = {
    foods: ["🧀 Cheese", "🍞 Bread", "🍕 Pizza", "🍣 Sushi", "🌮 Taco", "🍔 Burger", "🍜 Ramen", "🥗 Salad", "🥐 Croissant", "🥞 Pancakes", "🥟 Dumplings", "🍛 Curry", "🍨 Ice cream", "🍩 Donut"],
    drinks: ["☕ Coffee", "🍵 Tea", "🧋 Bubble tea", "🥤 Soda", "🧃 Juice", "🍺 Beer", "🍷 Wine", "🥛 Milk", "💧 Water", "🍹 Cocktail"],
    plants: ["🌵 Cactus", "🌹 Rose", "🌻 Sunflower", "🌷 Tulip", "🌼 Daisy", "🌺 Hibiscus", "🌴 Palm", "🌲 Pine", "🌳 Oak", "🍀 Clover", "🌿 Basil", "🎋 Bamboo"],
    clothes: ["👕 T-shirt", "👖 Jeans", "🧥 Coat", "👗 Dress", "🧦 Socks", "🧢 Cap", "👟 Sneakers", "👢 Boots", "🧣 Scarf", "🧤 Gloves", "👔 Shirt", "👒 Sun hat"],
    rooms: ["Kitchen", "Living room", "Bedroom", "Bathroom", "Hallway", "Office", "Garage", "Garden"],
    furniture: ["Sofa", "Armchair", "Bed", "Wardrobe", "Nightstand", "Dining table", "Chair", "Desk", "Bookshelf", "Coffee table", "Dresser", "Stool", "Bench", "TV stand"],
    cities: [["Tokyo", "Japan"], ["Paris", "France"], ["New York", "United States"], ["Cape Town", "South Africa"], ["Sydney", "Australia"], ["Rio de Janeiro", "Brazil"], ["Cairo", "Egypt"], ["Mumbai", "India"], ["Istanbul", "Turkey"], ["Mexico City", "Mexico"], ["Berlin", "Germany"], ["Toronto", "Canada"], ["Seoul", "South Korea"], ["Buenos Aires", "Argentina"]]
};

// Makes an option from a demo item: "🧀 Cheese" is data-icon="🧀" and the label Cheese.
function demoOption(item, withSubtext = true) {
    const [text, subtext] = Array.isArray(item) ? item : [item];
    const [, icon, label] = text.match(/^([^\p{L}\p{N}\s]+)\s+(.+)$/u) ?? [, "", text];
    const option = new Option(label);
    if (icon) option.dataset.icon = icon;
    if (withSubtext && subtext) option.dataset.subtext = subtext;
    return option;
}

// Fills the selects under root (the document, or an example's template). The data-* attributes are removed afterwards,
// so the code shown for an example is plain markup, and nothing is filled twice.
function fillSelects(root) {
    for (const select of root.querySelectorAll("select[data-fill], select[data-cars]")) {
        const [key, withSubtext] = (select.dataset.fill ?? "").split(":");

        if (DATA[key]) select.append(...DATA[key].map(item => demoOption(item, Boolean(withSubtext))));

        // data-cars asks for that many generated car options, for lists that are long enough to need batches.
        if (select.dataset.cars) select.insertAdjacentHTML("beforeend", carOptions(Number(select.dataset.cars), false));

        // data-pick holds the indexes of the options to preselect. Setting the attribute shows them in the code too.
        select.dataset.pick?.split(",").forEach(index => select.options[index].defaultSelected = true);

        select.removeAttribute("data-fill");
        select.removeAttribute("data-cars");
        select.removeAttribute("data-pick");
    }
}

// ---------------------------------------------------------------------------
// Examples. An .example holds a <template> with the live markup, and optionally <script type="text/plain"
// data-code="CSS"> blocks for more tabs. The template is copied onto a stage and printed as the HTML tab, so the
// example and its code can't drift apart. A <template data-code> or <script type="text/plain" data-code> outside an
// example is just a code block.
// ---------------------------------------------------------------------------

function setupExamples() {
    for (const example of document.querySelectorAll(".example")) {
        const template = example.querySelector(":scope > template:not([data-code])");
        const stage = document.createElement("div");
        const extras = [...example.querySelectorAll(":scope > .stage-extra")];
        const tabs = [];

        stage.className = "stage";

        if (template) {
            fillSelects(template.content);
            tabs.push({ label: "HTML", text: printHTML(template.content.childNodes), html: true });
        }

        // stageReady resolves to the element that holds the example's pickers: the stage, or in a skin, the root in
        // its shadow root. Page controls for the example (marked .stage-extra) go on the stage under the pickers, and
        // aren't printed.
        if (template && skinned) {
            const host = document.createElement("div");

            host.className = "skin-stage";
            stage.append(host, ...extras);
            example.stageReady = skinStage(host).then(root => {
                root.append(document.importNode(template.content, true));
                return root;
            });
        } else {
            if (template) stage.append(template.content.cloneNode(true));
            stage.append(...extras);
            example.stageReady = Promise.resolve(stage);
        }

        const blocks = [...example.querySelectorAll(":scope > [data-code]")];
        tabs.push(...blocks.map(codeTab));

        const panel = codePanel(tabs);
        example.replaceChildren(stage, panel);
        blocks.forEach(block => loadCode(block, panel));
    }
}

// Gives the host a shadow root dressed in the current skin, and resolves with the element to put an example in, once
// the styles are there. That element is display: contents, as is the host when it's a .skin-stage, so the example
// sits on the stage as it would without a skin. It carries the framework's dark mode switch and what the framework
// sets on <body>.
const skinRoots = [];
let skinSheets;

async function skinStage(host) {
    const shadow = host.attachShadow({ mode: "open" });
    const root = document.createElement("div");

    root.className = "skin-root";
    shadow.append(root);
    skinRoots.push(root);
    syncSkinTheme();

    shadow.adoptedStyleSheets = await (skinSheets ??= loadSkinSheets());
    return root;
}

// The framework's stylesheets, platypicker.css and the skin's own rules, each parsed once and shared by every stage.
// A shadow root has no :root, so the framework's :root rules (Bootstrap's base variables, which its dark theme doesn't
// repeat) go to the shadow root's host instead.
async function loadSkinSheets() {
    const text = async href => (await fetch(href)).text().then(css => css.replace(/:root\b/g, ":host"));
    const load = async href => new CSSStyleSheet().replace(await text(href));
    const stage = new CSSStyleSheet();

    stage.replaceSync(`
        .skin-root {
            display: contents;
            ${skin.rootCss ?? ""}
        }

        select[multiple] {
            width: 20rem;
            max-width: 100%;
        }`);

    const sheets = await Promise.all([...skin.stylesheets ?? [], "../src/platypicker.css"].map(load));

    // The skin adopts its rules into the page when it loads, which is before <platy-picker> is defined.
    await customElements.whenDefined("platy-picker");
    return [...sheets, ...document.adoptedStyleSheets, stage];
}

// The stages follow the page's theme switch, through the framework's own dark mode switch.
function syncSkinTheme() {
    const theme = document.documentElement.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    for (const root of skinRoots) skin.setTheme?.(root, theme === "dark");
}

function setupSkinTheme() {
    if (!skinned) return;
    new MutationObserver(syncSkinTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncSkinTheme);
}

// The page's own pickers (the skin switch, the playground's and the benchmark's) keep the base look in a skin. The
// framework's classes would mean nothing out here, where its stylesheet isn't, so they only drop the host plug that
// would turn the base look off.
function unskin(picker) {
    const plug = String(customElements.get("platy-picker").classes.host ?? "").split(/\s+/).filter(Boolean);
    picker.classList.remove(...plug);
}

function setupPagePickers() {
    customElements.whenDefined("platy-picker").then(() => document.querySelectorAll("platy-picker").forEach(unskin));
}

// ---------------------------------------------------------------------------
// Skin switch in the header, and the Skins section's list, both from skins.js
// ---------------------------------------------------------------------------

function setupSkinSwitch() {
    const select = document.querySelector("[data-skin-switch]");

    const icon = document.querySelector("[data-skin-icon]");

    // Each skin's icon on its row, through data-image. A closed single select shows only its text, so the icon of
    // the current skin is laid over it.
    for (const [name, entry] of Object.entries(PLATY_SKINS)) {
        const option = new Option(entry.label, name, false, name === skinName);
        option.dataset.image = entry.icon;
        select.add(option);
    }
    icon.src = skin.icon;

    // Reloads the page in the chosen skin, at the same place.
    select.addEventListener("change", () => {
        const url = new URL(location.href);

        try {
            localStorage.setItem("pp-skin", select.value);
        } catch {
        }

        if (select.value === "base") url.searchParams.delete("skin");
        else url.searchParams.set("skin", select.value);
        url.hash = document.querySelector(".sidenav [aria-current]")?.hash ?? url.hash;
        location.assign(url);
    });
}

function setupSkins() {
    const list = document.querySelector("[data-skin-list]");

    for (const [name, entry] of Object.entries(PLATY_SKINS)) {
        if (name === "base") continue;

        const heading = document.createElement("h3");
        heading.style.display = "flex";
        heading.style.alignItems = "center";
        heading.style.gap = "10px";

        const description = document.createElement("p");
        const file = entry.module.split("/").at(-1);
        const install = [
            `<link rel="stylesheet" href="${entry.stylesheetName}">`,
            `<link rel="stylesheet" href="node_modules/platypicker/src/platypicker.css">`,
            `<script type="module">`,
            `  import "${entry.importPath}";`,
            `  import "platypicker";`,
            `</script>`,
        ].join("\n");
        const panel = codePanel([{ label: "HTML", text: install, html: true }, { label: file, text: "", html: false }]);
        const toolbar = document.createElement("div");
        const button = document.createElement("button");
        const icon = document.createElement("img");
        icon.src = entry.icon;
        icon.width = 32;

        heading.append(icon, entry.label);
        description.textContent = entry.description;

        button.type = "button";
        button.className = "button";
        button.textContent = name === skinName ? `This page is showing ${entry.label}` : `Show this page in ${entry.label}`;
        button.disabled = name === skinName;
        button.addEventListener("click", () => {
            const select = document.querySelector("[data-skin-switch]");
            select.value = name;
            select.dispatchEvent(new Event("change"));
        });
        toolbar.className = "toolbar skin-toolbar";
        toolbar.append(button);

        list.append(heading, description, panel, toolbar);

        // The skin's own source, as it runs.
        fetch(entry.module)
            .then(response => response.text())
            .then(text => panel.setCode(file, text.replace(/\r\n/g, "\n").trim()))
            .catch(() => {
            });
    }

    // A skin that turns the base look's paint off (pp-skin) leaves most of the Theming variables nothing to change.
    customElements.whenDefined("platy-picker").then(() => {
        if (!customElements.get("platy-picker").classes.host.split(/\s+/).includes("pp-skin")) return;
        note("#theming .example", `The ${skin.label} skin takes its look from ${skin.label}'s classes, so most of these variables only change the base look. The accent (the check mark) and the search match still apply.`);
    });
}

function note(before, text) {
    const element = document.createElement("p");
    element.className = "notice";
    element.textContent = text;
    document.querySelector(before).before(element);
}

function setupCodeBlocks() {
    for (const block of document.querySelectorAll("template[data-code], script[type='text/plain'][data-code]")) {
        const panel = codePanel([codeTab(block)]);
        block.replaceWith(panel);
        loadCode(block, panel);
    }
}

// A block with data-src shows that file, so the code shown is the code that runs.
function loadCode(block, panel) {
    if (!block.dataset.src) return;

    fetch(block.dataset.src)
        .then(response => response.text())
        .then(text => panel.setCode(block.dataset.code, text.replace(/\r\n/g, "\n").trim()))
        .catch(() => {
        });
}

function codeTab(block) {
    return block.localName === "template"
        ? { label: block.dataset.code, text: printHTML(block.content.childNodes), html: true }
        : { label: block.dataset.code, text: dedent(block.textContent), html: false };
}

// A code box with tabs (or a single label), a Copy button, and the highlighted code.
function codePanel(tabs) {
    const panel = document.createElement("div");
    const bar = document.createElement("div");
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    const copy = document.createElement("button");
    let current = tabs[0];

    // Changes a tab's code, as for the CSS that the theming controls write.
    panel.setCode = (label, text) => {
        const tab = tabs.find(tab => tab.label === label);
        tab.text = text;
        if (tab === current) show(tab);
    };

    const show = tab => {
        current = tab;
        code.innerHTML = tab.html ? highlightHTML(tab.text) : highlightCode(tab.text);
        for (const button of bar.querySelectorAll("[role=tab]")) {
            button.setAttribute("aria-selected", button.textContent === tab.label);
        }
    };

    panel.className = "code";
    bar.className = "code-bar";

    if (tabs.length > 1) {
        bar.setAttribute("role", "tablist");
        for (const tab of tabs) {
            const button = document.createElement("button");
            button.type = "button";
            button.setAttribute("role", "tab");
            button.textContent = tab.label;
            button.addEventListener("click", () => show(tab));
            bar.append(button);
        }
    } else {
        const label = document.createElement("span");
        label.className = "code-label";
        label.textContent = tabs[0].label;
        bar.append(label);
    }

    copy.type = "button";
    copy.className = "button copy";
    copy.textContent = "Copy";
    copy.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(current.text);
            copy.textContent = "Copied";
        } catch {
            copy.textContent = "Can't copy";
        }
        setTimeout(() => copy.textContent = "Copy", 1500);
    });
    bar.append(copy);

    pre.append(code);
    panel.append(bar, pre);
    show(current);
    return panel;
}

// Removes the blank lines around a block and the indentation its lines share.
function dedent(text) {
    const lines = text.replace(/^\s*\n|\n\s*$/g, "").split("\n");
    const indent = Math.min(...lines.filter(line => line.trim()).map(line => line.match(/^\s*/)[0].length));
    return lines.map(line => line.slice(indent)).join("\n");
}

// Prints nodes as indented HTML, one element per line. Lists of more than LONG_LIST options are cut short after
// SHORT_LIST of them, with a comment saying how many more there are.
const VOID_ELEMENTS = new Set(["br", "hr", "img", "input", "link", "meta"]);
const LONG_LIST = 7;
const SHORT_LIST = 5;
const escapeHTML = text => text.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]);

function printHTML(nodes, depth = 0) {
    const pad = "  ".repeat(depth);
    const lines = [];

    for (const node of nodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            if (node.data.trim()) lines.push(pad + escapeHTML(node.data.trim()));
        } else if (node.nodeType === Node.COMMENT_NODE) {
            lines.push(`${pad}<!--${node.data}-->`);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const name = node.localName;
            const attributes = [...node.attributes]
                .map(({ name, value }) => value === "" ? ` ${name}` : ` ${name}="${escapeHTML(value)}"`).join("");
            const children = [...node.childNodes];

            if (VOID_ELEMENTS.has(name)) {
                lines.push(`${pad}<${name}${attributes}>`);
            } else if (children.every(child => child.nodeType === Node.TEXT_NODE)) {
                const text = node.textContent.trim();

                // A script of several lines keeps its lines, indented one step inside the tag.
                if (name === "script" && text.includes("\n")) {
                    const body = dedent(node.textContent).split("\n").map(line => line && `${pad}  ${line}`).join("\n");
                    lines.push(`${pad}<${name}${attributes}>`, body, `${pad}</${name}>`);
                } else {
                    lines.push(`${pad}<${name}${attributes}>${name === "script" ? text : escapeHTML(text)}</${name}>`);
                }
            } else {
                const options = children.filter(child => child.localName === "option");
                let shown = children;

                if (options.length > LONG_LIST) {
                    shown = children.filter(child => child.localName !== "option" || options.indexOf(child) < SHORT_LIST);
                    shown.splice(shown.indexOf(options[SHORT_LIST - 1]) + 1, 0,
                        document.createComment(` ${options.length - SHORT_LIST} more options `));
                }

                lines.push(`${pad}<${name}${attributes}>`, printHTML(shown, depth + 1), `${pad}</${name}>`);
            }
        }
    }

    return lines.filter(Boolean).join("\n");
}

const token = (kind, text) => `<span class="tok-${kind}">${escapeHTML(text)}</span>`;

function highlightHTML(text) {
    return text.replace(/(<!--[\s\S]*?-->)|(<\/?[\w-]+)([^>]*?)(\/?>)|[^<]+|</g, (match, comment, open, attributes, close) => {
        if (comment) return token("comment", comment);
        if (!open) return escapeHTML(match);

        const highlighted = attributes.replace(/([^\s=]+)(?:=("[^"]*"))?/g, (_, name, value) =>
            token("attr", name) + (value ? "=" + token("value", value) : ""));
        return token("tag", open) + highlighted + token("tag", close);
    });
}

// Comments and strings, which is enough for the short JS, CSS and shell snippets on this page.
function highlightCode(text) {
    return text.replace(/(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("[^"\n]*"|'[^'\n]*')|[^/"']+|[\s\S]/g, (match, comment, string) =>
        comment ? token("comment", comment) : string ? token("value", string) : escapeHTML(match));
}

// The version badge in the header comes from package.json.
function setupVersion() {
    const badge = document.getElementById("version");

    fetch("../package.json")
        .then(response => response.json())
        .then(({ version }) => {
            badge.textContent = version;
            badge.hidden = false;
        })
        .catch(() => {
        });
}

// ---------------------------------------------------------------------------
// On narrow screens the side navigation becomes a picker at the top of the page, built from the same links.
// ---------------------------------------------------------------------------

function setupPhoneNavigation() {
    const wrapper = document.createElement("div");
    const select = document.createElement("select");
    let group;

    for (const child of document.querySelector(".sidenav nav").children) {
        if (child.localName === "p") {
            group = document.createElement("optgroup");
            group.label = child.textContent;
            select.append(group);
        } else {
            group.append(new Option(child.textContent, child.hash.slice(1)));
        }
    }

    select.setAttribute("aria-label", "Go to section");
    select.addEventListener("change", () => document.getElementById(select.value).scrollIntoView());

    wrapper.className = "phone-nav";
    wrapper.append(document.createElement("platy-picker"));
    wrapper.firstChild.append(select);
    document.querySelector("main").prepend(wrapper);
}

// ---------------------------------------------------------------------------
// Side navigation. The current section is the last one whose top has scrolled past the line just under the header,
// or the last one on the page once it's scrolled to the bottom.
// ---------------------------------------------------------------------------

function setupNavigation() {
    const links = [...document.querySelectorAll(".sidenav a")];
    const sections = links.map(link => document.getElementById(link.hash.slice(1)));
    const phonePicker = document.querySelector(".phone-nav platy-picker");
    let shown;

    const update = () => {
        const line = document.querySelector(".topbar").offsetHeight + phonePicker.parentElement.offsetHeight + 24;
        const bottom = innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
        const current = bottom ? sections.at(-1) : sections.findLast(section => section.getBoundingClientRect().top <= line) ?? sections[0];

        if (current === shown) return;
        shown = current;

        links.forEach((link, index) => {
            if (sections[index] === current) link.setAttribute("aria-current", "location");
            else link.removeAttribute("aria-current");
        });

        // setValue() doesn't fire change, so this doesn't scroll back. Before the element is defined, the plain
        // select's value is enough.
        if (phonePicker.setValue) phonePicker.setValue(current.id);
        else phonePicker.querySelector("select").value = current.id;
    };

    addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    update();
}

// ---------------------------------------------------------------------------
// Theme toggle, version and browser support notice
// ---------------------------------------------------------------------------

function setupTheme() {
    document.querySelector(`input[name=theme][value=${themePreference}]`).checked = true;

    for (const radio of document.querySelectorAll("input[name=theme]")) {
        radio.addEventListener("change", () => {
            themePreference = radio.value;

            try {
                localStorage.setItem("pp-theme", themePreference);
            } catch {
            }

            applyTheme();
        });
    }
}

// ---------------------------------------------------------------------------
// What's new. Each clip comes in light and dark, and only the one for the page's theme shows. It plays while it's on
// screen, and is paused otherwise. With reduced motion, clips wait on their first frame, with controls to play them.
// ---------------------------------------------------------------------------

function setupWhatsNew() {
    const videos = [...document.querySelectorAll(".feature video")];
    const inView = new Set();

    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        for (const video of videos) video.controls = true;
        return;
    }

    const sync = () => {
        for (const video of videos) {
            if (inView.has(video.parentElement) && video.checkVisibility()) video.play().catch(() => {});
            else video.pause();
        }
    };

    const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
            if (entry.isIntersecting) inView.add(entry.target);
            else inView.delete(entry.target);
        }
        sync();
    }, { threshold: 0.4 });

    // The box around a clip and its twin is watched, since the twin that's hidden has no box of its own.
    for (const media of new Set(videos.map(video => video.parentElement))) observer.observe(media);
    for (const radio of document.querySelectorAll("input[name=theme]")) radio.addEventListener("change", () => setTimeout(sync));
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", sync);
}

// The same test the stylesheet uses before it styles anything.
function setupSupportNotice() {
    const supported = CSS.supports("anchor-scope", "all") && CSS.supports("selector(:popover-open)");

    document.getElementById("no-support").hidden = supported;
    document.getElementById("benchmark-run").disabled = !supported;
    document.querySelector("[data-support]").textContent = supported
        ? "✓ This browser supports it, so the pickers on this page are enhanced."
        : "✗ This browser doesn't support it, so the pickers on this page are plain selects.";
}

// ---------------------------------------------------------------------------
// Live changes
// ---------------------------------------------------------------------------

async function setupLiveDemo() {
    const example = document.querySelector("[data-live]");
    const picker = (await example.stageReady).querySelector("platy-picker");
    const select = picker.querySelector("select");
    const log = example.querySelector(".log");
    const extraOptions = ["🍰 Cake", "🥧 Pie", "🍪 Cookie", "🍫 Chocolate", "🍇 Grapes"];
    let added = 0;

    // The newest entry goes first, and only the last five are kept.
    const write = text => {
        log.insertAdjacentHTML("afterbegin", "<li></li>");
        log.firstElementChild.textContent = text;
        log.children[5]?.remove();
    };

    select.addEventListener("change", () => {
        const chosen = [...select.selectedOptions].map(option => option.text).join(", ");
        write(`change: ${chosen || "nothing selected"}`);
    });

    const actions = {
        "set-value"() {
            const enabled = [...select.options].filter(option => !option.disabled);
            const value = enabled[Math.floor(Math.random() * enabled.length)].value;

            picker.setValue(value);
            write(`setValue("${value}"), no change event`);
        },
        add() {
            const option = demoOption(extraOptions[added++ % extraOptions.length]);
            select.add(option);
            write(`added ${option.text}`);
        },
        remove() {
            const option = select.lastElementChild;
            option?.remove();
            if (option) write(`removed ${option.text}`);
        }
    };

    for (const button of example.querySelectorAll("[data-action]")) {
        button.addEventListener("click", () => actions[button.dataset.action]());
    }

    // The checkboxes start from the element's attributes and set or remove them.
    for (const checkbox of example.querySelectorAll("[data-attr]")) {
        checkbox.checked = picker.hasAttribute(checkbox.dataset.attr);
        checkbox.addEventListener("change", () => picker.toggleAttribute(checkbox.dataset.attr, checkbox.checked));
    }
}

// ---------------------------------------------------------------------------
// Theming: the controls set variables on the example's stage, and the CSS tab shows the ones that changed
// ---------------------------------------------------------------------------

async function setupTheming() {
    const example = document.querySelector("[data-theming]");
    const stage = await example.stageReady;
    const panel = example.querySelector(".code");
    const inputs = [...example.querySelectorAll("[data-var]")];
    const changed = new Set();
    const cssValue = input => input.value + (input.dataset.unit ?? "");

    // The controls nobody has moved show the default for the current theme (data-dark holds the dark one).
    const showDefaults = () => {
        const dark = (document.documentElement.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
        for (const input of inputs) {
            if (!changed.has(input)) input.value = dark && input.dataset.dark ? input.dataset.dark : input.defaultValue;
        }
    };

    const update = () => {
        for (const input of inputs) {
            if (changed.has(input)) stage.style.setProperty(input.dataset.var, cssValue(input));
            else stage.style.removeProperty(input.dataset.var);
        }

        panel.setCode("CSS", changed.size
            ? `platy-picker {\n${[...changed].map(input => `  ${input.dataset.var}: ${cssValue(input)};`).join("\n")}\n}`
            : "/* Move a control to see the CSS. */");
    };

    for (const input of inputs) input.addEventListener("input", () => {
        changed.add(input);
        update();
    });

    example.querySelector("[data-reset]").addEventListener("click", () => {
        changed.clear();
        showDefaults();
        update();
    });

    new MutationObserver(showDefaults).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", showDefaults);
    showDefaults();
    update();
}

// ---------------------------------------------------------------------------
// Loading as you scroll: pages of cars "arrive" a little after the picker asks for them
// ---------------------------------------------------------------------------

async function setupLoadingDemo() {
    const FIRST_PAGE = 50; // As if it came with the page. Later pages are as big as loadmore asks for.
    const TOTAL = 100; // roughly: the car generator spreads them evenly over the makes
    const DELAY = 800;
    const example = document.querySelector("[data-loading]");
    const picker = (await example.stageReady).querySelector("platy-picker");
    const select = picker.querySelector("select");
    const output = example.querySelector("[data-loading-count]");
    let waiting = [];
    let total = 0;
    let run = 0;
    let fetching = false;

    // The attribute rather than the property: this runs before the element is defined, and setting the property
    // then would hide the element's own accessor.
    const receivePage = size => {
        select.append(...waiting.splice(0, size));
        picker.toggleAttribute("loading", waiting.length > 0);
        output.textContent = `${select.options.length} of ${total} cars loaded`;
    };

    const startOver = () => {
        const template = select.ownerDocument.createElement("template");
        template.innerHTML = carOptions(TOTAL, false);
        waiting = [...template.content.children];
        total = waiting.length;
        select.replaceChildren();
        run++;
        fetching = false;
        receivePage(FIRST_PAGE);
    };

    picker.addEventListener("loadmore", event => {
        if (fetching) return;

        const current = run;
        fetching = true;
        output.textContent = `${select.options.length} of ${total} cars loaded, loading more…`;

        setTimeout(() => {
            if (current !== run) return;
            fetching = false;
            receivePage(event.detail.batchSize);
        }, DELAY);
    });

    example.querySelector("[data-loading-reset]").addEventListener("click", startOver);
    startOver();
}

// ---------------------------------------------------------------------------
// Playground. Every change builds a new picker from the form, prints it, and swaps it in.
// ---------------------------------------------------------------------------

const PLAYGROUND_GROUPS = `
    <option data-icon="💻">Laptop</option>
    <option data-icon="📱">Phone</option>
    <hr>
    <option disabled data-subtext="discontinued" data-icon="📠">Fax machine</option>
    <option title="Mechanical or membrane" data-icon="⌨️">Keyboard</option>
    <optgroup label="Audio">
        <option data-icon="🎧">Headphones</option>
        <option data-icon="🔊">Speaker</option>
        <option data-icon="🎙️">Microphone</option>
    </optgroup>
    <optgroup label="Cameras">
        <option data-icon="📷">Camera</option>
        <option data-icon="📹">Camcorder</option>
    </optgroup>
    <option data-icon="🔌">Charger</option>`;

// The flags are in docs/flags, named by country code.
const PLAYGROUND_COUNTRIES = [["at", "Austria"], ["fr", "France"], ["de", "Germany"], ["id", "Indonesia"],
    ["it", "Italy"], ["jp", "Japan"], ["ng", "Nigeria"], ["pl", "Poland"], ["se", "Sweden"], ["ua", "Ukraine"]]
    .map(([code, name]) => `\n    <option value="${code}" data-image="flags/${code}.svg">${name}</option>`).join("");

// The form fields that become attributes of the same name. Checkboxes are boolean attributes, the rest are left off
// while empty.
const PICKER_ATTRIBUTES = ["search", "controls", "counter", "batch-size", "placeholders", "max", "placeholder", "layout"];
const SELECT_ATTRIBUTES = ["multiple", "required", "disabled"];

// Text fields that only matter with some of the switches. The others are disabled and left out of the markup.
const PLAYGROUND_RELEVANT = {
    "placeholder": form => form.elements.multiple.checked,
    "max": form => form.elements.multiple.checked,
};

async function setupPlayground() {
    const root = document.querySelector("[data-playground]");
    const form = root.querySelector("form");
    const host = root.querySelector("[data-playground-host]");
    const log = root.querySelector(".log");
    const panel = codePanel([{ label: "HTML", text: "", html: true }]);
    let timer;

    root.append(panel);

    const write = text => {
        log.insertAdjacentHTML("afterbegin", "<li></li>");
        log.firstElementChild.textContent = text;
        log.children[5]?.remove();
    };

    const setAttributes = (element, names) => {
        for (const name of names) {
            const field = form.elements[name];
            if (field.disabled) continue;
            if (field.type === "checkbox") element.toggleAttribute(name, field.checked);
            else if (field.value.trim()) element.setAttribute(name, field.value.trim());
        }
    };

    const build = () => {
        const previous = stage.querySelector("select");
        const kept = new Set(previous ? [...previous.selectedOptions].map(option => option.value) : []);
        const picker = document.createElement("platy-picker");
        const select = document.createElement("select");
        const list = form.elements.list.value;

        for (const [name, relevant] of Object.entries(PLAYGROUND_RELEVANT)) form.elements[name].disabled = !relevant(form);
        setAttributes(picker, PICKER_ATTRIBUTES);
        select.name = list;
        select.setAttribute("aria-label", "Playground");
        setAttributes(select, SELECT_ATTRIBUTES);
        if (select.multiple) select.size = 1;

        if (list === "groups") select.innerHTML = PLAYGROUND_GROUPS;
        else if (list === "countries") select.innerHTML = PLAYGROUND_COUNTRIES;
        else if (list === "cars") select.innerHTML = carOptions(2000, false);
        else select.innerHTML = DATA[list].map(item => demoOption(item).outerHTML).join("");

        // Keep the selection where the same values are still there. A single select keeps the first of them only.
        for (const option of select.options) {
            if (kept.has(option.value) && !option.disabled && (select.multiple || !select.querySelector("[selected]"))) {
                option.defaultSelected = true;
            }
        }

        picker.append(select);
        panel.setCode("HTML", printHTML([picker]));

        select.addEventListener("change", () => {
            const chosen = [...select.selectedOptions].map(option => option.value).join(", ");
            write(`change: ${chosen || "nothing selected"}`);
        });

        stage.replaceChildren(picker);
    };

    // The pickers among the controls rebuild on change, once a pick is made.
    const pickerFields = ["list", "layout"];

    form.addEventListener("input", event => {
        if (pickerFields.includes(event.target.name)) return;
        clearTimeout(timer);
        // Text fields wait for a pause in typing, the rest rebuild at once.
        if (event.target.type === "text" || event.target.type === "number") timer = setTimeout(build, 250);
        else build();
    });
    form.addEventListener("change", event => {
        if (pickerFields.includes(event.target.name)) build();
    });
    form.addEventListener("submit", event => event.preventDefault());

    const stage = skinned ? await skinStage(host) : host;

    build();
}

// ---------------------------------------------------------------------------
// Large list benchmark
// ---------------------------------------------------------------------------

const MAKES = [
    ["Toyota", ["Corolla", "Camry", "RAV4", "Hilux", "Prius"]],
    ["Ford", ["F-150", "Mustang", "Focus", "Ranger", "Explorer"]],
    ["Tesla", ["Model 3", "Model S", "Model X", "Model Y", "Cybertruck"]],
    ["Honda", ["Civic", "Accord", "CR-V", "Fit", "Pilot"]],
    ["BMW", ["M3", "X5", "i4", "Z4", "320i"]],
    ["Volkswagen", ["Golf", "Polo", "Passat", "Tiguan", "Transporter"]],
    ["Hyundai", ["Elantra", "Tucson", "Kona", "Ioniq 5", "Santa Fe"]],
    ["Subaru", ["Outback", "Forester", "Impreza", "Crosstrek", "WRX"]]
];
const TRIMS = ["Base", "Sport", "Touring", "Limited"];
const COLORS = ["Red", "Blue", "Black", "White", "Silver", "Green"];

const YEARS = 2026 - 1990 + 1;

// Builds roughly n car options, spread evenly over the makes and optionally grouped by make. Each make has 4,440
// different cars (model, year, trim and color); past that, a long list repeats them as used cars, with their mileage
// in the subtext.
function carOptions(n, grouped) {
    const perMake = Math.ceil(n / MAKES.length);
    const parts = [];
    let id = 0;

    for (const [make, models] of MAKES) {
        const cars = models.length * YEARS * TRIMS.length * COLORS.length;
        const rows = [];

        for (let i = 0; i < perMake; i++) {
            const car = i % cars;
            const color = COLORS[car % COLORS.length];
            const trim = TRIMS[Math.floor(car / COLORS.length) % TRIMS.length];
            const year = 2026 - Math.floor(car / (COLORS.length * TRIMS.length)) % YEARS;
            const model = models[Math.floor(car / (COLORS.length * TRIMS.length * YEARS))];
            const round = Math.floor(i / cars);
            const subtext = round ? `${color}, ${(round * 7500).toLocaleString("en")} km` : color;
            rows.push(`<option value="${id++}" data-subtext="${subtext}">${year} ${make} ${model} ${trim}</option>`);
        }

        const makeHtml = rows.join("");
        parts.push(grouped ? `<optgroup label="${make}">${makeHtml}</optgroup>` : makeHtml);
    }

    return parts.join("");
}

// Resolves after the second animation frame, which is when the browser has painted the result of an action.
const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const median = values => [...values].sort((a, b) => a - b)[values.length >> 1];
const formatMs = value => `${value.toFixed(0)} ms`;

function setupBenchmark() {
    const runButton = document.getElementById("benchmark-run");

    runButton.addEventListener("click", async () => {
        const count = Number(document.getElementById("benchmark-count").value);
        const multiple = document.getElementById("benchmark-multiple").checked;
        const grouped = document.getElementById("benchmark-grouped").checked;
        const host = document.getElementById("benchmark-host");

        runButton.disabled = true;
        host.replaceChildren();
        await nextPaint();

        const picker = document.createElement("platy-picker");
        picker.setAttribute("search", "");
        if (multiple) picker.setAttribute("controls", "");
        picker.innerHTML = `<select aria-label="Cars"${multiple ? ' multiple size="1"' : ""}>${carOptions(count, grouped)}</select>`;

        let start = performance.now();
        host.append(picker);
        unskin(picker);
        await nextPaint();
        const build = performance.now() - start;

        // The list may keep rendering in the background (it is marked aria-busy while it does). Wait for it, so the
        // timings below are not mixed with that work.
        const list = picker.querySelector(".pp-list");
        while (list.getAttribute("aria-busy") === "true") await nextPaint();
        const rendered = performance.now() - start;

        const select = picker.querySelector("select");
        const popover = picker.querySelector(".pp-menu");
        const search = picker.querySelector("input[name=platypicker-search]");
        const times = { open: [], search: [], pick: [], selectAll: [], selectNone: [] };
        let domItems = 0;

        const measure = async (key, action) => {
            start = performance.now();
            action();
            await nextPaint();
            times[key].push(performance.now() - start);
        };
        const setSearch = value => {
            search.value = value;
            search.dispatchEvent(new Event("input", { bubbles: true }));
        };

        for (let run = 0; run < 3; run++) {
            await measure("open", () => select.click());
            domItems ||= popover.querySelectorAll(".pp-item").length;

            await measure("search", () => setSearch("an"));
            await measure("pick", () => popover.querySelectorAll(".pp-item:not([aria-disabled='true'])")[20]?.click());

            // Reset for the next run. A multiple select stays open after picking.
            if (popover.matches(":popover-open")) select.click();
            setSearch("");
            await nextPaint();

            if (multiple) {
                const selectAll = popover.querySelector("[data-action='all']");
                const selectNone = popover.querySelector("[data-action='none']");
                await measure("selectAll", () => selectAll.click());
                await measure("selectNone", () => selectNone.click());
            }
        }

        document.getElementById("benchmark-results").insertAdjacentHTML("afterbegin", `
            <tr>
                <td>${count.toLocaleString()}</td>
                <td>${multiple ? "multiple" : "single"}${grouped ? ", grouped" : ""}</td>
                <td>${formatMs(build)}</td>
                <td>${formatMs(rendered)}</td>
                <td>${formatMs(median(times.open))}</td>
                <td>${formatMs(median(times.search))}</td>
                <td>${formatMs(median(times.pick))}</td>
                <td>${multiple ? formatMs(median(times.selectAll)) : "-"}</td>
                <td>${multiple ? formatMs(median(times.selectNone)) : "-"}</td>
                <td>${domItems.toLocaleString()}</td>
            </tr>`);

        runButton.disabled = false;
    });
}