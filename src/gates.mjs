/**
 * Equip gates: async approvers run before a profile is written. DESIGN.md §8.
 */

import { MODULE_ID } from "./const.mjs";

const gates = new Map();

export function registerGate(id, handler, { order = 50 } = {}) {
  if (!id || typeof handler !== "function") throw new Error(`${MODULE_ID} | registerGate needs an id and a function`);
  gates.set(id, { id, handler, order });
}

export function unregisterGate(id) {
  gates.delete(id);
}

export const hasGates = () => gates.size > 0;

/** Sequential, in `order`. Anything but `true` cancels; a throw cancels too (§8.2). */
export async function runGates(request) {
  const ordered = [...gates.values()].sort((a, b) => a.order - b.order);
  for (const gate of ordered) {
    let ok;
    try {
      ok = await gate.handler(request);
    } catch (err) {
      console.error(`${MODULE_ID} | equip gate "${gate.id}" failed`, err);
      ui.notifications.warn(game.i18n.format("PF1EP.Warn.GateFailed", { gate: gate.id }));
      return false;
    }
    if (ok !== true) return false;
  }
  return true;
}
