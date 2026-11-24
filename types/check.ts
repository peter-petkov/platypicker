// Uses every public member the way the README does, so that npm run check:types fails when the definitions drift
// from it. Lines marked @ts-expect-error must stay errors. Nothing here runs.
import "platypicker/src/skins/bootstrap.js";
import "platypicker/src/skins/tailwind.js";
import PlatyPicker, { type Classes, type Layout, type LoadMoreDetail, type PartName, type Texts } from "platypicker";
import { classes } from "platypicker/src/classes.js";
import { languages } from "platypicker/src/languages.js";
import de from "platypicker/src/languages/de.js";
import zhHant from "platypicker/src/languages/zh-Hant.js";

// The element, found and created by its tag.
const picker: PlatyPicker = document.querySelector("platy-picker")!;
const created: PlatyPicker = document.createElement("platy-picker");

// Attribute properties.
picker.search = true;
picker.controls = false;
picker.counter = true;
const search: boolean = picker.search && picker.controls && picker.counter && picker.loading;
picker.placeholders = 5;
picker.placeholders = true;
const placeholders: number | undefined = picker.placeholders;
picker.batchSize = 100;
const batchSize: number = picker.batchSize;
picker.loading = true;
picker.placeholder = "Pick some fruit";
const placeholder: string = picker.placeholder;
picker.layout = "sheet";
const layout: Layout = picker.layout;
picker.max = 3;
picker.max = undefined;
picker.max = null;
const max: number | undefined = picker.max;
// @ts-expect-error not a layout
picker.layout = "dropdown";
// @ts-expect-error placeholders reads back as a number
const wrong: boolean = picker.placeholders;

// Methods and events.
picker.setValue("2");
picker.addEventListener("loadmore", event => {
    const detail: LoadMoreDetail = event.detail;
    detail.search.trim();
    detail.batchSize.toFixed();
});
picker.addEventListener("click", event => event.clientX);
picker.addEventListener("toggle", event => (event as ToggleEvent).newState, true);
picker.removeEventListener("loadmore", () => {});

// Statics.
const found: PlatyPicker | undefined = PlatyPicker.get(document.querySelector("select")!);
PlatyPicker.defaultBatchSize = 100;
PlatyPicker.sheetMedia = "(pointer: coarse) and ((max-width: 640px) or (max-height: 500px))";
PlatyPicker.classes.search = "input input-sm";
const plugs: Classes = PlatyPicker.classes;
const observed: string[] = PlatyPicker.observedAttributes;

// Class plugs.
Object.assign(classes, { item: "rounded-md px-3 py-1.5", itemSelected: "font-semibold", headerFolded: "opacity-75" });
const part: PartName = "tagsPlaceholder";
// @ts-expect-error not a part
classes.nope = "x";

// Texts.
PlatyPicker.languageMap.selectAllLabel = "Every one";
PlatyPicker.languageMap.matchesLabel = { one: "{count} hit", other: "{count} hits" };
PlatyPicker.languageMap.matchesLabel = "{count} hits";
PlatyPicker.languageMap.filteredLabel = (count, { total }) => `${count} / ${total}`;
PlatyPicker.languageMap.limitReachedLabel = (count, { max }) => `${max} at most`;
PlatyPicker.languages.de = { noMatchesLabel: "Nichts gefunden" };
PlatyPicker.languages["zh-Hant"] = zhHant;
languages.de = de;
const texts: Texts = de;
// @ts-expect-error plural forms need other
PlatyPicker.languageMap.matchesLabel = { one: "{count} hit" };
// @ts-expect-error filteredLabel's number is total
PlatyPicker.languageMap.filteredLabel = (count, { max }) => "";
// @ts-expect-error not a text
PlatyPicker.languages.de = { nope: "x" };