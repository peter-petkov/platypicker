# Platypicker

A drop-in enhancement for the native `<select>` element: search-to-filter, select-all/none for multi-selects.

In browsers that don't yet support `appearance: base-select` (see [Browser support](#browser-support)), Platypicker falls back to the default `<select>` behaviour.

## Install

```sh
npm install platypicker
```

```js
import "platypicker";
```

This registers the `<platy-picker>` custom element. It has no JS exports to import directly – everything is driven through markup and attributes.

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

| Attribute            | Type    | Default               | Description                                                                                                                        |
|----------------------|---------|-----------------------|------------------------------------------------------------------------------------------------------------------------------------|
| `search`             | boolean | off                   | Shows a filter input at the top of the popover. Matches against option text and `data-subtext`.                                    |
| `controls`           | boolean | off                   | Shows "Select all" / "Select none" buttons.                                                                                        |
| `placeholders`       | number  | off / `10`            | Appends Bootstrap placeholder rows to the popover. If present without a valid non-negative integer value, renders 10 placeholders. |
| `search-placeholder` | string  | `"Type to filter..."` | Placeholder text for the search input.                                                                                             |
| `select-all-label`   | string  | `"Select all"`        | Label for the select-all button. Only appears when the `<select>` has `multiple`.                                                  |
| `select-none-label`  | string  | `"Select none"`       | Label for the select-none button. Only appears if the `<select>` does not have the `required` attribute                            |

All attributes are reflected as properties too (e.g. `picker.search = true`), and are fully reactive – changing them after the element is connected updates the UI immediately.

```html
<platy-picker search controls
              search-placeholder="Filter fruits..."
              select-all-label="All"
              select-none-label="None">
  ...
</platy-picker>
```

## Features

- **Search/filter** - type to narrow the option list; matches are highlighted using the native CSS Custom Highlight API.
- **Select all / select none** - one-click bulk actions for multi-selects, respecting `disabled` options, option groups, and whatever the current search filter is showing.
- **Option groups & separators** - `<optgroup>` and `<hr>` inside your `<select>` are mirrored into headers and dividers in the popover, including hiding a group's header/divider automatically when a filter leaves nothing in that group visible.
- **Subtext** - add `data-subtext="..."` to any `<option>` for a secondary line of text under its label (also searchable).
- **Keyboard type-ahead** - typing while the popover is open jumps to (or, for non-multiselects, selects) the first matching option, mirroring native `<select>` behavior.
- **Anchored, overflow-aware popover** - positioned via CSS anchor positioning; flips above the control automatically if there is no room below.
- **Live DOM sync** – add, remove, or reorder `<option>`/`<optgroup>` elements on the underlying `<select>` at any time; the popover updates to match.
- **Placeholder rows** – add the `placeholders` attribute to append Bootstrap placeholder rows while options are loading. Placeholders are removed as soon as you modify the select's options content.
- **Validation-aware styling** - Bootstrap's `.is-valid`/`.is-invalid`/`.was-validated` conventions work as they would on a plain `.form-select`.
- **`:state(open)`** - the `<platy-picker>` host exposes a custom state while its popover is open, so you can style around it without a class:
```css
  platy-picker:state(open) {
    /* ... */
  }
```

## Browser support

Platypicker requires `appearance: base-select` support. As of publishing:

- Chrome / Edge 135+
- Firefox – implemented behind the `dom.select.customizable_select.enabled` and `layout.css.appearance-base.enabled` flags, not yet enabled by default
- Safari – not yet shipped

In any browser without support, `<platy-picker>` does nothing: the `<select>` inside it renders and behaves exactly as a plain native `<select>` would.

## Notes

- `<select multiple>` popup customization via `appearance: base-select` is very new (Chromium 145+); Platypicker deliberately renders its own popover for multi-selects rather than relying on that yet, so search/controls work consistently regardless of that feature's rollout.
- Platypicker only enhances a direct-child `<select>` - `<platy-picker><select>...</select></platy-picker>`. Nesting it deeper isn't supported.
- The `<select>` remains the source of truth for value and form submission; Platypicker doesn't introduce a separate form-associated value of its own.

## License

MIT © Peter Petkov