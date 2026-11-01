import { expect, test } from "vitest";
import { load, saveBinary } from "../src/index.ts";
import { needsQuotes } from "../src/canonical.ts";
import { compareCodePoints, shortestUnique } from "../src/names.ts";
import { repr } from "../src/text.ts";
import { decimal, formatNumber } from "../src/number.ts";
import { fullLoad, type TypeRecord } from "../src/catalog.ts";
import { catalog } from "./fixture.ts";

test.each<[number, string]>([
  [1e22, "10000000000000000000000"],
  [1.5e-7, "0.00000015"],
  [-0, "0"],
  [0.1, "0.1"],
  [2 ** -24, "0.00000005960464477539063"],
  [0.3, "0.3"],
  [123.456, "123.456"],
  [-2.5, "-2.5"],
  [100, "100"],
  [9007199254740992, "9007199254740992"],
  [5e-324, `0.${"0".repeat(323)}5`],
  [1.7976931348623157e308, `17976931348623157${"0".repeat(292)}`],
])("formatNumber(%d) is %s", (value, text) => {
  expect(formatNumber(value)).toBe(text);
});

test.each<[number, [bigint, number]]>([
  [0.0125, [125n, -4]],
  [400, [4n, 2]],
  [1e300, [1n, 300]],
])("decimal(%d)", (value, expected) => {
  expect(decimal(value)).toStrictEqual(expected);
});

function holder(capacity: number, volume: number): [TypeRecord, TypeRecord] {
  const type = { id: 1, name: "x", kind: "high", active: true, capacity, volume } as const;
  return [type, { ...type, kind: "charge" }];
}

test.each<[number, number, bigint | undefined]>([
  [0.3, 0.1, 3n],
  [10, 0.1, 100n],
  [400, 0.0125, 32000n],
  [1, 3, 0n],
  [1, 2 ** -24, 16777215n],
  [0.5, 5, 0n],
  [1000, 1e5, 0n],
  [0, 1, undefined],
  [1, 0, undefined],
])("fullLoad(%d, %d) is %s", (capacity, volume, expected) => {
  const [item, charge] = holder(capacity, volume);
  expect(fullLoad(item, charge)).toBe(expected);
});

test("repr", () => {
  expect(repr("a")).toBe("'a'");
  expect(repr("it's")).toBe(`"it's"`);
  expect(repr(`it's "x"`)).toBe(`'it\\'s "x"'`);
});

test("needsQuotes", () => {
  expect(needsQuotes("Damage Control II")).toBe(false);
  expect(needsQuotes("")).toBe(true);
  expect(needsQuotes("-x")).toBe(true);
  expect(needsQuotes("%x")).toBe(true);
  expect(needsQuotes("3x Damage Control")).toBe(true);
  expect(needsQuotes("Damage  Control")).toBe(true);
  expect(needsQuotes("Damage @Control")).toBe(true);
});

test("shortestUnique", () => {
  expect(shortestUnique("Decayed Damage Control", ["Gravid Damage Control"])).toBe("Decayed");
  expect(shortestUnique("A B", ["A B C"])).toBe("A B");
});

test("compareCodePoints sorts like UTF-8", () => {
  expect(compareCodePoints("\u{1f600}", "\ue000")).toBeGreaterThan(0);
  expect(compareCodePoints("\ue000", "\u{1f600}")).toBeLessThan(0);
  const words = ["\u{1f600}", "￿", "b", "a", "ab", ""];
  expect(words.sort(compareCodePoints)).toStrictEqual(["a", "ab", "b", "", "￿", "\u{1f600}"]);
});

type Bytes = number | readonly number[] | Uint8Array;

function bytes(...parts: Bytes[]): Uint8Array {
  return new Uint8Array(parts.flatMap((part) => (typeof part === "number" ? [part] : [...part])));
}

function varint(value: number): number[] {
  const out = [];
  for (; value > 0x7f; value = Math.floor(value / 0x80)) {
    out.push((value % 0x80) | 0x80);
  }
  return [...out, value];
}

function uint(field: number, value: number): number[] {
  return [...varint(field * 8), ...varint(value)];
}

function record(field: number, ...payload: Bytes[]): number[] {
  const content = bytes(...payload);
  return [...varint(field * 8 + 2), ...varint(content.length), ...content];
}

