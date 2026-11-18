# To do

- **Firefox and Safari**: full support. Safari 27 ships `appearance: base-select` but Platypicker hasn't been tested there; Firefox 149 has it behind preferences that are off by default. Once tested, list Safari in the docs page's Browser support section.
- **Smooth batching**: grow the list the way a spreadsheet does. Instead of adding a batch and the scrollbar jumping, the scrollbar shrinks smoothly and progressively as more rows are added while scrolling.