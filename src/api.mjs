/**
 * Public API at `game.modules.get("pf1-equipment-profiles").api`. DESIGN.md §11.
 */

import { applyProfile } from "./apply.mjs";
import { capture } from "./capture.mjs";
import { registerGate, unregisterGate } from "./gates.mjs";
import { isCurrent } from "./plan.mjs";
import { deleteProfile, findProfile, listProfiles, writeProfile } from "./store.mjs";
import { EquipWindow } from "./apps/equip-window.mjs";

/** Document, UUID, id or name; nothing → selected token's actor, then the assigned character. */
export function resolveActor(actor) {
  if (actor instanceof Actor) return actor;
  if (typeof actor === "string" && actor) {
    if (actor.includes(".")) {
      const doc = fromUuidSync(actor);
      return doc instanceof Actor ? doc : (doc?.actor ?? null);
    }
    return game.actors.get(actor) ?? game.actors.getName(actor) ?? null;
  }
  return canvas?.tokens?.controlled?.[0]?.actor ?? game.user.character ?? null;
}

function need(actor) {
  const doc = resolveActor(actor);
  if (!doc) throw new Error("pf1-equipment-profiles | no actor found");
  return doc;
}

function needProfile(actor, idOrName) {
  const profile = findProfile(actor, idOrName);
  if (!profile) throw new Error(`pf1-equipment-profiles | no profile "${idOrName}" on ${actor.name}`);
  return profile;
}

export const api = {
  list(actor) {
    const doc = need(actor);
    return listProfiles(doc).map((p) => ({
      id: p.id,
      name: p.name,
      icon: p.icon,
      current: isCurrent(doc, p),
      quickAction: p.quickAction,
    }));
  },

  current(actor) {
    const doc = need(actor);
    return listProfiles(doc)
      .filter((p) => isCurrent(doc, p))
      .map((p) => p.id);
  },

  apply(actor, idOrName, { gates = true, source = "api" } = {}) {
    const doc = need(actor);
    return applyProfile(doc, needProfile(doc, idOrName), { gates, source });
  },

  capture(actor) {
    return capture(need(actor));
  },

  save(actor, profile) {
    return writeProfile(need(actor), profile);
  },

  async remove(actor, idOrName) {
    const doc = need(actor);
    await deleteProfile(doc, needProfile(doc, idOrName).id);
  },

  openEditor(actor, id = null) {
    return EquipWindow.open(need(actor), id);
  },

  registerGate,
  unregisterGate,
};
