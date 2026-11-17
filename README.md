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
| `search-placeholder` | string  | `"Type to filter..."` | Placeholder text for the search input.                                                                                                                                          |
| `select-all-label`   | string  | `"All"`               | Label for select all. Only appears when the `<select>` has `multiple`.                                                                                                          |
| `select-none-label`  | string  | `"None"`              | Label for select none. Only appears if the `<select>` does not have the `required` attribute.                                                                                   |

All attributes are reflected as properties too (e.g. `picker.search = true`, `picker.batchSize = 100`), and are fully reactive – changing them after the element is connected updates the UI immediately. A new `batch-size` applies to the batches that follow; rows already rendered stay.

```html
<platy-picker search controls
              batch-size="100"
              search-placeholder="Filter fruits..."
              select-all-label="All"
              select-none-label="None">
  ...
</platy-picker>
```

## Features

- **Search/filter** - type to narrow the option list; matches are highlighted using the native CSS Custom Highlight API. The search covers the whole list, including options that aren't rendered yet.
- **Select all / select none** - one-click bulk actions for multi-selects. Select all respects `disabled` options and option groups, and takes every option matching the current search, including ones not rendered yet. When either changes 1,000 options or more, which can freeze the page for a moment, it shows a spinner while it works.
- **Badges** - a closed multi-select shows its selected options as badges on one line, then a "+N" count of those that don't fit. The × on a badge removes it with the mouse; the last badge of a `required` select has none. The badges are only a picture: the `<select>` underneath still takes the clicks, the focus and the keyboard, and is what screen readers read.
- **Batched rendering** - long lists are rendered a batch at a time (see `batch-size`), and the next batch loads as you scroll near the end. Opening, searching and selecting stay fast with tens of thousands of options.
- **Option groups & separators** - `<optgroup>` and `<hr>` inside your `<select>` are mirrored into headers and dividers in the popover. A group's header only shows when something in the group does, and a divider only shows between two visible rows.
- **Subtext** - add `data-subtext="..."` to any `<option>` for a secondary text on the right of its label (also searchable).
- **Keyboard type-ahead** - typing while the popover is open moves focus to the first option whose text starts with what you typed, mirroring native `<select>` behavior; <kbd>Enter</kbd> or <kbd>Space</kbd> then selects it. Emoji are ignored, so typing "ch" finds "🧀 Cheese", and options further down a long list are rendered as needed.
- **Focus on open** - opening the popover scrolls to the selected option. Focus goes to the search input if there is one, otherwise to the selected option.
- **Anchored, overflow-aware popover** - positioned via CSS anchor positioning; flips above the control automatically if there is no room below.
- **Live DOM sync** – add, remove, reorder or edit `<option>`/`<optgroup>` elements on the underlying `<select>` at any time, including their `disabled`, `hidden`, `label`, `title` and `data-subtext` attributes, and the popover updates to match. Only what changed is updated, so focus and scroll position survive. While the popover is closed, updates wait until it opens; the badges follow right away.
- **Placeholder rows** – add the `placeholders` attribute to show skeleton rows at the end of the list while more options are still to come. With a local list they only flash by, since the next batch renders before you reach it.
- **Accessible state** - selected rows carry `aria-pressed="true"`, so screen readers announce which options are selected.
- **`:state(open)`** - the `<platy-picker>` host exposes a custom state while its popover is open, so you can style around it without a class:
```css
  platy-picker:state(open) {
    /* ... */
  }
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

The look stays out of the way of your own CSS. Its rules have the specificity of a single class, and the select's own look has none, so a class you give the `<select>` (say, your framework's form field class) wins over it. If your page uses cascade layers, import the stylesheet into one:

```css
@import url("platypicker.css") layer(components);
```

## Class plugs

Every element Platypicker creates has a fixed `pp-*` class, which you can style directly: `pp-menu` (the popover), `pp-bar`, `pp-search`, `pp-button`, `pp-list`, `pp-item`, `pp-item-label`, `pp-item-subtext`, `pp-item-check`, `pp-header`, `pp-divider`, `pp-placeholder`, `pp-placeholder-bar`, and for the badges `pp-tags`, `pp-tag`, `pp-tag-label`, `pp-tag-remove`, `pp-tag-count` and `pp-tags-placeholder`. The `<select>` gets `pp-select`.

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
PlatyPicker.languageMap.selectAllLabel = "Alle";
PlatyPicker.languageMap.selectNoneLabel = "Keine";
PlatyPicker.languageMap.removeLabel = "Entfernen"; // the tooltip of a badge's ×

// The most search matches highlighted at once, across the page.
PlatyPicker.maxHighlights = 100;
```

Changing the selection from script (`select.value = x`, `option.selected = true`) doesn't fire a `change` event, so the popover can't see it straight away. It catches up whenever it opens, and the badges whenever it opens or closes. Use `setValue()` when the picker should update immediately. A `form.reset()` updates the badges on its own.

## Upgrading from 1.x

Version 2 drops Bootstrap. If you used 1.x with Bootstrap:

- **Bootstrap is no longer needed**, and no longer used: the popover has a look of its own, themed with the variables above. A `form-select` class on the `<select>` still styles the select itself.
- **The popover's classes changed.** CSS written against `.dropdown-menu`, `.dropdown-item`, `.dropdown-header` or `.input-group` inside the picker should use the `pp-*` classes instead, or put those Bootstrap classes back through the class plugs. The select's own class changed from `platypicker` to `pp-select`.
- **Selected rows** are marked with `aria-pressed="true"` instead of the `active` class, and hidden parts with the `hidden` attribute instead of `d-none`.
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