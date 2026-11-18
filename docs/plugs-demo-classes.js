// Fills a few plugs before platypicker is imported. In your own page, import from "platypicker/src/classes.js".
import { classes } from "../src/classes.js";

Object.assign(classes, {
    menu: "pill-menu",
    search: "pill-field",
    item: "pill-item",
    itemSelected: "pill-item-selected",
    tag: "pill-tag",
    tagRemove: "pill-tag-remove",
});