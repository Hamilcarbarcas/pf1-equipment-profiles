/**
 * Name-based item matching. DESIGN.md §4.
 */

const sameName = (item, ref) => item.type === ref.type && item._source.name === ref.name;

/**
 * Pick the item a reference means.
 *
 * Tiers, first non-empty wins; the stored id breaks ties inside a tier (§4.1). Taking an item
 * out of a slot the profile ignores comes last, since Ignore means "leave it there".
 *
 * @param {Actor} actor
 * @param {object} ref - Stored reference (`itemRef`).
 * @param {object} ctx
 * @param {Set<string>} ctx.claimed - Item ids already taken by an earlier slot this pass.
 * @param {(item) => boolean} [ctx.inSlot] - Item already occupies the target slot.
 * @param {(item) => boolean} [ctx.replaceable] - Item is equipped in a slot the profile assigns.
 * @returns {Item|null}
 */
export function resolveRef(actor, ref, { claimed, inSlot = () => false, replaceable = () => false }) {
  if (!ref?.name) return null;
  const candidates = actor.items.filter((i) => sameName(i, ref) && !claimed.has(i.id));

  if (candidates.length) {
    const tiers = [inSlot, (i) => i.system.equipped !== true, replaceable, () => true];
    for (const tier of tiers) {
      const hits = candidates.filter(tier);
      if (hits.length) return hits.find((i) => i.id === ref.id) ?? hits[0];
    }
  }

  // Renamed since saving: the stored id still points at it (§4.2).
  const byId = actor.items.get(ref.id);
  if (byId && byId.type === ref.type && !claimed.has(byId.id)) return byId;
  return null;
}

/** Container holding an item matching the reference, searched depth-first. */
export function findInContainer(actor, ref) {
  const search = (items) => {
    for (const item of items) {
      if (item.type !== "container") continue;
      for (const inner of item.items ?? []) {
        if (sameName(inner, ref)) return item;
      }
      const deeper = search(item.items ?? []);
      if (deeper) return deeper;
    }
    return null;
  };
  return search(actor.items);
}
