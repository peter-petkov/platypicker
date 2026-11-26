"use strict";

import createDecorations from "burrowkit/decorations.js";
import { addClasses, fixedClass } from "./classes.js";

/**
 * The image (data-image) and icon (data-icon) before an option's label, in the list's rows and in the badges, with
 * the picker's classes (see Burrowkit's decorations.js). An image that fails to load gets pp-item-image-broken or
 * pp-tag-image-broken, which hides it.
 */
export const { brokenClass, syncImage, syncIcon, hideBrokenImages } = createDecorations({ addClasses, fixedClass });