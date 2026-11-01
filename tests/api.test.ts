import { describe, expect, test } from "vitest";
import {
  EsfError,
  fold,
  fromBase64url,
  isText,
  load,
  save,
  saveBinary,
  toBase64url,
  type AttributeRecord,
  type Catalog,
  type Entry,
  type EsfFit,
  type Location,
  type MutaplasmidRecord,
  type State,
} from "../src/index.ts";
import type { JsonCatalog } from "./catalog.ts";
import { catalog } from "./fixture.ts";

const RIFTER = 587;
const AUTOCANNON = 2889;
const EMP = 21898;
const SHIELD_EXTENDER = 3831;
const SCRAMBLER = 448;
const DAMAGE_CONTROL = 2048;
const HOBGOBLIN = 2456;
const DECAYED_DAMAGE_CONTROL_MUTAPLASMID = 52224;
const AVATAR = 11567;
const AVATAR_UNPUBLISHED = 50097;
const SMALL_SECURE_CONTAINER = 3467;

function fit(...entries: Entry[]): EsfFit {
  return { hull: RIFTER, entries };
}

function named(name: string, ...entries: Entry[]): EsfFit {
  return { hull: RIFTER, name, entries };
}

function caught(run: () => unknown): EsfError {
  try {
    run();
  } catch (e) {
    if (e instanceof EsfError) {
      return e;
    }
    throw e;
  }
  throw new Error("no error");
}

test("save writes canonical text", () => {
  const rifter = named(
    "Shield Buffer",
    { type: DAMAGE_CONTROL },
    { type: AUTOCANNON, charge: EMP },
    { type: SHIELD_EXTENDER },
    { type: AUTOCANNON, charge: EMP },
    { location: "high" },
    { type: SCRAMBLER, state: "off" },
    { type: HOBGOBLIN, count: 2 },
    { type: EMP, count: 100, location: "cargo" },
  );
  expect(save([rifter], catalog)).toBe(
    "%esf/1\n" +
      'Rifter "Shield Buffer"\n' +
      "\n" +
      "2x 200mm AutoCannon II :Republic Fleet EMP S\n" +
      "\n" +
      "Medium Shield Extender II\n" +
      "Warp Scrambler II !off\n" +
      "\n" +
      "Damage Control II\n" +
      "\n" +
      "2x Hobgoblin II\n" +
      "\n" +
      "100x Republic Fleet EMP S\n",
  );
});

test("load returns canonical fits", () => {
  const rifter = fit({ type: AUTOCANNON }, { type: AUTOCANNON }, { type: EMP, location: "cargo" });
  expect(load(save([rifter], catalog), catalog)).toStrictEqual([
    fit({ type: AUTOCANNON, count: 2 }, { type: EMP }),
  ]);
});

test("load reads bytes", () => {
  const data = new TextEncoder().encode("%esf/1\nRifter\n");
  expect(load(data, catalog)).toStrictEqual([{ hull: RIFTER, entries: [] }]);
});

test("load fills in mutaplasmid rolls", () => {
  const entry: Entry = {
    type: DAMAGE_CONTROL,
    mutaplasmid: DECAYED_DAMAGE_CONTROL_MUTAPLASMID,
    overrides: { 50: 31.5 },
  };
  const [loaded] = load(save([fit(entry)], catalog), catalog);
  expect(loaded?.entries[0]?.overrides).toStrictEqual({
    50: 31.5,
    974: 0.6,
    975: 0.6,
    976: 0.6,
    977: 0.6,
  });
});

test("binary reads back the same", () => {
  const fits: EsfFit[] = [
    fit({ type: SMALL_SECURE_CONTAINER, fitName: "Loot", location: "cargo" }),
    { hull: SMALL_SECURE_CONTAINER, name: "Loot", entries: [{ type: EMP, count: 10 }] },
  ];
  expect(load(saveBinary(fits, catalog), catalog)).toStrictEqual(
    load(save(fits, catalog), catalog),
  );
});

test("binary reads back a full fit", () => {
  const text =
    '%esf/1\nHecate "Kite" /Sharpshooter\n' +
    "Damage Control II +Decayed {hp 2} !off\n" +
    "5x Hobgoblin II @bay\n" +
    "Small Secure Container @cargo\n";
  const fits = load(text, catalog);
  expect(load(saveBinary(fits, catalog), catalog)).toStrictEqual(fits);
});

