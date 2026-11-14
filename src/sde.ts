// Helpers to build a Catalog from the SDE.

import type { Kind } from "./catalog.ts";
import { fold } from "./names.ts";

const CATEGORY_KINDS = new Map<number, Kind>([
  [6, "hull"],
  [65, "hull"],
  [32, "sub"],
  [18, "drone"],
  [87, "fighter"],
  [8, "charge"],
  [20, "implant"],
]);
const CATEGORY_MODULES = new Set([7, 66]);

const GROUP_BOOSTER = 303;
const GROUP_SHIP_MODIFIERS = 1306;
const GROUP_CONTAINERS = new Set([12, 340, 448, 649]);

const EFFECT_ONLINE = 16;
const EFFECT_CATEGORY_ACTIVE = 1;
const EFFECT_CATEGORY_TARGET = 2;
const SLOT_EFFECTS = new Map<number, Kind>([
  [12, "high"],
  [13, "mid"],
  [11, "low"],
  [2663, "rig"],
  [6306, "svc"],
]);

const ATTRIBUTE_SQUADRON_SIZE = 2215;

/**
 * Works out what a type is, for `TypeRecord.kind`. See {@link Kind} for each rule.
 *
 * `categoryId` is the `categoryID` of the type's group, in `groups.jsonl`.
 * `groupId` is the type's `groupID`, in `types.jsonl`.
 * `effectIds` are the `effectID`s in the type's `dogmaEffects`, in `typeDogma.jsonl`.
 *
 * @example
 * sde.kind(7, 55, [16, 12, 34]); // "high", for a 200mm AutoCannon II
 */
export function kind(categoryId: number, groupId: number, effectIds: Iterable<number>): Kind {
  if (groupId === GROUP_SHIP_MODIFIERS) {
    return "mode";
  }
  if (GROUP_CONTAINERS.has(groupId)) {
    return "container";
  }
  if (groupId === GROUP_BOOSTER) {
    return "booster";
  }
  if (CATEGORY_MODULES.has(categoryId)) {
    for (const effectId of effectIds) {
      const slot = SLOT_EFFECTS.get(effectId);
      if (slot !== undefined) {
        return slot;
      }
    }
    return "other";
  }
  return CATEGORY_KINDS.get(categoryId) ?? "other";
}

/**
 * Works out whether a type runs when it is turned on (§6.4), for `TypeRecord.active`.
 *
 * `effects` maps each `effectID` in the type's `dogmaEffects` (in `typeDogma.jsonl`)
 * to that effect's `effectCategoryID` (in `dogmaEffects.jsonl`).
 *
 * A type runs when one of its effects is in category 1 (active) or 2 (target).
 * The SDE puts the `online` effect in category 1 too, but going online is not
 * running, so that one does not count.
 */
export function active(effects: ReadonlyMap<number, number>): boolean {
  for (const [effectId, category] of effects) {
    if (
      effectId !== EFFECT_ONLINE &&
      (category === EFFECT_CATEGORY_ACTIVE || category === EFFECT_CATEGORY_TARGET)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Reads how many fighters make up a full squadron, for `TypeRecord.squadronSize`.
 *
 * `attributes` maps each `attributeID` in the type's `dogmaAttributes`
 * (in `typeDogma.jsonl`) to its `value`. Returns undefined when the type has no
 * `fighterSquadronMaxSize` (2215), which only fighters have.
 */
export function squadronSize(attributes: ReadonlyMap<number, number>): number | undefined {
  const size = attributes.get(ATTRIBUTE_SQUADRON_SIZE);
  return size === undefined ? undefined : Math.trunc(size);
}

/**
 * Finds which hull a tactical mode belongs to, for `Catalog.modes`.
 *
 * The SDE does not link a mode to its hull. Instead, a mode's name starts with
 * its hull's name: "Hecate Sharpshooter Mode" belongs to the Hecate. This tries
 * the longest start of `modeName` first, a whole word at a time.
 *
 * `shipNames` is a {@link nameIndex} of every type in category `Ship` (6).
 * Returns the hull's type ID, or undefined when no ship name matches.
 */
export function modeHull(
  modeName: string,
  shipNames: ReadonlyMap<string, number>,
): number | undefined {
  const words = modeName.split(" ");
  for (let n = words.length - 1; n >= 1; n--) {
    const hull = shipNames.get(fold(words.slice(0, n).join(" ")));
    if (hull !== undefined) {
      return hull;
    }
  }
  return undefined;
}

/**
 * Builds the name store that `Catalog.type` and `Catalog.attribute` look names up in.
 *
 * Give it every type, or every attribute, including unpublished ones. Each name is
 * case-folded with {@link fold}, the same way the library does with the names in a fit.
 * Where names are shared, the published one wins, then the lowest ID (§4.2).
 * In the SDE, a type or attribute without `published` counts as not published.
 *
 * Returns a map from case-folded name to ID.
 *
 * @example
 * const typeNames = sde.nameIndex(
 *   types,
 *   (t) => t._key,
 *   (t) => t.name.en,
 *   (t) => t.published ?? false,
 * );
 * typeNames.get(fold("Rifter")); // 587
 */
export function nameIndex<T>(
  entries: Iterable<T>,
  id: (entry: T) => number,
  name: (entry: T) => string,
  published: (entry: T) => boolean,
): Map<string, number> {
  const sorted = [...entries]
    .map((entry) => ({ id: id(entry), name: name(entry), published: published(entry) }))
    .sort((a, b) => Number(b.published) - Number(a.published) || a.id - b.id);
  const index = new Map<string, number>();
  for (const entry of sorted) {
    const folded = fold(entry.name);
    if (!index.has(folded)) {
      index.set(folded, entry.id);
    }
  }
  return index;
}
