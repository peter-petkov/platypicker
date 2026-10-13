"use strict";

// ---------------------------------------------------------------------------
// Theme. Runs immediately because this file is loaded in <head>, so the page never flashes the wrong theme.
// ---------------------------------------------------------------------------

const darkQuery = matchMedia("(prefers-color-scheme: dark)");
let themePreference = "auto"; // auto | light | dark

try {
    themePreference = localStorage.getItem("pp-theme") || "auto";
} catch {
}

function applyTheme() {
    document.documentElement.dataset.bsTheme =
        themePreference === "auto" ? (darkQuery.matches ? "dark" : "light") : themePreference;
}

darkQuery.addEventListener("change", applyTheme);
applyTheme();

// ---------------------------------------------------------------------------
// Page setup. The "interactive" ready state comes after parsing but BEFORE deferred module scripts run, so the
// demo selects are filled before the platypicker module defines <platy-picker> and reads their options.
// ---------------------------------------------------------------------------

document.addEventListener("readystatechange", () => {
    if (document.readyState === "interactive") init();
});

function init() {
    fillSelects();
    setupTheme();
    setupSupportNotice();
    setupLiveDemo();
    setupBenchmark();
}

// ---------------------------------------------------------------------------
// Demo data. An item is a label, or [label, subtext]. Subtext is only used when the select asks for it,
// as in data-fill="cities:subtext".
// ---------------------------------------------------------------------------

const DATA = {
    foods: ["🧀 Cheese", "🍞 Bread", "🍕 Pizza", "🍣 Sushi", "🌮 Taco", "🍔 Burger", "🍜 Ramen", "🥗 Salad", "🥐 Croissant", "🥞 Pancakes", "🥟 Dumplings", "🍛 Curry", "🍨 Ice cream", "🍩 Donut"],
    drinks: ["☕ Coffee", "🍵 Tea", "🧋 Bubble tea", "🥤 Soda", "🧃 Juice", "🍺 Beer", "🍷 Wine", "🥛 Milk", "💧 Water", "🍹 Cocktail"],
    plants: ["🌵 Cactus", "🌹 Rose", "🌻 Sunflower", "🌷 Tulip", "🌼 Daisy", "🌺 Hibiscus", "🌴 Palm", "🌲 Pine", "🌳 Oak", "🍀 Clover", "🌿 Basil", "🎋 Bamboo"],
    clothes: ["👕 T-shirt", "👖 Jeans", "🧥 Coat", "👗 Dress", "🧦 Socks", "🧢 Cap", "👟 Sneakers", "👢 Boots", "🧣 Scarf", "🧤 Gloves", "👔 Shirt", "👒 Sun hat"],
    furniture: ["Sofa", "Armchair", "Bed", "Wardrobe", "Nightstand", "Dining table", "Chair", "Desk", "Bookshelf", "Coffee table", "Dresser", "Stool", "Bench", "TV stand"],
    cities: [["Tokyo", "Japan"], ["Paris", "France"], ["New York", "United States"], ["Cape Town", "South Africa"], ["Sydney", "Australia"], ["Rio de Janeiro", "Brazil"], ["Cairo", "Egypt"], ["Mumbai", "India"], ["Istanbul", "Turkey"], ["Mexico City", "Mexico"], ["Berlin", "Germany"], ["Toronto", "Canada"], ["Seoul", "South Korea"], ["Buenos Aires", "Argentina"]]
};

function fillSelects() {
    for (const select of document.querySelectorAll("select[data-fill]")) {
        const [key, withSubtext] = select.dataset.fill.split(":");

        select.insertAdjacentHTML("beforeend", DATA[key].map(item => {
            const [label, subtext] = Array.isArray(item) ? item : [item];
            return `<option${withSubtext && subtext ? ` data-subtext="${subtext}"` : ""}>${label}</option>`;
        }).join(""));

        // data-pick holds the indexes of the options to preselect.
        select.dataset.pick?.split(",").forEach(index => select.options[index].selected = true);
    }
}

// ---------------------------------------------------------------------------
// Theme toggle and browser support notice
// ---------------------------------------------------------------------------

