# Platypicker

A drop-in enhancement for the native `<select>` element: search-to-filter, select-all/none for multi-selects, badges for the selected options, and fast rendering of long option lists. It brings its own neutral look and needs no CSS framework.

**[Docs and live examples](https://peter-petkov.github.io/platypicker/)**, with a playground to try every attribute.

In browsers that don't yet support `appearance: base-select` (see [Browser support](#browser-support)), Platypicker falls back to the default `<select>` behaviour.

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
| `placeholder`        | string  | none                  | Text shown in a multiple select while nothing is selected.                                                                                                                      |
| `batch-size`         | number  | `50`                  | How many options are rendered at a time; the next batch loads as you scroll near the end of the list. `0` renders the whole list. A missing or invalid value uses the default.  |
| `placeholders`       | number  | off / `10`            | Shows skeleton rows at the end of the list while more options are still to come. If present without a valid non-negative integer value, renders 10 of them.                    |
| `loading`            | boolean | off                   | Says more options are on their way. The end of the list stays marked, and a `loadmore` event fires as it comes near. See [Loading as you scroll](#loading-as-you-scroll).        |
| `search-placeholder` | string  | `"Type to filter..."` | Placeholder text for the search input.                                                                                                                                          |
| `select-all-label`   | string  | `"All"`               | Label for select all. Only appears when the `<select>` has `multiple`.                                                                                                          |
| `select-none-label`  | string  | `"None"`              | Label for select none. Only appears if the `<select>` does not have the `required` attribute.                                                                                   |

All attributes are reflected as properties too (e.g. `picker.search = true`, `picker.batchSize = 100`), and are fully reactive – changing them after the element is connected updates the UI immediately. A new `batch-size` applies to the batches that follow; rows already rendered stay.

```html
<platy-picker search controls
              batch-size="100"
              search-placeholder="Filter fruits..."
              select-all-label="Every fruit"
              select-none-label="No fruit">
  ...
</platy-picker>
```

## Features

- **Search/filter** - type to narrow the option list; matches are highlighted using the native CSS Custom Highlight API. The search covers the whole list, including options that aren't rendered yet. A search that finds nothing says "No matches", and screen readers hear how many options match once typing pauses.
- **Select all / select none** - one-click bulk actions for multi-selects. Select all respects `disabled` options and option groups, and takes every option matching the current search, including ones not rendered yet. When either changes 1,000 options or more, which can freeze the page for a moment, it shows a spinner while it works.
- **Badges** - a closed multi-select shows its selected options as badges on one line, then a "+N" count of those that don't fit. The × on a badge removes it with the mouse; the last badge of a `required` select has none. The badges are only a picture: the `<select>` underneath still takes the clicks, the focus and the keyboard, and is what screen readers read.
- **Batched rendering** - long lists are rendered a batch at a time (see `batch-size`), and the next batch loads as you scroll near the end. Opening, searching and selecting stay fast with tens of thousands of options.
- **Option groups & separators** - `<optgroup>` and `<hr>` inside your `<select>` are mirrored into headers and dividers in the popover. A group's header only shows when something in the group does, and a divider only shows between two visible rows.
- **Subtext** - add `data-subtext="..."` to any `<option>` for a secondary text on the right of its label (also searchable).
- **Keyboard type-ahead** - typing while the popover is open moves focus to the first option whose text starts with what you typed, mirroring native `<select>` behavior; <kbd>Enter</kbd> or <kbd>Space</kbd> then selects it. Emoji are ignored, so typing "ch" finds "🧀 Cheese", and options further down a long list are rendered as needed.
- **Focus on open** - opening the popover scrolls to the selected option. Focus goes to the search input if there is one, otherwise to the selected option.
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
- **Accessible** - the popover is a dialog named after the select, which says when it's open. The list is a listbox of options that screen readers announce as selected or not and by position ("3 of 20", even while long lists render in batches), with option groups and disabled options as on a native select.
- **`:state(open)`** - the `<platy-picker>` host exposes a custom state while its popover is open, so you can style around it without a class:
```css
  platy-picker:state(open) {
    /* ... */
  }
```

## Loading as you scroll

When the options come from a server, add them to the `<select>` as they arrive. Set `loading` while there are more to come: the end of the list stays marked, with skeleton rows if `placeholders` is set, and the picker fires a `loadmore` event whenever that end comes near. That includes opening on a list too short to fill the popover. Fetch the next page then, append its options, and remove `loading` once there's nothing left:

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

picker.addEventListener("loadmore", async () => {
  if (fetching) return;
  fetching = true;

  const { cars, more } = await fetch(`/cars?page=${++page}`).then(response => response.json());
  select.append(...cars.map(car => new Option(car.name, car.id)));
  picker.loading = more;

  fetching = false;
});
```

The event fires again each time the end of the list comes near, including right after new options are added if the end is still in view, so ignore it while a fetch is running. It bubbles, and `event.detail.search` holds the text in the search box, in case the server should filter too. Without `loading`, the skeleton rows rarely show on a local list: the next batch is rendered before you reach the end.

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

Every element Platypicker creates has a fixed `pp-*` class, which you can style directly: `pp-menu` (the popover), `pp-bar`, `pp-search`, `pp-button`, `pp-list`, `pp-item`, `pp-item-label`, `pp-item-subtext`, `pp-item-check`, `pp-group`, `pp-group-list`, `pp-header`, `pp-divider`, `pp-empty` ("No matches"), `pp-status` (the match count for screen readers, hidden), `pp-placeholder`, `pp-placeholder-bar`, and for the badges `pp-tags`, `pp-tag`, `pp-tag-label`, `pp-tag-remove`, `pp-tag-count` and `pp-tags-placeholder`. The `<select>` gets `pp-select`.

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
PlatyPicker.languageMap.searchPlaceholder = "Filtern...";
PlatyPicker.languageMap.searchLabel = "Suchen"; // the search box's name for screen readers
PlatyPicker.languageMap.selectAllLabel = "Alle";
PlatyPicker.languageMap.selectNoneLabel = "Keine";
PlatyPicker.languageMap.removeLabel = "Entfernen"; // the tooltip of a badge's ×
PlatyPicker.languageMap.noMatchesLabel = "Keine Treffer";
PlatyPicker.languageMap.matchesLabel = count => count === 1 ? "Ein Treffer" : `${count.toLocaleString("de")} Treffer`; // a function, for plurals

// The most search matches highlighted at once, across the page.
PlatyPicker.maxHighlights = 100;
```

Changing the selection from script (`select.value = x`, `option.selected = true`) doesn't fire a `change` event, so the popover can't see it straight away. It catches up whenever it opens, and the badges whenever it opens or closes. Use `setValue()` when the picker should update immediately. A `form.reset()` updates the badges on its own.

## Upgrading from 1.x

Version 2 drops Bootstrap. If you used 1.x with Bootstrap:

- **Bootstrap is no longer needed**, and no longer used: the popover has a look of its own, themed with the variables above. A `form-select` class on the `<select>` still styles the select itself, and the [Bootstrap skin](#skins) brings the popover in line with your Bootstrap theme.
- **The popover's classes changed.** CSS written against `.dropdown-menu`, `.dropdown-item`, `.dropdown-header` or `.input-group` inside the picker should use the `pp-*` classes instead, or put those Bootstrap classes back through the class plugs. The select's own class changed from `platypicker` to `pp-select`.
- **Selected rows** are marked with `aria-selected="true"` instead of the `active` class, and hidden parts with the `hidden` attribute instead of `d-none`.
- **Multi-selects show badges** instead of the browser's own text, and draw their own arrow.
- **Validation** is no longer tied to `.is-valid` / `.is-invalid`. An invalid select gets a red border through `:user-invalid`; Bootstrap's classes still style the select itself.
- **Dark mode** follows `color-scheme`. Bootstrap's `data-bs-theme="dark"` already sets it.
- **Select all and select none** are labelled "All" and "None" by default. `select-all-label`, `select-none-label` or `PlatyPicker.languageMap` bring the old labels back.

## Browser support

Platypicker requires `appearance: base-select` support. As of publishing:

- Chrome / Edge 135+
- Safari 27+ ships `appearance: base-select`; Platypicker hasn't been tested there yet
- Firefox 149+ – implemented behind preferences that are off by default (search `about:config` for `customizable_select` and `appearance-base-select`)

In any browser without support, `<platy-picker>` does nothing: the `<select>` inside it renders and behaves exactly as a plain native `<select>` would.

## Notes

- `<select multiple>` popup customization via `appearance: base-select` is very new (Chromium 145+); Platypicker deliberately renders its own popover for multi-selects rather than relying on that yet, so search/controls work consistently regardless of that feature's rollout.
- Platypicker only enhances a direct-child `<select>` - `<platy-picker><select>...</select></platy-picker>`. Nesting it deeper isn't supported.
- The `<select>` remains the source of truth for value and form submission; Platypicker doesn't introduce a separate form-associated value of its own.
- `<platy-picker>` is `display: contents`, so it doesn't change your layout: size and place the `<select>` as you would without it. A multiple select gets a minimum width of `14rem` to leave room for badges.
- If you add your own CSS around Platypicker, avoid `:has()` selectors that depend on the options or on rows in the list (for example `select:has(option:checked)`). Browsers re-check them for every option whose state changes, and on a long list that turns "Select all" into seconds of work, in Firefox especially.

## License

MIT © Peter Petkov