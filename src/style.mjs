/**
 * Empty-slot placeholder icons: per-slot image or the built-in FA glyph, tinted and hue-rotated
 * from the world slot style. DESIGN.md §6.5.
 */

import { SLOT_ICONS } from "./slots.mjs";

const esc = foundry.utils.escapeHTML;

/**
 * Markup for one slot's placeholder. A tinted image is drawn as a CSS mask filled with the style
 * color, so transparent-background art becomes a silhouette; untinted images show as-is.
 */
export function glyphHtml(key, style) {
  const src = style.images?.[key];
  if (src) {
    const url = esc(src).replaceAll("'", "%27");
    if (style.tint) return `<span class="pep-glyph pep-glyph-mask" style="--pep-img: url('${url}')"></span>`;
    return `<img class="pep-glyph pep-glyph-img" src="${esc(src)}" alt="">`;
  }
  return `<i class="fa-solid ${SLOT_ICONS[key] ?? "fa-circle"} pep-glyph pep-glyph-fa" inert></i>`;
}

/** Color and hue as CSS variables on a window root. */
export function applyStyleVars(el, style) {
  el.style.setProperty("--pep-icon-color", style.color);
  el.style.setProperty("--pep-icon-hue", `${style.hue}deg`);
}
