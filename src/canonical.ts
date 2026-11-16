// Canonical form (SPEC §8).

import {
  attributeOf,
  fullLoad,
  modesOf,
  mutaplasmidsOf,
  type AttributeRecord,
  type Catalog,
  type MutaplasmidRecord,
  type TypeRecord,
} from "./catalog.ts";
import { EsfRuleError } from "./errors.ts";
import { compact, type Entry, type EsfFit, type Location, type Rack, type State } from "./model.ts";
import { compareCodePoints, fold, shortestUnique } from "./names.ts";
import { formatNumber } from "./number.ts";
import {
  defaultPlace,
  isPlugged,
  modeName,
  PLUGGED,
  type Fit,
  type Item,
  type Place,
  type Run,
} from "./resolve.ts";
import { HOLDS, RACKS, SIGILS, UINT32_MAX, isCount, isRack, isStored, isTypeId } from "./text.ts";

const GROUPS: readonly Place[] = [
  ...RACKS.filter((rack) => rack !== "tube"),
  "drones",
  "tube",
  "cargo",
  ...HOLDS,
  ...PLUGGED,
];

export interface CanonLine {
  type: TypeRecord | undefined;
  typeText: string;
  count: number | undefined;
  fitName: string | undefined;
  charge: TypeRecord | undefined;
  chargeCount: number | undefined;
  chargeText: string | undefined;
  mutaplasmid: MutaplasmidRecord | undefined;
  mutaplasmidName: string | undefined;
  overrides: [AttributeRecord, number][];
  state: State | undefined;
  location: Location | undefined;
}

export interface CanonFit {
  hull: TypeRecord | undefined;
  hullText: string;
  name: string | undefined;
  mode: TypeRecord | undefined;
  modeText: string | undefined;
  groups: CanonLine[][];
}

export function quote(s: string): string {
  return `"${s.replaceAll('"', '""')}"`;
}

export function needsQuotes(name: string): boolean {
  const words = name.split(" ");
  return (
    name.startsWith("-") ||
    name.startsWith("%") ||
    isCount(words[0] as string) ||
    isTypeId(name) ||
    words.some((word) => word === "" || SIGILS.includes(word.charAt(0)))
  );
}

export function quoteType(name: string): string {
  return needsQuotes(name) ? quote(name) : name;
}

/** A type as text: its name, or its ID where the name resolves to another type (SPEC §6.13). */
export function typeRef(catalog: Catalog, type: TypeRecord): string {
  return catalog.type(fold(type.name))?.id === type.id
    ? quoteType(type.name)
    : `#${String(type.id)}`;
}

function canonLine(type: TypeRecord | undefined, typeText = "-"): CanonLine {
  return {
    type,
    typeText,
    count: undefined,
    fitName: undefined,
    charge: undefined,
    chargeCount: undefined,
    chargeText: undefined,
    mutaplasmid: undefined,
    mutaplasmidName: undefined,
    overrides: [],
    state: undefined,
    location: undefined,
  };
}

function body(line: CanonLine): string {
  const parts = [line.typeText];
  if (line.fitName !== undefined) {
    parts.push(quote(line.fitName));
  }
  if (line.chargeText !== undefined) {
    const count = line.chargeCount === undefined ? "" : `${String(line.chargeCount)}x `;
    parts.push(`:${count}${line.chargeText}`);
  }
  if (line.mutaplasmidName !== undefined) {
    parts.push(`+${quoteType(line.mutaplasmidName)}`);
  }
  if (line.overrides.length > 0) {
    const pairs = line.overrides.map(([a, v]) => `${a.name} ${formatNumber(v)}`);
    parts.push(`{${pairs.join(", ")}}`);
  }
  if (line.state !== undefined) {
    parts.push(`!${line.state}`);
  }
  if (line.location !== undefined) {
    parts.push(`@${line.location}`);
  }
  return parts.join(" ");
}

function lineText(line: CanonLine): string {
  return line.count === undefined ? body(line) : `${String(line.count)}x ${body(line)}`;
}

