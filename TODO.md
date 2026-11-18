# To do

- **Safari**: test it. It has anchor positioning from 26 and `appearance: base-select` from 27, so the base-select path should apply from 27 and the Firefox one before; check `anchor-scope`. Once tested, list it in the README and the docs page's Browser support section. `npm run check:webkit` gives a first look in Playwright's WebKit (a stand-in, not Safari); confirm in a real Safari 26 and 27, e.g. on BrowserStack.
- **Firefox for Android**: check that a tap opens the popover, not the browser's own picker.