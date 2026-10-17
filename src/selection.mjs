/** Per-client remembered dropdown selection, keyed by actor UUID (§9.1). */

const selected = new Map();

export const getSelected = (actor) => selected.get(actor.uuid) ?? null;

export function setSelected(actor, id) {
  if (id) selected.set(actor.uuid, id);
  else selected.delete(actor.uuid);
}