function fitText(fit: CanonFit): string {
  const hull = [fit.hullText];
  if (fit.name !== undefined) {
    hull.push(quote(fit.name));
  }
  if (fit.modeText !== undefined) {
    hull.push(`/${quoteType(fit.modeText)}`);
  }
  const out = ["%esf/1\n", hull.join(" "), "\n"];
  for (const group of fit.groups) {
    out.push("\n");
    for (const line of group) {
      out.push(lineText(line), "\n");
    }
  }
  return out.join("");
}

/** The state an item has when its line names none; undefined is active. */
function defaultState(item: Item): State | undefined {
  return isPlugged(item.place) || !item.type.active ? "on" : undefined;
}

function without(names: readonly string[], name: string): string[] {
  const at = names.indexOf(name);
  return names.filter((_, i) => i !== at);
}

function compareOverrides([a]: [AttributeRecord, number], [b]: [AttributeRecord, number]): number {
  return compareCodePoints(fold(a.name), fold(b.name)) || compareCodePoints(a.name, b.name);
}

function line(item: Item, fit: Fit, catalog: Catalog): CanonLine {
  const source = item.line;
  const out = canonLine(item.type, typeRef(catalog, item.type));

  out.fitName = item.reference?.block.fitName;

  if (item.charge !== undefined) {
    out.charge = item.charge;
    out.chargeText = typeRef(catalog, item.charge);
    const count = source.chargeCount;
    if (count !== undefined && BigInt(count) !== fullLoad(item.type, item.charge)) {
      out.chargeCount = count;
    }
  }

  const overrides = new Map<number, [AttributeRecord, number]>();
  for (const [attribute, value] of item.overrides) {
    overrides.set(attribute.id, [attribute, value || 0]);
  }
  if (item.mutaplasmid !== undefined) {
    out.mutaplasmid = item.mutaplasmid;
    const own = item.mutaplasmid.type.name;
    const others = mutaplasmidsOf(catalog, item.type).map((m) => m.type.name);
    out.mutaplasmidName = shortestUnique(own, without(others, own));
    for (const [attributeId, base] of item.mutaplasmid.rolls) {
      if (!overrides.has(attributeId)) {
        overrides.set(attributeId, [attributeOf(catalog, attributeId), base]);
      }
    }
  }
  out.overrides = [...overrides.values()].sort(compareOverrides);

  if (source.state !== undefined && source.state !== defaultState(item)) {
    out.state = source.state;
  }

  if (item.place !== defaultPlace(item.type.kind, fit.cargoOnly) && isStored(item.place)) {
    out.location = item.place;
  }
  return out;
}

interface Collapsible {
  repeatable: boolean;
  line: CanonLine;
}

/** Merge adjacent identical repeatable lines into one count. */
function collapse(lines: readonly Collapsible[]): CanonLine[] {
  const out: Collapsible[] = [];
  let previousBody = "";
  for (const entry of lines) {
    const prev = out.at(-1);
    const text = entry.repeatable ? body(entry.line) : "";
    if (prev?.repeatable === true && entry.repeatable && previousBody === text) {
      const count = (prev.line.count as number) + (entry.line.count as number);
      if (count > UINT32_MAX) {
        throw new EsfRuleError(
          `lines collapse into a count of ${String(count)}, which is too large`,
        );
      }
      prev.line.count = count;
      continue;
    }
    out.push(entry);
    previousBody = text;
  }
  return out.map(({ repeatable, line }) => {
    if (repeatable && line.count === 1) {
      line.count = undefined;
    }
    return line;
  });
}

function occupied(fit: Fit, rack: Rack): Run[] {
  const runs = fit.racks.get(rack) ?? [];
  let end = runs.length;
  while (end > 0 && runs[end - 1]?.item === undefined) {
    end--;
  }
  return runs.slice(0, end);
}

function rack(fit: Fit, rack: Rack, catalog: Catalog): CanonLine[] {
  return collapse(
    occupied(fit, rack).map((run) => {
      const out = run.item === undefined ? canonLine(undefined) : line(run.item, fit, catalog);
      if (run.item === undefined) {
        out.location = rack;
      }
      out.count = run.length;
      return { repeatable: true, line: out };
    }),
  );
}

