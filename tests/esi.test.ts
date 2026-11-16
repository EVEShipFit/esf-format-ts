import { expect, test } from "vitest";
import { esi, type Location } from "../src/index.ts";

test.each<[string, Location, number]>([
  ["HiSlot0", "high", 1],
  ["MedSlot7", "mid", 8],
  ["LoSlot2", "low", 3],
  ["RigSlot1", "rig", 2],
  ["SubSystemSlot3", "sub", 4],
  ["ServiceSlot5", "svc", 6],
  ["FighterTube4", "tube", 5],
])("slot %s", (flag, location, slot) => {
  expect(esi.location(flag)).toBe(location);
  expect(esi.slot(flag)).toBe(slot);
});

test.each<[string, Location]>([
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
])("hold %s", (flag, location) => {
  expect(esi.location(flag)).toBe(location);
  expect(esi.slot(flag)).toBeUndefined();
});

test.each([
  "Hangar",
  "AutoFit",
  "HiSlot8",
  "FighterTube5",
  "hislot0",
  "HiSlot01",
  "HiSlot0\n",
  "toString",
  "",
])("unknown %j", (flag) => {
  expect(esi.location(flag)).toBeUndefined();
  expect(esi.slot(flag)).toBeUndefined();
});
