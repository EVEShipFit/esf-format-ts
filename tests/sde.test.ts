import { expect, test } from "vitest";
import { sde, type Kind } from "../src/index.ts";

test.each<[string, number, number, number[], Kind]>([
  ["Rifter", 6, 25, [5779], "hull"],
  ["Astrahus", 65, 1657, [6565], "hull"],
  ["Small Secure Container", 2, 340, [649], "container"],
  ["Hecate Sharpshooter Mode", 7, 1306, [6010], "mode"],
  ["Tengu Defensive - Covert Reconfiguration", 32, 954, [896], "sub"],
  ["200mm AutoCannon II", 7, 55, [16, 12, 34], "high"],
  ["Medium Shield Extender II", 7, 38, [13, 16], "mid"],
  ["Damage Control II", 7, 60, [11, 16], "low"],
  ["Standup Ballistic Control System I", 66, 1429, [11, 16], "low"],
  ["Small Core Defense Field Extender I", 7, 774, [446, 2663], "rig"],
  ["Standup Cloning Center I", 66, 1321, [16, 6306], "svc"],
  ["module without a slot", 7, 1, [16], "other"],
  ["Hobgoblin II", 18, 100, [10], "drone"],
  ["Templar II", 87, 1652, [6431], "fighter"],
  ["Republic Fleet EMP S", 8, 83, [596], "charge"],
  ["Genolution Core Augmentation CA-1", 20, 1730, [302], "implant"],
  ["Strong Blue Pill Booster", 20, 303, [2737], "booster"],
  ["Veldspar", 25, 462, [], "other"],
])("kind of %s", (_, categoryId, groupId, effectIds, expected) => {
  expect(sde.kind(categoryId, groupId, effectIds)).toBe(expected);
});

test("active needs an active or target effect", () => {
  expect(sde.active(new Map())).toBe(false);
  expect(
    sde.active(
      new Map([
        [16, 1],
        [2302, 0],
      ]),
    ),
  ).toBe(false);
  expect(
    sde.active(
      new Map([
        [16, 1],
        [4, 1],
      ]),
    ),
  ).toBe(true);
  expect(
    sde.active(
      new Map([
        [16, 1],
        [3174, 2],
      ]),
    ),
  ).toBe(true);
});

test("squadronSize", () => {
  expect(
    sde.squadronSize(
      new Map([
        [9, 100],
        [2215, 6],
      ]),
    ),
  ).toBe(6);
  expect(sde.squadronSize(new Map([[9, 240]]))).toBeUndefined();
});

test("modeHull matches the longest ship name", () => {
  const ships = new Map([
    ["hecate", 35683],
    ["hecate navy", 1],
  ]);
  expect(sde.modeHull("Hecate Sharpshooter Mode", ships)).toBe(35683);
  expect(sde.modeHull("Hecate Navy Defense Mode", ships)).toBe(1);
  expect(sde.modeHull("Hecate", ships)).toBeUndefined();
  expect(sde.modeHull("Rifter Defense Mode", ships)).toBeUndefined();
});

test("nameIndex folds names and picks published, then the lowest ID", () => {
  const named = [
    { id: 50097, name: "Avatar", published: false },
    { id: 11567, name: "Avatar", published: true },
    { id: 30, name: "Twin", published: false },
    { id: 20, name: "Twin", published: false },
    { id: 587, name: "Rifter", published: true },
  ];
  const index = sde.nameIndex(
    named,
    (n) => n.id,
    (n) => n.name,
    (n) => n.published,
  );
  expect(index).toStrictEqual(
    new Map([
      ["avatar", 11567],
      ["rifter", 587],
      ["twin", 20],
    ]),
  );
});
