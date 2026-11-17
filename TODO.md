# To do

- **More skins**: daisyUI (closest to Bootstrap, one class per part), Bulma (its `select` class goes on a wrapper, so the skin needs its own select rules) and UIkit.
- **Accessibility**: go through `ACCESSIBILITY.md` with NVDA, Narrator and High Contrast, and fix what it turns up. VoiceOver once Safari is supported.
- **Localization**: beyond `PlatyPicker.languageMap`, look at per-picker languages, plural-aware texts and right-to-left layouts.
- **Firefox and Safari**: full support. Safari 27 ships `appearance: base-select` but Platypicker hasn't been tested there; Firefox 149 has it behind preferences that are off by default. Once tested, list Safari in the docs page's Browser support section.
- **Smooth batching**: grow the list the way a spreadsheet does. Instead of adding a batch and the scrollbar jumping, the scrollbar shrinks smoothly and progressively as more rows are added while scrolling.