function double(field: number, value: number): number[] {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setFloat64(0, value, true);
  return [...varint(field * 8 + 1), ...out];
}

const zeros = (n: number) => Array<number>(n).fill(0);

function fitOf(...fields: Bytes[]): Uint8Array {
  return bytes(record(1, uint(1, 1), ...fields));
}

function entryOf(...fields: Bytes[]): Uint8Array {
  return fitOf(uint(2, 587), record(5, ...fields));
}

const rifter = () => saveBinary(load("%esf/1\nRifter\n", catalog), catalog);

test.each<[string, Uint8Array, string]>([
  ["key cut short", bytes(0x0a), "cut short"],
  ["varint cut short", bytes(0x0a, 0x80), "cut short"],
  ["varint too long", bytes(0x10, Array<number>(10).fill(0xff), 0x01), "varint is too long"],
  ["key too large", bytes(0x80, 0x80, 0x80, 0x80, 0x80, 0x01), "bad key 34359738368"],
  ["key of field 0", bytes(0x00), "bad key 0"],
  ["key of wire type 6", bytes(0x0e), "bad key 14"],
  ["long varint key", bytes(Array<number>(9).fill(0xff), 0x01), "bad key"],
  ["unmatched end group", bytes(0x14), "unmatched end group"],
  ["group closed by another field", bytes(0x13, 0x1c), "unmatched end group"],
  ["fits as a varint", bytes(uint(1, 1)), "wrong wire type"],
  ["unknown Fit field", fitOf(uint(6, 1)), "Fit has a field that is not in the schema"],
  ["no version", bytes(record(1)), "unsupported Fit.version 0"],
  ["version too large", bytes(record(1, uint(1, 2 ** 32))), "Fit.version is out of range"],
  ["name not UTF-8", fitOf(record(3, 0xff)), "Fit.name is not valid UTF-8"],
  ["name cut short", fitOf(0x1a, 0x05), "cut short"],
  ["unknown Entry field", entryOf(uint(11, 1)), "Entry has a field that is not in the schema"],
  ["unknown State", entryOf(uint(9, 4)), "unknown State value 4"],
  ["unknown Location", entryOf(uint(10, 28)), "unknown Location value 28"],
  ["packed doubles cut short", entryOf(0x42, 0x08, 0x00), "cut short"],
  ["packed doubles of 7 bytes", entryOf(record(8, zeros(7))), "packed doubles cut short"],
  ["overrides of different lengths", entryOf(uint(7, 50)), "different lengths"],
  [
    "attribute overridden twice",
    entryOf(record(7, 50, 50), double(8, 1), double(8, 2)),
    "overridden twice",
  ],
  [
    "attribute out of range",
    entryOf(record(7, varint(2 ** 32)), record(8, zeros(8))),
    "out of range",
  ],
])("binary rejects %s", (_, data, message) => {
  expect(() => load(data, catalog)).toThrow(message);
});

test("binary skips unknown Document fields", () => {
  const unknown = bytes(double(2, 1), [0x15, 0, 0, 0, 0], uint(2, 150), record(3, 0xff), [
    0x13,
    ...uint(1, 1),
    0x23,
    0x24,
    0x14,
  ]);
  expect(load(bytes(unknown, rifter()), catalog)[0]?.hull).toBe(587);
});

test("binary reads unpacked overrides, and later fields win", () => {
  const data = entryOf(
    uint(1, 2048),
    uint(7, 50),
    double(8, 2),
    uint(9, 1),
    uint(9, 0),
    record(3, ..."Loot".split("").map((c) => c.charCodeAt(0))),
    record(3),
    uint(10, 7),
    uint(10, 0),
  );
  expect(load(bytes(data), catalog)).toStrictEqual([
    { hull: 587, entries: [{ type: 2048, overrides: { 50: 2 } }] },
  ]);
});

test("binary masks varints to 64 bits", () => {
  const version = [0x81, ...Array<number>(8).fill(0x80), 0x7e];
  expect(load(bytes(record(1, 0x08, version, uint(2, 587))), catalog)[0]?.hull).toBe(587);
});

test("many fits", () => {
  const text = Array.from(
    { length: 2000 },
    (_, i) => `%esf/1\nRifter "${String(i)}"\nDamage Control II\n`,
  ).join("");
  const fits = load(text, catalog);
  expect(load(saveBinary(fits, catalog), catalog)).toStrictEqual(fits);
});