test.each<[string, EsfFit[], string]>([
  ["no fits", [], "at least one fit"],
  ["empty slot without a rack", [fit({})], "an empty slot must name its rack"],
  ["negative count", [fit({ type: AUTOCANNON, count: -1 })], "at least 1"],
  ["fractional count", [fit({ type: AUTOCANNON, count: 1.5 })], "a whole number"],
  ["count too large", [fit({ type: AUTOCANNON, count: 2 ** 32 })], "too large"],
  ["zero charge count", [fit({ type: AUTOCANNON, charge: EMP, chargeCount: 0 })], "at least 1"],
  ["unknown type", [fit({ type: 999_999_999 })], "unknown item type ID"],
  ["unknown hull", [{ hull: 999_999_999, entries: [] }], "unknown hull type ID"],
  ["unknown charge", [fit({ type: AUTOCANNON, charge: 999_999_999 })], "unknown charge type ID"],
  [
    "unknown attribute",
    [fit({ type: DAMAGE_CONTROL, overrides: { 999_999: 1 } })],
    "unknown attribute ID",
  ],
  ["rack on an item", [fit({ type: AUTOCANNON, location: "high" })], "only for an empty slot"],
  ["charge count alone", [fit({ type: AUTOCANNON, chargeCount: 10 })], "without a charge"],
  ["override NaN", [fit({ type: DAMAGE_CONTROL, overrides: { 50: NaN } })], "not finite"],
  ["override infinite", [fit({ type: DAMAGE_CONTROL, overrides: { 50: Infinity } })], "not finite"],
  ["unknown state", [fit({ type: DAMAGE_CONTROL, state: "broken" as State })], "unknown state"],
  [
    "unknown location",
    [fit({ type: DAMAGE_CONTROL, location: "cargo // x" as Location })],
    "unknown location",
  ],
  [
    "id shadowed",
    [fit({ type: AVATAR_UNPUBLISHED, location: "cargo" })],
    "not what its name resolves to",
  ],
  [
    "attribute id shadowed",
    [fit({ type: DAMAGE_CONTROL, overrides: { "050": 1 } as Record<number, number> })],
    "resolve to",
  ],
  [
    "contains itself",
    [named("Buffer", { type: RIFTER, fitName: "Buffer" })],
    "cannot contain itself",
  ],
  ["name with a newline", [named("Two\nlines")], "CR or LF"],
  ["name not valid Unicode", [named("\ud800")], "not valid UTF-8"],
])("save rejects %s", (_, fits, message) => {
  expect(() => save(fits, catalog)).toThrow(message);
});

test("save errors name the fit and entry", () => {
  const error = caught(() =>
    save([fit(), fit({ type: AUTOCANNON }, { type: 999_999_999 })], catalog),
  );
  expect([error.fit, error.entry, error.line]).toStrictEqual([2, 2, undefined]);
  expect(error.message).toMatch(/^fit 2, entry 2: /);
  expect(error.name).toBe("EsfError");
});

test("save errors name the fit", () => {
  const error = caught(() =>
    save([fit(), { hull: RIFTER, mode: 999_999_999, entries: [] }], catalog),
  );
  expect([error.fit, error.entry]).toStrictEqual([2, undefined]);
  expect(error.message).toMatch(/^fit 2: /);
});

test("load errors name the line", () => {
  const error = caught(() => load("%esf/1\nRifter\nNot A Type\n", catalog));
  expect(error.line).toBe(3);
  expect(error.reason).toBe("unknown type 'Not A Type'");
  expect(error.message).toBe("line 3: unknown type 'Not A Type'");
});

test("an empty name is no name", () => {
  expect(save([named("")], catalog)).toBe("%esf/1\nRifter\n");
});

test("a name of 0 is a name", () => {
  expect(save([named("0")], catalog)).toBe('%esf/1\nRifter "0"\n');
});

test("null is the default", () => {
  const entry = { type: AUTOCANNON, count: null, charge: null } as unknown as Entry;
  expect(save([{ hull: RIFTER, name: null, entries: [entry] } as unknown as EsfFit], catalog)).toBe(
    "%esf/1\nRifter\n\n200mm AutoCannon II\n",
  );
});

test("published wins a shared name", () => {
  expect(save([fit({ type: AVATAR, location: "cargo" })], catalog)).toMatch(/Avatar\n$/);
});

test.each<[string, string | Uint8Array, string]>([
  ["empty", "", "the document is empty"],
  ["lone surrogate", "%esf/1\nRifter\ud800\n", "line 2: not valid UTF-8"],
  [
    "bad UTF-8",
    new Uint8Array([0x25, 0x65, 0x73, 0x66, 0x2f, 0x31, 0x0a, 0xff]),
    "line 2: not valid UTF-8",
  ],
  ["bad UTF-8 on the first line", new Uint8Array([0x25, 0xff, 0x0a]), "line 1: not valid UTF-8"],
  ["binary without fits", "\x10\x01", "at least one fit"],
  [
    "merged count too large",
    "%esf/1\nRifter\n4294967295x Damage Control II\n4294967295x Damage Control II\n",
    "too large",
  ],
])("load rejects %s", (_, data, message) => {
  expect(() => load(data, catalog)).toThrow(message);
});

