// What esf/1 needs to know about types and attributes (SPEC §5, §6).

import { decimal } from "./number.ts";

/**
 * What a type is, which decides where it goes in a fit (esf/1 spec §5).
 *
 * Check the group rules first (`"mode"`, `"container"`, `"booster"`), then the category rules.
 * `sde.kind` works this out from the SDE for you.
 *
 * - `"hull"`: a ship or a structure. SDE category `Ship` (6) or `Structure` (65).
 * - `"container"`: a container that can carry another fit, like a Small Secure Container.
 *   SDE group `Cargo Container` (12), `Secure Cargo Container` (340),
 *   `Audit Log Secure Container` (448) or `Freight Container` (649).
 * - `"mode"`: a tactical mode, like the Hecate's Sharpshooter Mode. SDE group `Ship Modifiers` (1306).
 * - `"sub"`: a subsystem, like on a Tengu. SDE category `Subsystem` (32).
 * - `"high"`: a high slot module, like a gun. SDE category `Module` (7) or `Structure Module` (66),
 *   with effect `hiPower` (12).
 * - `"mid"`: a mid slot module, like a shield extender. Category `Module` or `Structure Module`,
 *   with effect `medPower` (13).
 * - `"low"`: a low slot module, like a damage control. Category `Module` or `Structure Module`,
 *   with effect `loPower` (11).
 * - `"rig"`: a rig. Category `Module` or `Structure Module`, with effect `rigSlot` (2663).
 * - `"svc"`: a structure service module. Category `Module` or `Structure Module`,
 *   with effect `serviceSlot` (6306).
 * - `"drone"`: a drone. SDE category `Drone` (18).
 * - `"fighter"`: a fighter. SDE category `Fighter` (87).
 * - `"charge"`: ammunition, a script or anything else loaded into a module. SDE category `Charge` (8).
 * - `"implant"`: an implant. SDE category `Implant` (20), except the boosters in it.
 * - `"booster"`: a booster, also called a drug. SDE group `Booster` (303), inside category `Implant`.
 * - `"other"`: anything else, like ore or a module without a slot. It goes in the cargo.
 */
export type Kind =
  | "hull"
  | "container"
  | "mode"
  | "sub"
  | "high"
  | "mid"
  | "low"
  | "rig"
  | "svc"
  | "drone"
  | "fighter"
  | "charge"
  | "implant"
  | "booster"
  | "other";

/**
 * One type, like "Rifter" or "200mm AutoCannon II", as the library needs it.
 *
 * With the SDE, most fields come from `types.jsonl`. `kind`, `active` and `squadronSize`
 * also need `groups.jsonl`, `typeDogma.jsonl` and `dogmaEffects.jsonl`, through the helpers in `sde`.
 * Include every type in `types.jsonl`. A type with no row in `typeDogma.jsonl` has no effects
 * and no attributes: give the helpers an empty list or map.
 */
export interface TypeRecord {
  /** The type ID, like 587 for the Rifter. In the SDE this is `_key`. */
  readonly id: number;
  /** The English name, like "Rifter". In the SDE this is `name.en`. */
  readonly name: string;
  /** What it is, which decides where it goes in a fit. Use `sde.kind` to work this out. */
  readonly kind: Kind;
  /**
   * Whether the type runs when it is turned on, like a gun or a shield booster.
   *
   * A plate or a damage control only goes online, so it is false.
   * Use `sde.active` to work this out from the type's effects.
   */
  readonly active: boolean;
  /**
   * How much the type holds, in m³; for a module, how much ammunition fits in it.
   *
   * In the SDE this is `capacity`. Use 0 when the type has none.
   */
  readonly capacity: number;
  /** How much room one of it takes, in m³. In the SDE this is `volume`. Use 0 when the type has none. */
  readonly volume: number;
  /**
   * For a fighter, how many make up a full squadron. Leave it out, or undefined, for anything else.
   *
   * In the SDE this is the attribute `fighterSquadronMaxSize`; `sde.squadronSize` reads it for you.
   */
  readonly squadronSize?: number | undefined;
}

/**
 * One dogma attribute, like "speedFactor", as the library needs it.
 *
 * With the SDE, both fields come from `dogmaAttributes.jsonl`.
 */
export interface AttributeRecord {
  /** The attribute ID, like 20 for speedFactor. In the SDE this is `_key`. */
  readonly id: number;
  /** The name, like "speedFactor". In the SDE this is `name`; it is not translated. */
  readonly name: string;
}

/**
 * One mutaplasmid that can be applied to a base type, like "Unstable 5MN Microwarpdrive Mutaplasmid".
 *
 * With the SDE, these come from `dynamicItemAttributes.jsonl`. Each entry there is one mutaplasmid.
 * Its `inputOutputMapping` is a list; the base types it applies to are all the `applicableTypes`
 * across that list.
 */
