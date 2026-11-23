# Changelog

What's new in each release of Platypicker. Each feature release has its own section; the bugfix releases in between are folded into the version they led up to. The [docs page](https://peter-petkov.github.io/platypicker/) shows every feature live.

## 2.2

Platypicker 2.2 can limit how many options a multiple select takes, shows images and icons beside options, and comes with TypeScript types.

### Added

- **A limit for multiple selects.** `max="3"` lets a multiple select take three options at most. Once they're picked, the other rows act like disabled ones until one is unpicked, screen readers hear "Limit of 3 reached", the sheet's heading says "2 of 3 selected", and All is hidden. The picker has `:state(full)` meanwhile. It only holds back the user: markup and script can still select more. Two new texts, `selectedOfMaxLabel` and `limitReachedLabel`, in all 22 languages.
- **Images and icons.** `data-image="flags/de.svg"` on an option shows a picture before its label, and `data-icon="🧀"` an emoji, in its row and in its badge. Images are a fixed square, `--platypicker-image-size`, and load only as their rows come near the view; one that fails to load is hidden. Both are decorative. Search finds an icon when you type its emoji. New parts `pp-item-image`, `pp-item-icon`, `pp-tag-image` and `pp-tag-icon`, with class plugs of their own.
- **TypeScript types.** The package types the element, its attributes and properties, the `loadmore` event, the texts and the class plugs, so editors complete and explain them, in TypeScript and in checked JavaScript. `document.querySelector("platy-picker")` comes back as a `PlatyPicker`, and the imports by path (skins, translations) are typed too. The `dist/` global and `<platy-picker>` in React's JSX are opt-in. See TypeScript in the README.

## 2.1

Platypicker 2.1 finds options by their initials, and puts the sheet on phones in motion.

### Added

- **Motion in the sheet.** As the sheet opens, the rows in view rise into place one after another. It springs between half and full height, carrying on from the speed of a drag. A picked row dips slightly as its check mark wipes in, and the digits of "N selected" roll to the new count like an odometer. As a search filters the list, the rows that stay glide to their new places while the others fade in or out. All of it is left out with `prefers-reduced-motion`.

### Changed

- **Search matches initials.** The letters you type match in order, the first at the start of a word and the rest anywhere after it, the way an IDE finds a method by its initials: "nyc" finds New York City, "rdj" Rio de Janeiro, "lt" Laptop. Each matched part is highlighted, preferring the starts of words. Everything that matched before still does.
- **Strong matches first.** Matches where every matched part starts a word come first, then the rest, each in list order, so the best match is usually the first row. An option group moves as a whole, with its best match. While `loading` is set, and in lists of more than 50,000 options, matches stay in list order. The rows of a search don't reorder as more matches are found or loading ends, only when the search changes.
- Every search match is highlighted, not only the first 100 on the page.

### Removed

- `PlatyPicker.maxHighlights`. Setting it does nothing now.

## 2.0