class MinimalCatalog implements Catalog {
  protected readonly inner: JsonCatalog;
  constructor(inner: JsonCatalog) {
    this.inner = inner;
  }
  type = (folded: string) => this.inner.type(folded);
  typeById = (id: number) => this.inner.typeById(id);
  attribute = (folded: string) => this.inner.attribute(folded);
  attributeById = (id: number): AttributeRecord | undefined => this.inner.attributeById(id);
}

test.each([
  ["mode", "Hecate /Defense", "no tactical modes"],
  ["mutaplasmid", "Rifter\nDamage Control II +Decayed", "no mutaplasmid"],
])("a catalog without %s lookups", (_, line, message) => {
  expect(() => load(`%esf/1\n${line}\n`, new MinimalCatalog(catalog))).toThrow(message);
});

test("a catalog without a roll's attribute", () => {
  class WithoutRollAttributes extends MinimalCatalog {
    override attributeById = () => undefined;
    mutaplasmids = (id: number): MutaplasmidRecord[] => this.inner.mutaplasmids(id);
  }
  const text = "%esf/1\nRifter\nDamage Control II +Decayed\n";
  expect(() => load(text, new WithoutRollAttributes(catalog))).toThrow(
    "the catalog has no attribute",
  );
  expect(() => load(text, new WithoutRollAttributes(catalog))).not.toThrow(EsfError);
});

test("a catalog that throws", () => {
  class Broken extends MinimalCatalog {
    override typeById = (): undefined => {
      throw new RangeError("broken");
    };
  }
  expect(() => save([fit()], new Broken(catalog))).toThrow(RangeError);
});

describe("base64url", () => {
  test("round trip", () => {
    const data = saveBinary([fit({ type: AUTOCANNON })], catalog);
    const url = toBase64url(data);
    expect(url).not.toContain("=");
    expect(fromBase64url(url)).toStrictEqual(data);
  });

  test.each([
    ["", ""],
    ["f", "Zg"],
    ["fo", "Zm8"],
    ["foo", "Zm9v"],
    ["foob", "Zm9vYg"],
    ["\xfb\xff", "-_8"],
  ])("%j is %j", (raw, encoded) => {
    const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    expect(toBase64url(bytes)).toBe(encoded);
    expect(fromBase64url(` ${encoded}\n`)).toStrictEqual(bytes);
  });

  test.each(["not base64url!", "AA==", "AAAAA", "AAé"])("rejects %j", (encoded) => {
    expect(() => fromBase64url(encoded)).toThrow("not valid base64url");
  });
});

test("isText", () => {
  expect(isText("%esf/1\n")).toBe(true);
  expect(isText(" %esf/1\n")).toBe(true);
  expect(isText(new TextEncoder().encode("%esf/1\n"))).toBe(true);
  expect(isText(new Uint8Array([0x0a, 0x02]))).toBe(false);
  expect(isText("")).toBe(false);
});

test("fold", () => {
  expect(fold("Damage Control II")).toBe("damage control ii");
  expect(fold("ÄRGER Σς")).toBe("ärger σσ");
  expect(fold("ẞ ß İ")).toBe("ß ß İ");
  expect(fold("µſ ᏸ ꭰ Ꭰ")).toBe("μs Ᏸ Ꭰ Ꭰ");
});

test("pinned slots leave the rest in order", () => {
  const text =
    "%esf/1\nRifter\n" +
    "Damage Control II @low3\n" +
    "Gyrostabilizer II @low1\n" +
    "2x Overdrive Injector System II\n";
  expect(save(load(text, catalog), catalog)).toBe(
    "%esf/1\nRifter\n\n" +
      "Gyrostabilizer II\n" +
      "Overdrive Injector System II\n" +
      "Damage Control II\n" +
      "Overdrive Injector System II\n",
  );
});

test("a catalog with attribute names that fold the same", () => {
  class Shouting extends MinimalCatalog {
    override attributeById = (id: number): AttributeRecord | undefined =>
      id === 974 ? { id, name: "HP" } : this.inner.attributeById(id);
    mutaplasmids = (id: number): MutaplasmidRecord[] => this.inner.mutaplasmids(id);
  }
  const shouting = new Shouting(catalog);
  const fits = load("%esf/1\nRifter\nDamage Control II +Decayed {hp 2}\n", shouting);
  expect(fits[0]?.entries[0]?.overrides).toMatchObject({ 9: 2, 974: 0.6 });
  expect(() => save(fits, shouting)).toThrow("attribute 'hp' is overridden twice");
});

test("binary inside a larger buffer", () => {
  const data = saveBinary([fit({ type: DAMAGE_CONTROL, overrides: { 50: 2 } })], catalog);
  const buffer = new Uint8Array(data.length + 3);
  buffer.set(data, 3);
  expect(load(buffer.subarray(3), catalog)).toStrictEqual(load(data, catalog));
});