export interface MutaplasmidRecord {
  /** The mutaplasmid's own type: the type whose ID is the entry's `_key`. */
  readonly type: TypeRecord;
  /**
   * The attributes the mutaplasmid changes, each as an attribute ID with the base type's
   * value before the change, in any order.
   *
   * The attribute IDs are the `_key` of each item in the entry's `attributeIDs`; its `min` and
   * `max` are not needed. Each value is the base type's value of that attribute in
   * `typeDogma.jsonl`. When the base type does not have it, use the attribute's `defaultValue`
   * in `dogmaAttributes.jsonl`, or 0 when that is missing too.
   */
  readonly rolls: readonly (readonly [attributeId: number, baseValue: number])[];
}

/**
 * Where the library looks up game data. You write this, on top of your copy of the SDE.
 *
 * The library holds no game data itself. Whenever it meets a name or an ID in a fit,
 * it asks the catalog what that is. `sde` has helpers for the parts that take more
 * than a lookup.
 *
 * The `§` numbers point to sections of the esf/1 spec:
 * https://github.com/EVEShipFit/esf-format/blob/main/SPEC.md
 */
export interface Catalog {
  /**
   * Finds a type by its name.
   *
   * The name comes from a fit, so a user may have typed it in any case.
   * The library already case-folded it with `fold`, so "Rifter", "RIFTER"
   * and "rifter" all reach you as "rifter". Case folding is like lowercase, but
   * gives the same result in every language, so use `fold`, not `toLowerCase()`.
   * Store your type names the same way, by calling `fold` on each one,
   * and look this name up in that store.
   *
   * Include unpublished types too. Some names belong to more than one type.
   * Then return the published one; if that is still more than one, the lowest ID.
   * `sde.nameIndex` builds this store for you.
   *
   * Return undefined if no type has this name.
   */
  type(foldedName: string): TypeRecord | undefined;

  /** Finds a type by its ID. Return undefined if there is no type with this ID. */
  typeById(typeId: number): TypeRecord | undefined;

  /**
   * Finds an attribute by its name, like "speedfactor".
   *
   * Used to read attribute overrides, like the rolls on an abyssal module.
   *
   * This works the same way as `type`: the name is already case-folded with `fold`,
   * unpublished attributes count too, and where names are shared, the published one
   * wins, then the lowest ID. `sde.nameIndex` builds this store for you.
   *
   * Return undefined if no attribute has this name.
   */
  attribute(foldedName: string): AttributeRecord | undefined;

  /**
   * Finds an attribute by its ID.
   *
   * Used to write attribute overrides, like the rolls on an abyssal module.
   *
   * Return undefined if there is no attribute with this ID.
   */
  attributeById(attributeId: number): AttributeRecord | undefined;

  /**
   * The tactical modes a hull can be in, like the Hecate's Defense, Propulsion and Sharpshooter Mode.
   *
   * Return an empty list for a hull without tactical modes. In the SDE, modes are the types
   * of kind `"mode"`; `sde.modeHull` tells you which hull each one belongs to.
   *
   * Leave this out and no hull has tactical modes.
   */
  modes?(hullId: number): readonly TypeRecord[];

  /**
   * The mutaplasmids that can be applied to a type. See {@link MutaplasmidRecord} for where they come from.
   *
   * Return an empty list for a type no mutaplasmid applies to.
   *
   * Leave this out and no type has mutaplasmids.
   */
  mutaplasmids?(typeId: number): readonly MutaplasmidRecord[];
}

export function modesOf(catalog: Catalog, hull: TypeRecord): readonly TypeRecord[] {
  return catalog.modes?.(hull.id) ?? [];
}

export function mutaplasmidsOf(catalog: Catalog, base: TypeRecord): readonly MutaplasmidRecord[] {
  return catalog.mutaplasmids?.(base.id) ?? [];
}

export function attributeOf(catalog: Catalog, attributeId: number): AttributeRecord {
  const attribute = catalog.attributeById(attributeId);
  if (attribute === undefined) {
    throw new Error(`the catalog has no attribute ${String(attributeId)}`);
  }
  return attribute;
}

/** How many charges fit in an item (§6.5). */
export function fullLoad(item: TypeRecord, charge: TypeRecord): bigint | undefined {
  if (item.capacity <= 0 || charge.volume <= 0) {
    return undefined;
  }
  const [capacity, capacityExponent] = decimal(item.capacity);
  const [volume, volumeExponent] = decimal(charge.volume);
  const shift = capacityExponent - volumeExponent;
  return shift >= 0
    ? (capacity * 10n ** BigInt(shift)) / volume
    : capacity / (volume * 10n ** BigInt(-shift));
}