interface Sortable extends Collapsible {
  name: string;
  text: string;
}

function compareSortable(a: Sortable, b: Sortable): number {
  return compareCodePoints(a.name, b.name) || compareCodePoints(a.text, b.text);
}

function sorted(items: readonly Item[], fit: Fit, catalog: Catalog): CanonLine[] {
  const lines = items.map((item): Sortable => {
    const out = line(item, fit, catalog);
    const repeatable = !isStored(item.place);
    const count = item.line.count ?? 1;
    out.count = repeatable || count !== 1 ? count : undefined;
    const text = repeatable ? body(out) : lineText(out);
    return { name: fold(item.type.name), text, repeatable, line: out };
  });
  return collapse(lines.sort(compareSortable));
}

function fighters(items: readonly Item[], fit: Fit, catalog: Catalog): CanonLine[] {
  const tubes = collapse(
    occupied(fit, "tube").map((run) => {
      if (run.item === undefined) {
        const out = canonLine(undefined);
        out.location = "tube";
        out.count = run.length;
        return { repeatable: true, line: out };
      }
      const out = line(run.item, fit, catalog);
      const count = run.item.line.count;
      if (count !== undefined && count !== run.item.type.squadronSize) {
        out.count = count;
      }
      return { repeatable: false, line: out };
    }),
  );
  return [
    ...tubes,
    ...sorted(
      items.filter((item) => item.place === "bay"),
      fit,
      catalog,
    ),
  ];
}

function drones(items: readonly Item[], fit: Fit, catalog: Catalog): CanonLine[] {
  return [
    ...sorted(
      items.filter((item) => item.place === "drones"),
      fit,
      catalog,
    ),
    ...sorted(
      items.filter((item) => item.place === "bay"),
      fit,
      catalog,
    ),
  ];
}

export function canonicalFit(fit: Fit, catalog: Catalog): CanonFit {
  const groups = new Map<Place, Item[]>();
  for (const item of fit.items) {
    if (item.kind === "empty" || isRack(item.place)) {
      continue;
    }
    const group = item.place === "bay" ? defaultPlace(item.type.kind, false) : item.place;
    const list = groups.get(group);
    if (list === undefined) {
      groups.set(group, [item]);
    } else {
      list.push(item);
    }
  }

  const chunks: CanonLine[][] = [];
  for (const group of GROUPS) {
    const items = groups.get(group) ?? [];
    let chunk: CanonLine[];
    if (group === "tube") {
      chunk = fighters(items, fit, catalog);
    } else if (isRack(group)) {
      chunk = rack(fit, group, catalog);
    } else if (group === "drones") {
      chunk = drones(items, fit, catalog);
    } else {
      chunk = sorted(items, fit, catalog);
    }
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
  }

  let modeText: string | undefined;
  const { hull, mode } = fit;
  if (hull !== undefined && mode !== undefined) {
    const own = modeName(hull, mode);
    const others = modesOf(catalog, hull).map((m) => modeName(hull, m));
    modeText = shortestUnique(own, without(others, own));
  }

  const hullText = hull === undefined ? "-" : typeRef(catalog, hull);
  return { hull, hullText, name: fit.block.fitName, mode, modeText, groups: chunks };
}

export function render(fits: readonly CanonFit[]): string {
  return fits.map(fitText).join("\n");
}

export function lines(fit: CanonFit): CanonLine[] {
  return fit.groups.flat();
}

export function toEntry(line: CanonLine): Entry {
  return compact<Entry>({
    type: line.type?.id,
    count: line.count,
    fitName: line.fitName,
    charge: line.charge?.id,
    chargeCount: line.chargeCount,
    mutaplasmid: line.mutaplasmid?.type.id,
    overrides:
      line.overrides.length > 0
        ? Object.fromEntries(line.overrides.map(([a, v]) => [a.id, v]))
        : undefined,
    state: line.state,
    location: line.location,
  });
}

export function toModel(fit: CanonFit): EsfFit {
  return compact<EsfFit>({
    hull: fit.hull?.id,
    name: fit.name,
    mode: fit.mode?.id,
    entries: lines(fit).map(toEntry),
  });
}
