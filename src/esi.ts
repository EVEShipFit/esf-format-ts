// Helpers to read an ESI location flag.

import type { Location, Rack } from "./model.ts";

const RACKS: readonly (readonly [string, Rack, number])[] = [
  ["HiSlot", "high", 8],
  ["MedSlot", "mid", 8],
  ["LoSlot", "low", 8],
  ["RigSlot", "rig", 8],
  ["SubSystemSlot", "sub", 8],
  ["ServiceSlot", "svc", 8],
  ["FighterTube", "tube", 5],
];

const SLOTS = new Map<string, readonly [Rack, number]>(
  RACKS.flatMap(([prefix, rack, size]) =>
    Array.from({ length: size }, (_, i) => [`${prefix}${String(i)}`, [rack, i + 1]] as const),
  ),
);

const HOLDS = new Map<string, Location>([
  ["Cargo", "cargo"],
  ["DroneBay", "bay"],
  ["FighterBay", "bay"],
  ["SpecializedAmmoHold", "ammo"],
  ["BoosterBay", "booster"],
  ["SpecializedCommandCenterHold", "command"],
  ["CorpseBay", "corpse"],
  ["MobileDepotHold", "depot"],
  ["ExpeditionHold", "expedition"],
  ["FleetHangar", "fleet"],
  ["FrigateEscapeBay", "frigate"],
  ["SpecializedFuelBay", "fuel"],
  ["SpecializedGasHold", "gas"],
  ["SpecializedIceHold", "ice"],
  ["InfrastructureHangar", "infrastructure"],
  ["ShipHangar", "maintenance"],
  ["SpecializedMineralHold", "mineral"],
  ["SpecializedOreHold", "mining"],
  ["MoonMaterialBay", "moon"],
  ["SpecializedPlanetaryCommoditiesHold", "planetary"],
  ["QuafeBay", "quafe"],
  ["SubSystemBay", "subsystem"],
]);

/**
 * Gives the {@link Location} for an ESI `location_flag`.
 *
 * A slot flag gives its rack: `HiSlot2` gives `"high"`, and `FighterTube0` gives `"tube"`.
 * `DroneBay` and `FighterBay` give `"bay"`. In a fitting from ESI, `DroneBay` also holds the
 * drones that are out in space. Leave the entry's `location` out for those.
 *
 * Returns `undefined` for a flag that is not inside a ship, like `Hangar`.
 */
export function location(flag: string): Location | undefined {
  return SLOTS.get(flag)?.[0] ?? HOLDS.get(flag);
}

/**
 * Gives the entry's `slot` for an ESI `location_flag`, counting from 1.
 *
 * ESI counts slots from 0, so `HiSlot2` is slot 3, and `FighterTube0` is tube 1.
 * Returns `undefined` for a flag that is not a slot, like `Cargo` or `Hangar`.
 */
export function slot(flag: string): number | undefined {
  return SLOTS.get(flag)?.[1];
}
