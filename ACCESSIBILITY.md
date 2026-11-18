# Accessibility checklist

What to try by hand before a release, with a real screen reader and in High Contrast. The markup is checked in the browser, but only a screen reader tells how it actually sounds. Each step says roughly what you should hear; wording differs between screen readers and versions, so look for the meaning, not the exact words.

## Setup

- **Browser**: Chrome or Edge, on the docs page: the published one, or `docs/index.html` served from the repository.
- **NVDA** (free, [nvaccess.org](https://www.nvaccess.org/download/)): start it, then use the page with the keyboard only. <kbd>Insert</kbd>+<kbd>Q</kbd> quits.
- **Narrator** (built into Windows): <kbd>Win</kbd>+<kbd>Ctrl</kbd>+<kbd>Enter</kbd> turns it on and off.
- Do a pass in the Base skin, then a shorter one in Bootstrap (the skin switch at the top).

## Opening and closing

Use **Groups and dividers** (a multiple select named "Technology").

- [ ] Tab to the select. You hear its name, that it's a combo box, collapsed, and that it has a popup (dialog).
- [ ] Press <kbd>Enter</kbd>. You hear "Technology, dialog", then the search box: "Search, edit".
- [ ] Press <kbd>Esc</kbd>. Focus is back on the select, which now says collapsed.
- [ ] Open again with <kbd>↓</kbd>, then close with <kbd>Alt</kbd>+<kbd>↑</kbd>: same as <kbd>Esc</kbd>.
- [ ] Open, then <kbd>Tab</kbd> through: search box, All, None, one row, then out to the next thing on the page. The popover closes as focus leaves, and the select says collapsed if you go back to it.

## The list

Still in **Groups and dividers**.

- [ ] From the search box, <kbd>↓</kbd> past the buttons to the first row: "Laptop, not selected, 1 of 10" (or "list box, Technology" first).
- [ ] <kbd>Space</kbd> selects it: you hear "selected". <kbd>Space</kbd> again: "not selected".
- [ ] <kbd>↓</kbd> to "Fax machine": it's announced as unavailable (or dimmed), with its subtext. <kbd>Space</kbd> does nothing.
- [ ] <kbd>↓</kbd> into the Audio group: you hear the group's name, "Audio", before "Headphones, 5 of 10". Moving within the group doesn't repeat it.
- [ ] The group names don't show up as headings: NVDA's <kbd>H</kbd> in browse mode, or <kbd>Insert</kbd>+<kbd>F7</kbd>'s headings list, has none from the popover.
- [ ] <kbd>Home</kbd> and <kbd>End</kbd> go to "1 of 10" and "10 of 10".

## Long lists

Use **Long lists** (2,000 cars, rendered 20 at a time).

- [ ] The first row says "1 of 2,000", not "1 of 20".
- [ ] <kbd>End</kbd> goes to "2,000 of 2,000". <kbd>Page Up</kbd> moves about ten rows back.

## Search

Use **Long lists** again.

- [ ] In the search box, type "tesla" and pause. After half a second you hear "250 matches", once, not for every key.
- [ ] <kbd>↓</kbd> to the first row: "1 of 250".
- [ ] Type "zzzz" and pause: "No matches", and "No matches" shows under the search box.
- [ ] Clear the search: no count is read.

## A single select

Use **Getting started** (Food).

- [ ] Open it: focus goes to the selected row (there's no search box), which says selected.
- [ ] <kbd>↓</kbd> and <kbd>Enter</kbd> on another row: the popover closes, focus is on the select, and you hear the new value.
- [ ] Open it and type "p": focus jumps to "Pizza", and you hear it.

## A closed multiple select

Use **Multiple and badges** (Plants).

- [ ] Tab to it: you hear its name and what's selected (or how many). The badges themselves aren't read out; they only repeat the selection.

## Narrator

- [ ] Repeat **Opening and closing** and the first three checks of **The list**. Narrator should say the same things in its own words.

## High Contrast

Settings → Accessibility → Contrast themes → pick one, then reload the page.

- [ ] Open **Multiple and badges**: selected rows have a visible check mark; the badges' × and the arrow on the right are visible.
- [ ] A row under the mouse, or with keyboard focus, is shown in the system highlight color, with its check mark and subtext readable.
- [ ] In **Groups and dividers**, disabled rows are in the system gray.
- [ ] In **Long lists → Loading as you scroll**, the skeleton rows are visible while loading.
- [ ] Search for something: matches are marked in the system's highlight colors.

## Known limitations

- The badges' × is mouse-only, by design: keyboard users unselect in the popover, and screen readers read the selection from the select.
- The search box label, "No matches" and the match count are page-wide (`PlatyPicker.languageMap`), not per picker.

## Reporting

For anything that sounds wrong or missing, note the screen reader and its version, the browser, the example, the keys you pressed and what you heard.