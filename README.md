# Platypicker

A drop-in enhancement for the native `<select>` element: search-to-filter, select-all/none for multi-selects, badges for the selected options, and fast rendering of long option lists. It brings its own neutral look and needs no CSS framework.

**[Docs and live examples](https://peter-petkov.github.io/platypicker/)**, with a playground to try every attribute.

It works in Chrome, Edge and Firefox without flags. In browsers it doesn't support yet (see [Browser support](#browser-support)), Platypicker falls back to the default `<select>` behaviour.

## Install

```sh
npm install platypicker
```

```js
import "platypicker";
```

This registers the `<platy-picker>` custom element. Almost everything is driven through markup and attributes; the module's default export is the element class, for the few things that need script (see [JavaScript API](#javascript-api)).

You'll also need the stylesheet, `src/platypicker.css` in the package:

```html
<link rel="stylesheet" href="node_modules/platypicker/src/platypicker.css">
```

## Usage

Wrap an existing `<select>` in `<platy-picker>`:

```html
<platy-picker search controls>
  <select name="food">
    <option>Cheese 🧀</option>
    <option>Bread 🍞</option>
    <optgroup label="Fruits">
      <option value="1">Apple 🍎</option>
      <option value="2">Orange 🍊</option>
    </optgroup>
  </select>
</platy-picker>
```

That's it. Platypicker enhances the `<select>` in place - it reads its `<option>`/`<optgroup>` structure, mirrors it into a searchable popover, and keeps both in sync if you mutate the `<select>` later with JavaScript.

For multi-select, add `multiple` and `size="1"`. The closed select then shows the selected options as badges, and `placeholder` sets the text shown while nothing is selected:

```html
<platy-picker search controls placeholder="Pick some food">
  <select name="food" multiple size="1">
    ...
  </select>
</platy-picker>
```

## Attributes

| Attribute            | Type    | Default               | Description                                                                                                                                                                     |
|----------------------|---------|-----------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `search`             | boolean | off                   | Shows a filter input at the top of the popover. Matches against option text, `data-subtext` and option group labels.                                                             |
| `controls`           | boolean | off                   | Shows "All" / "None" links beside the search box, which select all or none of the options.                                                                                     |
| `counter`            | boolean | off                   | Shows a line at the bottom of the popover with how many rows are shown so far out of all the options ("50 of 2,000 shown"), how many match the search ("12 of 2,000"), or, while `loading`, how many have loaded so far.  |
| `placeholder`        | string  | none                  | Text shown in a multiple select while nothing is selected.                                                                                                                      |
| `batch-size`         | number  | `50`                  | How many options the list works with at a time: the rows shown first, how far ahead it searches, and the page size it suggests to `loadmore`. More rows are shown a few at a time as you scroll. `0` renders the whole list. A missing or invalid value uses the default.  |
| `placeholders`       | number  | off / `10`            | Shows skeleton rows at the end of the list while more options are still to come. If present without a valid non-negative integer value, renders 10 of them.                    |
| `loading`            | boolean | off                   | Says more options are on their way. The end of the list stays marked, and a `loadmore` event asks for more before the list runs out. See [Loading as you scroll](#loading-as-you-scroll).        |
| `layout`             | string  | `auto`                | How the picker opens: `popover` by the select, `sheet` along the bottom of the screen, `auto`, a sheet on phones and a popover elsewhere, or `native`, the browser's own picker. See [On phones](#on-phones) and [The browser's own picker](#the-browsers-own-picker).        |

All attributes are reflected as properties too (e.g. `picker.search = true`, `picker.batchSize = 100`), and are fully reactive – changing them after the element is connected updates the UI immediately. The boolean ones are booleans, `batchSize` is a number, `placeholders` the number of skeleton rows, or `undefined` while off, and `layout` one of `"auto"`, `"sheet"`, `"popover"` and `"native"` (a missing or invalid value reads as `"auto"`). A new `batch-size` applies to the batches that follow; rows already rendered stay.

The texts, such as the search box's placeholder and the All / None labels, come from the picker's language rather than attributes. See [Localization](#localization).

```html
<platy-picker search controls counter batch-size="100" placeholder="Pick some fruit">
  ...
</platy-picker>
```

## Features

- **Search/filter** - type to narrow the option list; matches are highlighted using the native CSS Custom Highlight API. The search covers the whole list, including options that aren't rendered yet. A search that finds nothing says "No matches", and screen readers hear how many options match once typing pauses.
- **Select all / select none** - one-click bulk actions for multi-selects. Select all respects `disabled` options and option groups, and takes every option matching the current search, including ones not rendered yet. When either changes 1,000 options or more, which can freeze the page for a moment, it shows a spinner while it works.
- **Badges** - a closed multi-select shows its selected options as badges on one line, then a "+N" count of those that don't fit. The × on a badge removes it with the mouse; the last badge of a `required` select has none. The badges are only a picture: the `<select>` underneath still takes the clicks, the focus and the keyboard, and is what screen readers read.
- **Batched rendering** - long lists start with a batch of rows (see `batch-size`), and more are shown a few at a time as you scroll, so the scrollbar shrinks smoothly instead of jumping. The list searches ahead a batch at a time. Opening, searching and selecting stay fast with tens of thousands of options.
- **Counter** - with `counter`, a line at the bottom of the popover says how many rows are shown so far out of all the options, and counts up as more are shown while you scroll, so you can tell how far the end of a batched list is. With a search, it says how many options match.
- **Option groups & separators** - `<optgroup>` and `<hr>` inside your `<select>` are mirrored into headers and dividers in the popover. A group's header only shows when something in the group does, and a divider only shows between two visible rows.
- **Option attributes** - disabled options and groups stay in the list but can't be picked, `hidden` options are left out, an option's `label` is its row's text, and its `title` becomes a tooltip.
- **Subtext** - add `data-subtext="..."` to any `<option>` for a secondary text on the right of its label (also searchable).
- **Localization** - pickers follow the page's `lang`, with translations for 22 languages loaded only when needed, plural-aware texts, search that ignores case and accents, and right-to-left layouts. See below.
- **Keyboard type-ahead** - typing while the popover is open moves focus to the first option whose text starts with what you typed, mirroring native `<select>` behavior; <kbd>Enter</kbd> or <kbd>Space</kbd> then selects it. Emoji are ignored, so typing "ch" finds "🧀 Cheese", and options further down a long list are rendered as needed.
- **Focus on open** - opening the popover scrolls to the selected option. Focus goes to the search input if there is one, otherwise to the selected option. The sheet on phones leaves the search box alone, so the on-screen keyboard doesn't come up by itself.
- **On phones** - the picker opens as a sheet along the bottom of the screen, which you drag between half and full height, and which makes room for the on-screen keyboard while you search. See [On phones](#on-phones).
- **Keyboard** - as on a native select:

  | Key | Does |
  |---|---|
  | <kbd>Enter</kbd>, <kbd>Space</kbd>, <kbd>↓</kbd> or <kbd>↑</kbd> on the select | opens the popover |
  | <kbd>↓</kbd> / <kbd>↑</kbd> | moves through the search box, the buttons and the rows |
  | <kbd>Home</kbd> / <kbd>End</kbd> on a row | first / last row, rendering the rest of a long list if need be |
  | <kbd>Page Up</kbd> / <kbd>Page Down</kbd> on a row | a popover's height up or down |
  | <kbd>Enter</kbd> or <kbd>Space</kbd> on a row | picks it (a single select closes) |
  | letters | type-ahead, see above |
  | <kbd>Tab</kbd> | the search box, the buttons, then the list as one stop (the selected or last focused row); past the end, it closes the popover |
  | <kbd>Esc</kbd> or <kbd>Alt</kbd>+<kbd>↑</kbd> | closes the popover, with focus back on the select |
- **Anchored, overflow-aware popover** - positioned via CSS anchor positioning; flips above the control automatically if there is no room below.
- **Live DOM sync** – add, remove, reorder or edit `<option>`/`<optgroup>` elements on the underlying `<select>` at any time, including their `disabled`, `hidden`, `label`, `title` and `data-subtext` attributes, and the popover updates to match. Only what changed is updated, so focus and scroll position survive. While the popover is closed, updates wait until it opens; the badges follow right away.
- **Loading as you scroll** – for options that come from a server, `loading` and the `loadmore` event let you fetch them a page at a time, with `placeholders` showing skeleton rows while you wait. See below.
- **Accessible** - the popover is a dialog named after the select, which says when it's open. The list is a listbox of options that screen readers announce as selected or not and by position ("3 of 20", even while long lists render in batches), with option groups and disabled options as on a native select. It works in Windows High Contrast and other forced-color modes.
- **`:state(open)`** - the `<platy-picker>` host exposes a custom state while its popover is open, so you can style around it without a class, `:state(sheet)` while it opens as a sheet, and `:state(native)` while the browser's own picker opens instead:
```css
  platy-picker:state(open) {
    /* ... */
  }
```

## Loading as you scroll

When the options come from a server, add them to the `<select>` as they arrive. Set `loading` while there are more to come: the end of the list stays marked, with skeleton rows if `placeholders` is set, and the picker fires a `loadmore` event to ask for more before the list runs out. Fetch the next page then, append its options, and remove `loading` once there's nothing left:

```html
<platy-picker search placeholders="3" loading>
  <select name="car"></select>
</platy-picker>
```

```js
const picker = document.querySelector("platy-picker");
const select = picker.querySelector("select");
let page = 0;
let fetching = false;

picker.addEventListener("loadmore", async event => {
  if (fetching) return;
  fetching = true;

  const { batchSize } = event.detail;
  const { cars, more } = await fetch(`/cars?page=${++page}&size=${batchSize}`).then(response => response.json());
  select.append(...cars.map(car => new Option(car.name, car.id)));
  picker.loading = more;

  fetching = false;
});
```

The event bubbles, and its `detail` has `batchSize`, a good number of options to fetch (the picker's `batch-size`), and `search`, the text in the search box.

Things to know:

- **When it fires.** As soon as fewer than `batchSize` options are left to show, so the next page has time to arrive while there's still a batch to scroll through. On a list shorter than that, it fires right when the popover opens. After that it waits until you add options, but fires again whenever the end of the list comes into view.
- **It can fire while a fetch is still running**, when the end comes into view before your options arrive. Ignore it then, as `fetching` does above.
- **Fetch about `batchSize` options at a time.** Smaller pages work, but the picker then asks again as soon as each one arrives, until a batch is in reserve, so you'll see several requests in a row.
- **Remove `loading` when there's nothing left.** Until then the end of the list stays marked, and the event fires again each time the end comes into view. If a fetch fails and you add nothing, that's when it asks again.
- **Only loaded options count.** While `loading` is set, search, select all, the match count screen readers hear, the `counter`, End and type-ahead all go by the options in the `<select>` so far. The counter says so: "120 options so far". "No matches" doesn't show while loading, since more options might match.
- **Searching on the server.** The picker searches the options it has. To have the server search instead, replace the options with its results when `detail.search` changes, and set `loading` by whether it has more of them. A response can arrive after the search has changed again, so check that it's still for the current search before adding it.
- **Without `loading`**, the skeleton rows rarely show on a local list: the list searches ahead, so rows are ready before you reach the end.

## On phones

On a phone the picker opens as a sheet along the bottom of the screen rather than a popover by the select, with the same search, controls and list, laid out for touch. A browser's own picker has none of those, so Platypicker keeps its own on phones too.

- **Half or full height.** The sheet opens at a little over half the screen, over the dimmed page. Drag its bar (the handle and the heading) up or down; let go, it settles at whichever height is nearer, or closes if it's let go low enough. A flick goes on in its direction. Pulling the list down once it's scrolled to the top drags the sheet too. On Android, snapping to the other height or closing gives a light tick; iOS lets pages have no vibration.
- **On its side.** A phone in landscape is too short for half height, so the sheet opens at full height there, no wider than `37.5rem` and centred along the bottom edge.
- **A heading.** The select's label names the sheet, with how many options are selected under it in a multiple select. None and All sit either side of it.
- **The keyboard.** Opening doesn't focus the search box, so the keyboard stays down until you tap it. Then the sheet grows to full height and sits on top of the keyboard, with Cancel beside the search box. Picking options keeps the keyboard up; scrolling the list, Cancel (which also clears the search) or tapping elsewhere puts it away, and the sheet goes back to the height it had.
- **Closing.** Tap the dimmed page, drag the sheet down, or, on Android, press Back. A tap on the dimmed page only closes the sheet: nothing under it reacts.
- **Motion.** The sheet slides up as it opens and back down as it closes. With `prefers-reduced-motion` it doesn't.

`layout` picks the sheet or the popover. `auto`, the default, opens a sheet where `PlatyPicker.sheetMedia` matches, a touch screen the size of a phone, either way up: narrow, or short (a phone on its side is wide, but short):

```js
PlatyPicker.sheetMedia = "(pointer: coarse) and ((max-width: 640px) or (max-height: 500px))"; // the default
```

It's checked each time a picker opens, so a window made wider gets what fits. `layout="sheet"` opens a sheet everywhere, and `layout="popover"` never does:

```html
<platy-picker layout="popover">
  ...
</platy-picker>
```

The sheet is frosted glass by default: see-through and blurred over the page. Its look has [variables of its own](#theming), and `platy-picker:state(sheet)` matches a picker that opens as one.

Things to know:

- **Back** closes the sheet through a `CloseWatcher`, which Chrome and Edge have. It adds no entry to the history. Without one, as in Firefox and Safari so far, Back leaves the sheet open.
- **Closing in Firefox.** Firefox can't keep a closing popover on screen to slide away yet, so the sheet slides down while it's still open, and closes once it's down.
- **A page wider than the screen** widens the layout viewport in some browsers, and the sheet, which fills the width of it, with it. Keep the page within the screen's width on phones.
- **Testing in a desktop browser's phone emulation** works, with one quirk in Firefox's: a mouse double-click there arrives as two clicks on the same tap, so double-tapping a select opens and closes it again. Real phones send one.

### The browser's own picker

`layout="native"` leaves the select to the browser: a press, a tap or a key opens the browser's own picker, on every device, and the popover and the sheet never show. A single select keeps Platypicker's look while closed. A multiple select is the browser's own, closed too, with no badges over it: a button or a one-row list box on a desktop, depending on the browser, and a button on a phone.

```html
<platy-picker layout="native">
  ...
</platy-picker>
```

None of the popover's extras work in the browser's picker: `search`, `controls`, `counter` and the `data-subtext` of options don't show there. It shows what's in the `<select>` and nothing more, so with [loading as you scroll](#loading-as-you-scroll) it shows only the options loaded so far, and `loadmore` never fires: load every option up front for a picker with `layout="native"`, or switch to another layout while some are still to come.

To have the browser's picker on phones only, switch `layout` with a media query of your own:

```js
const phone = matchMedia(PlatyPicker.sheetMedia);
const sync = () => picker.layout = phone.matches ? "native" : "auto";
phone.addEventListener("change", sync);
sync();
```

## Theming

The stylesheet draws a neutral look meant to sit well in most pages, in light and dark. Change it with these variables, set on `platy-picker` or any ancestor:

| Variable                           | What it colors or sizes                           |
|------------------------------------|---------------------------------------------------|
| `--platypicker-bg`                 | popover and field background                      |
| `--platypicker-color`              | text                                              |
| `--platypicker-muted-color`        | subtexts and the search placeholder               |
| `--platypicker-header-color`       | option group labels                               |
| `--platypicker-border-color`       | lines inside the popover                          |
| `--platypicker-field-border-color` | the select, the popover and the search box        |
| `--platypicker-hover-bg`           | a row under the pointer or with keyboard focus    |
| `--platypicker-accent-color`       | check marks, select all / none, focus rings       |
| `--platypicker-disabled-color`     | disabled rows                                     |
| `--platypicker-danger-color`       | an invalid select's border                        |
| `--platypicker-highlight-bg`       | search match background                           |
| `--platypicker-highlight-color`    | search match text                                 |
| `--platypicker-tag-bg`             | a badge in a multiple select                      |
| `--platypicker-tag-border-color`   | a badge's border                                  |
| `--platypicker-radius`             | the select, rows and the search box (`6px`)       |
| `--platypicker-menu-radius`        | the popover (`8px`)                               |
| `--platypicker-shadow`             | the popover's shadow                              |
| `--platypicker-max-height`         | the popover's height limit (`45vh`)               |
| `--platypicker-sheet-bg`           | the [sheet](#on-phones), see-through so the page shows blurred behind it |
| `--platypicker-sheet-card-bg`      | the sheet's rows, grouped on cards                |
| `--platypicker-sheet-blur`         | how much the page behind the sheet is blurred (`24px`) |
| `--platypicker-sheet-backdrop`     | what dims the page behind the sheet               |
| `--platypicker-sheet-radius`       | the sheet's top corners (`14px`)                  |

```css
.checkout {
  --platypicker-accent-color: light-dark(#0b7a75, #3cc2b7);
  --platypicker-radius: 2px;
  --platypicker-menu-radius: 2px;
}
```

The default colors switch between light and dark with the page's `color-scheme`, so a page with a dark theme should say so:

```css
:root { color-scheme: light dark; }               /* follow the system */
:root[data-theme="dark"] { color-scheme: dark; }  /* or follow your own switch */
```

The look stays out of the way of your own CSS. Its colors, borders and spacing have the specificity of a single class, and the select's own look has none, so a class you give the `<select>` (say, your framework's form field class) wins over it. The rules that lay the parts out are one notch higher, so that a class can't break them. To restyle a picker entirely with a framework's classes, use a [skin](#skins). If your page uses cascade layers, import the stylesheet into one:

```css
@import url("platypicker.css") layer(components);
```

## Class plugs

Every element Platypicker creates has a fixed `pp-*` class, which you can style directly: `pp-menu` (the popover), `pp-bar`, `pp-handle`, `pp-heading`, `pp-title` and `pp-selected-count` (the sheet's handle and heading, shown only in the sheet), `pp-search-row` (the search box and the sheet's Cancel), `pp-search`, `pp-button` (All, None and Cancel, told apart by `data-action="all"`, `"none"` and `"cancel"`), `pp-list`, `pp-item`, `pp-item-label`, `pp-item-subtext`, `pp-item-check`, `pp-group`, `pp-group-list`, `pp-header`, `pp-divider`, `pp-empty` ("No matches"), `pp-counter`, `pp-status` (the match count for screen readers, hidden), `pp-placeholder`, `pp-placeholder-bar`, and for the badges `pp-tags`, `pp-tag`, `pp-tag-label`, `pp-tag-remove`, `pp-tag-count` and `pp-tags-placeholder`. The `<select>` gets `pp-select`.

Each part also has a plug: extra classes added next to its fixed one, empty by default. They let you dress the picker in a framework's own classes, such as Bootstrap's or Tailwind's utilities. Two state plugs, `itemSelected` and `itemDisabled`, are added to a row while its option is selected or disabled. The full list, with what each part is, is in `src/classes.js`.

Elements read their plug when they are created, and the pickers already in the page are created the moment `platypicker` is imported. So fill the plugs in a module of their own, which imports `src/classes.js` rather than `platypicker`, and import it first:

```js
// my-classes.js
import { classes } from "platypicker/src/classes.js";

Object.assign(classes, {
  item: "rounded-md px-3 py-1.5",
  itemSelected: "font-semibold",
  search: "input input-sm",
});
```

```js
import "./my-classes.js";
import "platypicker";
```

The same object is `PlatyPicker.classes`, which is enough for pickers you create later from script.

## Skins

A skin fits Platypicker into a CSS framework by dressing it in the framework's own classes, so the pickers look like the rest of its forms. There are skins for [Bootstrap](#bootstrap) and [Tailwind](#tailwind). Import one before `platypicker`, since it fills the class plugs that the pickers read when they are created:

```js
import "platypicker/src/skins/bootstrap.js";
import "platypicker";
```

There's no extra stylesheet to link: the skin adds its few rules itself. Imported after `platypicker`, it warns in the console. The [docs page](https://peter-petkov.github.io/platypicker/) can show all its examples in each skin.

Platypicker's look has two halves. **Layout**, how the parts sit (the row with its subtext and check mark, the sticky search bar, the badges in one line), always stays. **Paint**, the colors, borders, spacing and type, steps aside for a picker with the `pp-skin` class, as the Bootstrap skin gives it, and leaves it to the framework's classes, whichever stylesheet loads first. The skin adds rules of its own only for what the framework has no class for, and your `--platypicker-*` variables still apply to those.

### Bootstrap

For Bootstrap 5.3 or later, in its classes:

| Part                     | Classes                                                                  |
|--------------------------|--------------------------------------------------------------------------|
| select                   | `form-select`                                                            |
| popover                  | `dropdown-menu`                                                          |
| search box               | `form-control form-control-sm`                                           |
| All / None               | `btn btn-link btn-sm`                                                    |
| rows, group labels, `<hr>` | `dropdown-item`, `dropdown-header`, `dropdown-divider`                     |
| subtext                  | `small`, in the secondary text color                                     |
| badges                   | `badge` in the subtle secondary colors, with a `btn-close`                 |
| skeleton rows            | `placeholder-glow` and `placeholder`                                       |

So the select's sizes (`form-select-sm`, `form-select-lg`) and validation classes (`is-invalid`, `was-validated`) work as on any select, and everything follows your Bootstrap theme and `data-bs-theme="dark"`. The check mark takes Bootstrap's link color, and search matches its `<mark>` colors. Themes built on Bootstrap, such as Tabler or CoreUI, should work with it too.

### Tailwind

For Tailwind 4. Tailwind has no component classes, but it publishes its theme as CSS variables, so this skin keeps Platypicker's own look and paints it with Tailwind's: gray with an indigo accent, as in Tailwind's form examples, with its `--radius-md` and `--shadow-lg`.

```js
import "platypicker/src/skins/tailwind.js";
import "platypicker";
```

There's nothing to set up in Tailwind. Where your theme changes a value, such as `--color-indigo-600`, the picker follows; where your build hasn't output a variable, the skin uses Tailwind's default. Dark mode follows `color-scheme`, like the base look, so set `color-scheme: dark` wherever your Tailwind dark mode turns on. For other colors, set the [`--platypicker-*` variables](#theming), which win over the skin:

```css
platy-picker {
  --platypicker-accent-color: light-dark(#059669, #34d399); /* Tailwind's emerald-600 and -400 */
}
```

### Your own skin

A skin is a module imported before `platypicker`, of one of two kinds. One that dresses the picker in a framework's classes fills the plugs with them and includes `pp-skin` in the `host` plug, as `src/skins/bootstrap.js` does. One that only changes the colors, radius and shadow keeps the base look and sets its variables, as `src/skins/tailwind.js` does.

## Localization

Each picker speaks the language of its nearest `lang` attribute, on itself or an ancestor (also across shadow roots). It takes Platypicker's translation of that language, which loads the first time a picker needs it, so an English page loads none:

```html
<html lang="de">
  ...
  <platy-picker search controls>…</platy-picker>   <!-- "Filtern…", "Alle", "Keine" -->

  <div lang="ja">
    <platy-picker search>…</platy-picker>          <!-- "入力して絞り込み…" -->
  </div>
```

| Code | Language | | Code | Language |
|------|----------|---|------|----------|
| `ar` | Arabic (right to left) | | `ko` | Korean |
| `bg` | Bulgarian | | `mr` | Marathi |
| `bn` | Bengali | | `pl` | Polish |
| `de` | German | | `pt` | Portuguese (Brazilian) |
| `es` | Spanish | | `ru` | Russian |
| `fr` | French | | `ta` | Tamil |
| `hi` | Hindi | | `te` | Telugu |
| `id` | Indonesian | | `tr` | Turkish |
| `it` | Italian | | `ur` | Urdu (right to left) |
| `ja` | Japanese | | `vi` | Vietnamese |
| `zh-Hans` | Chinese, simplified | | `zh-Hant` | Chinese, traditional |

A regional tag uses its language (`de-AT` is `de`, `pt-BR` is `pt`), `zh`, `zh-CN` and `zh-SG` are simplified Chinese, and `zh-TW` and `zh-HK` traditional. English, and any language not listed, uses `PlatyPicker.languageMap`. A `lang` that changes is picked up the next time the popover opens. The translations haven't all been checked by native speakers yet; corrections are welcome as pull requests.

The translations are in `src/languages/`, one file per language, each a plain object of texts. To bundle one rather than load it on demand, import it and register it:

```js
import PlatyPicker from "platypicker";
import de from "platypicker/src/languages/de.js";

PlatyPicker.languages.de = de;
```

`PlatyPicker.languages` also takes languages of your own, by their code, and a language registered there wins over Platypicker's text by text. So one text can be changed on its own:

```js
PlatyPicker.languages.de = { noMatchesLabel: "Nichts gefunden" };
```

| Text                | English                        | Where                                        |
|---------------------|--------------------------------|----------------------------------------------|
| `searchPlaceholder` | Type to filter...              | the search box                               |
| `searchLabel`       | Search                         | the search box's name, for screen readers    |
| `selectAllLabel`    | All                            | select all                                   |
| `selectNoneLabel`   | None                           | select none                                  |
| `removeLabel`       | Remove                         | the tooltip of a badge's ×                   |
| `noMatchesLabel`    | No matches                     | under a search that finds nothing            |
| `matchesLabel`      | {count} match, {count} matches | read out to screen readers after a search    |
| `shownLabel`        | {count} of {total} shown       | the `counter`: rows shown of all the options |
| `loadedLabel`       | {count} option so far, {count} options so far | the `counter` while `loading`  |
| `filteredLabel`     | {count} of {total}             | the `counter`, with a search                 |
| `selectedLabel`     | {count} selected               | under the sheet's title, in a multiple select |
| `cancelLabel`       | Cancel                         | beside the sheet's search box                |

A text with a count gives its plural forms, and the browser picks the one the language's rules call for. `{count}` is the number, formatted for the language, and `other` stands in for any form left out. `shownLabel` and `filteredLabel` also have `{total}`, the number of options; their form is picked by `{count}`. A function works too, and gets the count, then the other numbers (`{ total }`).

```js
PlatyPicker.languages.pl = {
  matchesLabel: { one: "{count} wynik", few: "{count} wyniki", many: "{count} wyników", other: "{count} wyniku" },
};
```

Whatever a language leaves out comes from `PlatyPicker.languageMap`, English by default. To change an English text, change it there:

```js
PlatyPicker.languageMap.searchPlaceholder = "Search...";
```

The texts are the same for every picker in a language. A picker that needs texts of its own can have a `lang` of its own, with those texts registered under it (`lang="en-x-cities"` with `PlatyPicker.languages["en-x-cities"]`).

Search compares text the way the language does, ignoring case and accents: "zurich" finds "Zürich", "strasse" finds "Straße", and with `lang="tr"`, "izmir" finds "İzmir". Matches are highlighted in the original text, and type-ahead works the same way, in any script.

In a right-to-left page (`dir="rtl"`) the picker mirrors: the popover lines up with the select's right edge, and the chevron, badges and check marks swap sides. With the Bootstrap skin, load Bootstrap's own `bootstrap.rtl.css` there too.

## JavaScript API

```js
import PlatyPicker from "platypicker";

const picker = document.querySelector("platy-picker");

// Sets the select's value and updates the popover right away, without firing a change event.
picker.setValue("2");

// The picker that enhances a given <select>, if there is one.
PlatyPicker.get(document.querySelector("select[name=food]"));

// Defaults for every picker. Set them before the pickers connect.
PlatyPicker.defaultBatchSize = 100;

// Where layout="auto" opens a sheet rather than a popover. Checked each time a picker opens. See On phones.
PlatyPicker.sheetMedia = "(pointer: coarse) and ((max-width: 640px) or (max-height: 500px))";

// The texts of pickers whose language has no translation, English by default. See Localization.
PlatyPicker.languageMap.selectAllLabel = "Every one";

// Languages of your own, or changes to Platypicker's translations. See Localization.
PlatyPicker.languages.de = { noMatchesLabel: "Nichts gefunden" };

// The extra classes each part gets. See Class plugs.
PlatyPicker.classes.search = "input input-sm";

// The most search matches highlighted at once, across the page.
PlatyPicker.maxHighlights = 100;
```

### Events

| Event      | On           | When                                                                                             |
|------------|--------------|--------------------------------------------------------------------------------------------------|
| `change`   | the `<select>` | the user picks or unpicks an option, uses select all or none, or removes a badge. It bubbles, as the select's own does. |
| `input`    | the `<select>` | also, with `change`, when a key on a closed multiple select in Firefox changes the selection.   |
| `loadmore` | the picker   | more options are wanted, while `loading` is set. `detail` has `search` and `batchSize`. See [Loading as you scroll](#loading-as-you-scroll). |

Changing the selection from script (`select.value = x`, `option.selected = true`) doesn't fire a `change` event, so the popover can't see it straight away. It catches up whenever it opens, and the badges whenever it opens or closes. Use `setValue()` when the picker should update immediately. A `form.reset()` updates the badges on its own.

## Upgrading from 1.x

Version 2 drops Bootstrap. If you used 1.x with Bootstrap:

- **Bootstrap is no longer needed**, and no longer used: the popover has a look of its own, themed with the variables above. A `form-select` class on the `<select>` still styles the select itself, and the [Bootstrap skin](#skins) brings the popover in line with your Bootstrap theme.
- **The popover's classes changed.** CSS written against `.dropdown-menu`, `.dropdown-item`, `.dropdown-header` or `.input-group` inside the picker should use the `pp-*` classes instead, or put those Bootstrap classes back through the class plugs. The select's own class changed from `platypicker` to `pp-select`.
- **Selected rows** are marked with `aria-selected="true"` instead of the `active` class, and hidden parts with the `hidden` attribute instead of `d-none`.
- **Multi-selects show badges** instead of the browser's own text, and draw their own arrow.
- **Validation** is no longer tied to `.is-valid` / `.is-invalid`. An invalid select gets a red border through `:user-invalid`; Bootstrap's classes still style the select itself.
- **Dark mode** follows `color-scheme`. Bootstrap's `data-bs-theme="dark"` already sets it.
- **Texts follow the page's `lang`.** On a page with `lang` set to a language Platypicker translates, its translation is used rather than `languageMap`. To keep texts of your own, register them in `PlatyPicker.languages` under that language (see [Localization](#localization)).
- **The `search-placeholder`, `select-all-label` and `select-none-label` attributes are gone.** Every text comes from the picker's language: set your own in `PlatyPicker.languageMap` (English) or `PlatyPicker.languages` (see [Localization](#localization)). Select all and select none are now labelled "All" and "None" by default; `languageMap` brings the old labels back.

## Browser support

Platypicker needs anchor positioning, with `anchor-scope`, and the popover attribute. It uses `appearance: base-select` where the browser has it, and works without it. As of publishing:

- Chrome and Edge 135 and later.
- Firefox, current releases (tested in 160), with no flags. See below.
- Safari hasn't been tested yet. It has anchor positioning from Safari 26 and `appearance: base-select` from 27.

In any browser without support, `<platy-picker>` does nothing: the `<select>` inside it renders and behaves exactly as a plain native `<select>` would.

### Without base-select (Firefox)

Without `appearance: base-select`, the select is an ordinary one styled with `appearance: none`, and Platypicker keeps its own dropdown shut: a press or the opening keys (Enter, Space, the arrows, Alt+↓, F4) open the popover instead. It looks and works as in Chrome, with a few differences:

- **A multiple select is a list box underneath.** Firefox draws `<select multiple size="1">` as a one-row list box, not a button. Its scrollbar is hidden and its options aren't laid out (`display: none`), so only the field shows under the badges, and a long list stays fast: Firefox would otherwise lay out every option each time the select is built, focused or changed. Your own CSS on its options won't show.
- **Keys on a closed multiple select act as in Chrome.** A letter, Home, End or a page key selects one option in place and drops the rest, as Chrome's closed multiple select does. Page Down moves one option, where Chrome moves a few. Select all (Ctrl+A) does nothing, as in Chrome.
- **Screen readers call a multiple select a list box** rather than a combo box, and with its options not laid out, the closed field doesn't list them. The popover lists them, marked as selected or not, as in Chrome.
- **Firefox for Android** hasn't been tested: a tap may still open the browser's own picker.
- **The sheet's closing slide** works differently: Firefox can't transition `overlay` yet, so the sheet slides down while it's still open, and closes once it's down (see [On phones](#on-phones)). Back doesn't close the sheet, as Firefox has no `CloseWatcher`.

## Notes

- Platypicker renders its own popover for every select, single or multiple, rather than the browser's customizable one (`appearance: base-select`), so search and the controls work the same in every supported browser.
- Pickers work inside shadow roots, where the stylesheet has to be linked (or adopted) too, since a page's styles don't reach into them.
- Platypicker only enhances a direct-child `<select>` - `<platy-picker><select>...</select></platy-picker>`. Nesting it deeper isn't supported.
- The `<select>` remains the source of truth for value and form submission; Platypicker doesn't introduce a separate form-associated value of its own.
- `<platy-picker>` is `display: contents`, so it doesn't change your layout: size and place the `<select>` as you would without it. A multiple select gets a minimum width of `14rem` to leave room for badges.
- If you add your own CSS around Platypicker, avoid `:has()` selectors that depend on the options or on rows in the list (for example `select:has(option:checked)`). Browsers re-check them for every option whose state changes, and on a long list that turns "Select all" into seconds of work, in Firefox especially.

## License

MIT © Peter Petkov