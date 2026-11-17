# To do

- **Tailwind skin**: like `src/skins/bootstrap.js`, imported before `platypicker`. Tailwind 4 exposes its theme as CSS variables, which the skin can map like Bootstrap's; earlier versions may need utility classes in the plugs instead.
- **Accessibility**: review roles, labels, focus handling and screen reader output, including the badges' mouse-only ×.
- **Localization**: beyond `PlatyPicker.languageMap`, look at per-picker languages, plural-aware texts and right-to-left layouts.
- **Firefox and Safari**: full support. Safari 27 ships `appearance: base-select` but Platypicker hasn't been tested there; Firefox 149 has it behind preferences that are off by default. Once tested, list Safari in the docs page's Browser support section.
- **Smooth batching**: grow the list the way a spreadsheet does. Instead of adding a batch and the scrollbar jumping, the scrollbar shrinks smoothly and progressively as more rows are added while scrolling.