function setupTheme() {
    document.getElementById(`theme-${themePreference}`).checked = true;

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

function setupSupportNotice() {
    const supported = CSS.supports("appearance", "base-select");

    document.getElementById("no-support").classList.toggle("d-none", supported);
    document.getElementById("benchmark-run").disabled = !supported;
}

// ---------------------------------------------------------------------------
// Live changes
// ---------------------------------------------------------------------------

function setupLiveDemo() {
    const picker = document.getElementById("live");
    const select = picker.querySelector("select");
    const log = document.getElementById("live-log");
    const extraOptions = ["🍰 Cake", "🥧 Pie", "🍪 Cookie", "🍫 Chocolate", "🍇 Grapes"];
    let added = 0;

    select.addEventListener("change", () => {
        const chosen = [...select.selectedOptions].map(option => option.text).join(", ");
        log.textContent = `change event: ${chosen || "nothing selected"}`;
    });

    document.getElementById("live-set-value").addEventListener("click", () => {
        const enabled = [...select.options].filter(option => !option.disabled);
        const value = enabled[Math.floor(Math.random() * enabled.length)].value;

        picker.setValue(value);
        log.textContent = `setValue("${value}"): no change event fired`;
    });

    document.getElementById("live-add").addEventListener("click", () => {
        select.add(new Option(extraOptions[added++ % extraOptions.length]));
    });

    document.getElementById("live-remove").addEventListener("click", () => {
        select.lastElementChild?.remove();
    });

    // The checkboxes start from the element's attributes and set or remove them.
    for (const checkbox of document.querySelectorAll("[data-attr]")) {
        checkbox.checked = picker.hasAttribute(checkbox.dataset.attr);
        checkbox.addEventListener("change", () => picker.toggleAttribute(checkbox.dataset.attr, checkbox.checked));
    }
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

// Builds roughly n car options, spread evenly over the makes and optionally grouped by make.
function carOptions(n, grouped) {
    const perMake = Math.ceil(n / MAKES.length);
    let id = 0;
    let html = "";

    for (const [make, models] of MAKES) {
        let count = 0;
        let makeHtml = "";

        fill: for (const model of models) for (let year = 2026; year >= 1990; year--) for (const trim of TRIMS) for (const color of COLORS) {
            if (count++ >= perMake) break fill;
            makeHtml += `<option value="${id++}" data-subtext="${color}">${year} ${make} ${model} ${trim}</option>`;
        }

        html += grouped ? `<optgroup label="${make}">${makeHtml}</optgroup>` : makeHtml;
    }

    return html;
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
        picker.innerHTML = `<select class="form-select" aria-label="Cars"${multiple ? ' multiple size="1"' : ""}>${carOptions(count, grouped)}</select>`;

        let start = performance.now();
        host.append(picker);
        await nextPaint();
        const build = performance.now() - start;

        const select = picker.querySelector("select");
        const popover = picker.querySelector(".dropdown-menu");
        const search = picker.querySelector("input[name=platypicker-search]");
        const times = { open: [], search: [], pick: [] };
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
            domItems ||= popover.querySelectorAll(".dropdown-item").length;

            await measure("search", () => setSearch("an"));
            await measure("pick", () => popover.querySelectorAll(".dropdown-item:not(.disabled):not(.d-none)")[20]?.click());

            // Reset for the next run. A multiple select stays open after picking.
            if (popover.matches(":popover-open")) select.click();
            setSearch("");
            await nextPaint();
        }

        document.getElementById("benchmark-results").insertAdjacentHTML("afterbegin", `
            <tr>
                <td>${count.toLocaleString()}</td>
                <td>${multiple ? "multiple" : "single"}${grouped ? ", grouped" : ""}</td>
                <td>${formatMs(build)}</td>
                <td>${formatMs(median(times.open))}</td>
                <td>${formatMs(median(times.search))}</td>
                <td>${formatMs(median(times.pick))}</td>
                <td>${domItems.toLocaleString()}</td>
            </tr>`);

        runButton.disabled = false;
    });
}