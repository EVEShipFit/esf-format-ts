// What esf/1 needs to know about types and attributes (SPEC §5, §6).

import { decimal } from "./number.ts";

/** What a type is (§5). */
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

export interface TypeRecord {
  readonly id: number;
  readonly name: string;
  readonly kind: Kind;
  readonly active: boolean;
  readonly capacity: number;
  readonly volume: number;
  readonly squadronSize?: number;
}

export interface AttributeRecord {
  readonly id: number;
  readonly name: string;
}

export interface MutaplasmidRecord {
  readonly type: TypeRecord;
  readonly rolls: readonly (readonly [attributeId: number, baseValue: number])[];
}

/** Types and attributes, by folded name (§6.10) or by ID. */
export interface Catalog {
  type(folded: string): TypeRecord | undefined;
  typeById(typeId: number): TypeRecord | undefined;
  attribute(folded: string): AttributeRecord | undefined;
  attributeById(attributeId: number): AttributeRecord | undefined;
  modes?(hullId: number): readonly TypeRecord[];
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