Platypicker 2 drops Bootstrap and brings a look of its own, renders long lists fast, opens as a sheet on phones, speaks 22 languages, and works in Firefox. It's a breaking release for pages that relied on Bootstrap's classes: see [Upgrading from 1.x](README.md#upgrading-from-1x).

### Added

- **A look of its own.** A neutral light and dark look that needs no CSS framework, themed with `--platypicker-*` variables and following the page's `color-scheme`. It has low specificity, so your own classes on the `<select>` win over it.
- **Skins** for [Bootstrap](README.md#bootstrap) 5.3 and [Tailwind](README.md#tailwind) 4, which dress the picker in the framework's own classes or theme. Import one before `platypicker`.
- **Class plugs.** Every part has a fixed `pp-*` class, plus a plug for extra classes of your own (`PlatyPicker.classes`), such as a framework's utilities.
- **Badges.** A closed multiple select shows its selected options as badges on one line, then a "+N" count, with a &times; to remove each. `placeholder` sets the text shown while nothing is selected.
- **Long lists.** Lists render in batches (`batch-size`, 50 by default) and grow smoothly as you scroll, while search, select all and type-ahead cover the whole list. Opening, searching and picking stay fast with tens of thousands of options; the benchmark goes to a million.
- **Loading as you scroll.** `loading` and the `loadmore` event fetch options a page at a time, asking for the next page before the list runs out, with `placeholders` as skeleton rows meanwhile.
- **Counter.** `counter` adds a line under the list: rows shown of all the options, matches of a search, or options loaded so far.
- **On phones.** `layout="auto"` (the default) opens a frosted sheet along the bottom of the screen on phones. It can be dragged between half and full height, makes room for the keyboard while searching, and closes with Back on Android. `layout="sheet"` and `layout="popover"` pick one everywhere, and `layout="native"` leaves opening to the browser's own picker.
- **Localization.** Pickers follow the nearest `lang`, with translations for 22 languages loaded on demand, plural-aware texts, your own texts through `PlatyPicker.languages`, and right-to-left layouts.
- **Search** ignores case and accents ("zurich" finds "Zürich"), says "No matches" when nothing matches, and tells screen readers how many options match.
- **Accessibility.** The popover is a dialog with a listbox, which screen readers announce as on a native select, with option positions, groups and disabled options. The list is one Tab stop, with Home, End, Page Up, Page Down and Alt+↑, and focus leaving closes the popover. It works in Windows High Contrast and other forced-color modes.
- **Firefox support** without flags. Without `appearance: base-select`, the picker opens its own popover from an ordinary select.
- **Shadow roots.** Pickers work inside them.
- **Live changes** update only what changed, including an option's `disabled`, `hidden`, `label`, `title` and `data-subtext`, so focus and scroll position survive.
- **Select all / none** are much faster on long lists, and show a spinner while they change 1,000 options or more.
- **Docs page** with live examples, every example in each skin, a benchmark, a reference and a playground.
- `:state(sheet)` and `:state(native)`, beside `:state(open)`.
- `PlatyPicker.get()`, `PlatyPicker.defaultBatchSize` and `PlatyPicker.sheetMedia`; the module's default export is now the element class.

### Changed

- **Bootstrap is no longer needed**, nor used unless you add the Bootstrap skin. The popover's classes are now `pp-*` instead of Bootstrap's `dropdown-menu`, `dropdown-item` and the like, and the select's own class is `pp-select` instead of `platypicker`.
- Selected rows are marked with `aria-selected="true"` instead of `active`, and hidden parts with `hidden` instead of `d-none`.
- An invalid select gets a red border through `:user-invalid`, rather than Bootstrap's `.is-valid` / `.is-invalid`.
- Texts follow the page's `lang`. Select all and select none are labelled "All" and "None" by default.

### Removed

- The `search-placeholder`, `select-all-label` and `select-none-label` attributes. Set texts in `PlatyPicker.languageMap` or `PlatyPicker.languages` instead.

## 1.1

*1.1.1 to 1.1.15, September to October 2026.*

Platypicker became a custom element, built on `appearance: base-select` and still styled by Bootstrap 5.

- **`<platy-picker>`.** Wrap a `<select>` in it rather than marking the select with `data-toggle="platypicker"`. `search` and `controls` are attributes of the element and reflected as properties, and changes to them apply right away.
- **Texts** through the `search-placeholder`, `select-all-label` and `select-none-label` attributes.
- **Placeholders.** `placeholders` adds skeleton rows while options load.
- **Search** also matches option group labels, and `hidden` options and groups are left out of the list.
- **Keyboard navigation** through the search box, the buttons and the rows.
- **`setValue()`** sets the selection from script and updates the popover right away.
- **`:state(open)`** while the popover is open.
- The TypeScript definitions of 1.0 were dropped.

## 1.0

*1.0.3 to 1.0.19, January to April 2026.*

The first releases on npm, as a class that enhances a `<select>` with a Bootstrap 5 dropdown.

- Mark a select with `data-toggle="platypicker"`, and add `data-search="true"` and `data-controls="true"` for a search box and select all / none buttons.
- Option groups, dividers and `data-subtext`, search highlighted with the CSS Custom Highlight API, and type-ahead.
- A menu that opens upwards when there's no room below, an empty state, and validation icons for multiple selects.
- TypeScript definitions.

## Before 1.0

From 2023 to 2025, Platypicker grew out of an earlier select component, without versioned releases.