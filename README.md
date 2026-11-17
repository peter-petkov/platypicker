# Platypicker

A drop-in enhancement for the native `<select>` element: search-to-filter, select-all/none for multi-selects, and fast rendering of long option lists.

In browsers that don't yet support `appearance: base-select` (see [Browser support](#browser-support)), Platypicker falls back to the default `<select>` behaviour.

## Install

```sh
npm install platypicker
```

```js
import "platypicker";
```

This registers the `<platy-picker>` custom element. Almost everything is driven through markup and attributes; the module's default export is the element class, for the few things that need script (see [JavaScript API](#javascript-api)).

You'll also need the stylesheet:

```html
<link rel="stylesheet" href="platypicker.css">
```

**Peer dependency:** Bootstrap 5.x CSS. Platypicker renders its popover using Bootstrap's `dropdown-menu`/`dropdown-item`/`input-group` classes, so a Bootstrap 5 stylesheet must be loaded on the page.

## Usage

Wrap an existing `<select>` in `<platy-picker>`:

```html
<platy-picker search controls>
  <select name="food" class="form-select">
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

For multi-select, add `multiple` (and, for a compact single-line trigger rather than a tall listbox fallback in unsupported browsers, `size="1"`):

```html
<platy-picker search controls>
  <select name="food" class="form-select" multiple size="1">
    ...
  </select>
</platy-picker>
```

## Attributes

| Attribute            | Type    | Default               | Description                                                                                                                                                                       |
|----------------------|---------|-----------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `search`             | boolean | off                   | Shows a filter input at the top of the popover. Matches against option text, `data-subtext` and option group labels.                                                               |
| `controls`           | boolean | off                   | Shows "Select all" / "Select none" buttons.                                                                                                                                       |
| `batch-size`         | number  | `50`                  | How many options are rendered at a time; the next batch loads as you scroll near the end of the list. `0` renders the whole list. A missing or invalid value uses the default.  |
| `placeholders`       | number  | off / `10`            | Shows Bootstrap placeholder rows at the end of the list while more options are still to come. If present without a valid non-negative integer value, renders 10 placeholders. |
| `search-placeholder` | string  | `"Type to filter..."` | Placeholder text for the search input.                                                                                                                                            |
| `select-all-label`   | string  | `"Select all"`        | Label for the select-all button. Only appears when the `<select>` has `multiple`.                                                                                                 |
| `select-none-label`  | string  | `"Select none"`       | Label for the select-none button. Only appears if the `<select>` does not have the `required` attribute.                                                                          |

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
- **Select all / select none** - one-click bulk actions for multi-selects. Select all respects `disabled` options and option groups, and takes every option matching the current search, including ones not rendered yet. When either button changes 1,000 options or more, which can freeze the page for a moment, the button shows a spinner while it works.
- **Batched rendering** - long lists are rendered a batch at a time (see `batch-size`), and the next batch loads as you scroll near the end. Opening, searching and selecting stay fast with tens of thousands of options.
- **Option groups & separators** - `<optgroup>` and `<hr>` inside your `<select>` are mirrored into headers and dividers in the popover. A group's header only shows when something in the group does, and a divider only shows between two visible rows.
- **Subtext** - add `data-subtext="..."` to any `<option>` for a secondary line of text under its label (also searchable).
- **Keyboard type-ahead** - typing while the popover is open moves focus to the first option whose text starts with what you typed, mirroring native `<select>` behavior; <kbd>Enter</kbd> or <kbd>Space</kbd> then selects it. Emoji are ignored, so typing "ch" finds "🧀 Cheese", and options further down a long list are rendered as needed.
- **Focus on open** - opening the popover scrolls to the selected option. Focus goes to the search input if there is one, otherwise to the selected option.
- **Anchored, overflow-aware popover** - positioned via CSS anchor positioning; flips above the control automatically if there is no room below.
- **Live DOM sync** – add, remove, reorder or edit `<option>`/`<optgroup>` elements on the underlying `<select>` at any time, including their `disabled`, `hidden`, `label`, `title` and `data-subtext` attributes, and the popover updates to match. Only what changed is updated, so focus and scroll position survive. While the popover is closed, updates wait until it opens.
- **Placeholder rows** – add the `placeholders` attribute to show Bootstrap placeholder rows at the end of the list while more options are still to come. With a local list they only flash by, since the next batch renders before you reach it.
- **Validation-aware styling** - Bootstrap's `.is-valid`/`.is-invalid`/`.was-validated` conventions work as they would on a plain `.form-select`.
- **`:state(open)`** - the `<platy-picker>` host exposes a custom state while its popover is open, so you can style around it without a class:
```css
  platy-picker:state(open) {
    /* ... */
  }
```

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
PlatyPicker.languageMap.searchPlaceholder = "Filter...";
PlatyPicker.languageMap.selectAllLabel = "All";
PlatyPicker.languageMap.selectNoneLabel = "None";

// The most search matches highlighted at once, across the page.
PlatyPicker.maxHighlights = 100;
```

Changing the selection from script (`select.value = x`, `option.selected = true`, `form.reset()`) doesn't fire a `change` event, so the popover can't see it straight away. It catches up whenever it opens. Use `setValue()` when the popover should update immediately.

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
- If you add your own CSS around Platypicker, avoid `:has()` selectors that depend on the options or on rows in the list (for example `select:has(option:checked)`). Browsers re-check them for every option whose state changes, and on a long list that turns "Select all" into seconds of work, in Firefox especially.

## License

MIT © Peter Petkov