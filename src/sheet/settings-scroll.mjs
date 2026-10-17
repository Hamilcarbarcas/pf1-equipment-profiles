/**
 * Keep the actor sheet's Settings tab scroll position across re-renders. DESIGN.md §3.7.
 *
 * The tab is its own scroll container (`.tab.settings { overflow: hidden scroll }` in PF1's
 * actor-settings.less) but is missing from the sheet's `scrollY` list, so any checkbox there,
 * PF1's or a module's, re-renders the sheet back to the top. AppV1 restores `scrollY` after the
 * render hooks, so registering it here covers injected sections too.
 */

const SELECTOR = ".tab.settings";

export function registerSettingsScroll() {
  Hooks.on("renderActorSheet", (app) => {
    const list = app.options?.scrollY;
    if (Array.isArray(list) && !list.includes(SELECTOR)) list.push(SELECTOR);
  });
}
