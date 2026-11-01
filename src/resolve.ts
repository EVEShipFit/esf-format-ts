// Resolving names against the Catalog, and the semantic rules (SPEC §4.2, §5, §6).

import {
  modesOf,
  mutaplasmidsOf,
  type AttributeRecord,
  type Catalog,
  type Kind,
  type MutaplasmidRecord,
  type TypeRecord,
} from "./catalog.ts";
import { EsfError } from "./errors.ts";
import type { Rack } from "./model.ts";
import { fold, isWordPrefix } from "./names.ts";
import {
  RACKS,
  isStored,
  repr,
  type EmptyLine,
  type FitBlock,
  type ItemLine,
  type Stored,
} from "./text.ts";

export type Plugged = "implants" | "boosters";
export type Place = Rack | Stored | "drones" | "fighters" | Plugged;

export const PLUGGED: readonly Plugged[] = ["implants", "boosters"];

const DEFAULT_PLACES: Partial<Record<Kind, Place>> = {
  sub: "sub",
  high: "high",
  mid: "mid",
  low: "low",
  rig: "rig",
  svc: "svc",
  drone: "drones",
  fighter: "fighters",
  implant: "implants",
  booster: "boosters",
};

export interface EmptySlot {
  kind: "empty";
  line: EmptyLine;
  place: Rack;
}

export interface Item {
  kind: "item";
  line: ItemLine;
  type: TypeRecord;
  place: Place;
  charge: TypeRecord | undefined;
  mutaplasmid: MutaplasmidRecord | undefined;
  overrides: [AttributeRecord, number][];
  reference: Fit | undefined;
}

/** Consecutive slots of a rack holding the same item; undefined for empty slots. */
export interface Run {
  start: number;
  length: number;
  item: Item | undefined;
}

export interface Fit {
  block: FitBlock;
  hull: TypeRecord | undefined;
  mode: TypeRecord | undefined;
  cargoOnly: boolean;
  items: (Item | EmptySlot)[];
  racks: Map<Rack, Run[]>;
}

export function isPlugged(place: Place): boolean {
  return place === "implants" || place === "boosters";
}

export function defaultPlace(kind: Kind, cargoOnly: boolean): Place {
  return cargoOnly ? "cargo" : (DEFAULT_PLACES[kind] ?? "cargo");
}

/** A tactical mode's name without the hull's name. */
export function modeName(hull: TypeRecord, mode: TypeRecord): string {
  return mode.name.slice(hull.name.length).replace(/^ +/, "");
}

function lookup(catalog: Catalog, name: string, line: number): TypeRecord {
  const type = catalog.type(fold(name));
  if (type === undefined) {
    throw new EsfError(`unknown type ${repr(name)}`, { line });
  }
  return type;
}

function pick<T>(
  candidates: readonly T[],
  given: string,
  what: string,
  line: number,
  name: (candidate: T) => string,
): T {
  const [first] = candidates;
  if (first === undefined) {
    throw new EsfError(`no ${what} matches ${repr(given)}`, { line });
  }
  if (candidates.length > 1) {
    const names = candidates.map((c) => repr(name(c))).join(", ");
    throw new EsfError(`${repr(given)} matches more than one ${what}: ${names}`, { line });
  }
  return first;
}

function resolveHull(block: FitBlock, catalog: Catalog): Fit {
  const fit: Fit = {
    block,
    hull: undefined,
    mode: undefined,
    cargoOnly: true,
    items: [],
    racks: new Map(),
  };
  if (block.hull === undefined) {
    return fit;
  }

  const line = block.hullLine;
  const hull = lookup(catalog, block.hull, line);
  if (hull.kind !== "hull" && hull.kind !== "container") {
    throw new EsfError(`${repr(hull.name)} is not a ship, structure or container`, { line });
  }
  fit.hull = hull;
  fit.cargoOnly = hull.kind === "container";

  const given = block.mode;
  if (given !== undefined) {
    const modes = modesOf(catalog, hull);
    if (modes.length === 0) {
      throw new EsfError(`${repr(hull.name)} has no tactical modes`, { line });
    }
    const matches = modes.filter(
      (m) => isWordPrefix(given, m.name) || isWordPrefix(given, modeName(hull, m)),
    );
    const what = `tactical mode of ${repr(hull.name)}`;
    fit.mode = pick(matches, given, what, line, (m) => m.name);
  }
  return fit;
}

function resolveLine(
  line: EmptyLine | ItemLine,
  fit: Fit,
  named: Map<string, Fit[]>,
  catalog: Catalog,
): Item | EmptySlot {
  const where = { line: line.number };
  if (line.kind === "empty") {
    if (fit.cargoOnly) {
      throw new EsfError("a fit without a ship has no slots to keep empty", where);
    }
    return { kind: "empty", line, place: line.rack };
  }

  const type = lookup(catalog, line.name, line.number);
  const kind = type.kind;
  if (kind === "mode") {
    throw new EsfError("a tactical mode is only written on the hull line", where);
  }

  const item: Item = {
    kind: "item",
    line,
    type,
    place: defaultPlace(kind, fit.cargoOnly),
    charge: undefined,
    mutaplasmid: undefined,
    overrides: [],
    reference: undefined,
  };

  if (line.fitName !== undefined) {
    if (kind !== "hull" && kind !== "container") {
      throw new EsfError(`${repr(type.name)} cannot take a fit name`, where);
    }
    const matches = named.get(fitKey(type.id, line.fitName)) ?? [];
    if (matches.length !== 1) {
      const what = matches.length === 0 ? "no fit" : "more than one fit";
      throw new EsfError(`${what} matches ${type.name} ${repr(line.fitName)}`, where);
    }
    item.reference = matches[0];
  }

  if (line.location !== undefined) {
    if (fit.cargoOnly && line.location !== "cargo") {
      throw new EsfError("a fit without a ship stores everything in cargo", where);
    }
    if (line.index !== undefined && DEFAULT_PLACES[kind] !== line.location) {
      throw new EsfError(`${repr(type.name)} does not go in the ${line.location} rack`, where);
    }
    if (line.location === "bay" && kind !== "drone" && kind !== "fighter") {
      throw new EsfError("@bay is only for drones and fighters", where);
    }
    item.place = line.location;
  }

  if (isPlugged(item.place) && line.count !== undefined) {
    throw new EsfError("a plugged-in implant or booster takes no count", where);
  }

  if (line.state !== undefined) {
    if (isStored(item.place)) {
      throw new EsfError("a stored item has no state", where);
    }
    if (isPlugged(item.place) && line.state !== "off") {
      throw new EsfError("an implant or booster takes !off only", where);
    }
  }

  if (line.charge !== undefined) {
    item.charge = lookup(catalog, line.charge, line.number);
    if (item.charge.kind !== "charge") {
      throw new EsfError(`${repr(item.charge.name)} is not a charge`, where);
    }
  }

  const mutaplasmid = line.mutaplasmid;
  if (mutaplasmid !== undefined) {
    const candidates = mutaplasmidsOf(catalog, type).filter((m) =>
      isWordPrefix(mutaplasmid, m.type.name),
    );
    const what = `mutaplasmid for ${repr(type.name)}`;
    item.mutaplasmid = pick(candidates, mutaplasmid, what, line.number, (m) => m.type.name);
  }

  const seen = new Set<number>();
  for (const [name, value] of line.overrides) {
    const attribute = catalog.attribute(fold(name));
    if (attribute === undefined) {
      throw new EsfError(`unknown attribute ${repr(name)}`, where);
    }
    if (seen.has(attribute.id)) {
      throw new EsfError(`attribute ${repr(attribute.name)} is overridden twice`, where);
    }
    seen.add(attribute.id);
    const number = Number(value);
    if (!Number.isFinite(number)) {
      throw new EsfError(`value ${repr(value)} is out of range`, where);
    }
    item.overrides.push([attribute, number]);
  }

  return item;
}

function fitKey(hullId: number, name: string): string {
  return `${String(hullId)} ${fold(name)}`;
}

function references(fit: Fit): Iterator<Item> {
  return fit.items
    .filter((item): item is Item => item.kind === "item" && item.reference !== undefined)
    .values();
}

/** A fit cannot contain itself, directly or through other fits. */
function checkCycles(fits: readonly Fit[]): void {
  const done = new Set<Fit>();
  for (const start of fits) {
    const path = new Set([start]);
    const stack: [Fit, Iterator<Item>][] = [[start, references(start)]];
    for (let top = stack.at(-1); top !== undefined; top = stack.at(-1)) {
      const [fit, items] = top;
      const next = items.next();
      if (next.done === true) {
        stack.pop();
        path.delete(fit);
        done.add(fit);
        continue;
      }
      const item = next.value;
      const ref = item.reference as Fit;
      if (path.has(ref)) {
        throw new EsfError("a fit cannot contain itself", { line: item.line.number });
      }
      if (!done.has(ref)) {
        path.add(ref);
        stack.push([ref, references(ref)]);
      }
    }
  }
}

/** The first index in sorted `values` that is at least `value`. */
function bisectLeft(values: readonly number[], value: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((values[mid] as number) < value) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

function filled(item: Item | EmptySlot): Item | undefined {
  return item.kind === "item" ? item : undefined;
}

/** Assign slots in one rack (§6.3). */
function layout(items: readonly (Item | EmptySlot)[]): Run[] {
  const pinned = new Map<number, Item | EmptySlot>();
  for (const item of items) {
    const index = item.line.index;
    if (index === undefined) {
      continue;
    }
    if (pinned.has(index)) {
      throw new EsfError(`slot ${String(index)} is pinned twice`, { line: item.line.number });
    }
    pinned.set(index, item);
  }

  const pins = [...pinned.keys()].sort((a, b) => a - b);
  const runs: Run[] = [];
  for (const [index, item] of pinned) {
    runs.push({ start: index, length: 1, item: filled(item) });
  }
  let pos = 1;
  for (const item of items) {
    if (item.line.index !== undefined) {
      continue;
    }
    let remaining = item.line.count ?? 1;
    while (remaining > 0) {
      while (pinned.has(pos)) {
        pos++;
      }
      const at = bisectLeft(pins, pos);
      const room = at < pins.length ? (pins[at] as number) - pos : remaining;
      const take = Math.min(remaining, room);
      runs.push({ start: pos, length: take, item: filled(item) });
      pos += take;
      remaining -= take;
    }
  }
  runs.sort((a, b) => a.start - b.start);

  const gapless: Run[] = [];
  pos = 1;
  for (const run of runs) {
    if (run.start > pos) {
      gapless.push({ start: pos, length: run.start - pos, item: undefined });
    }
    gapless.push(run);
    pos = run.start + run.length;
  }
  return gapless;
}

export function resolve(blocks: readonly FitBlock[], catalog: Catalog): Fit[] {
  const fits = blocks.map((block) => resolveHull(block, catalog));
  const named = new Map<string, Fit[]>();
  for (const fit of fits) {
    if (fit.hull !== undefined && fit.block.fitName !== undefined) {
      const key = fitKey(fit.hull.id, fit.block.fitName);
      const list = named.get(key);
      if (list === undefined) {
        named.set(key, [fit]);
      } else {
        list.push(fit);
      }
    }
  }
  for (const fit of fits) {
    fit.items = fit.block.lines.map((line) => resolveLine(line, fit, named, catalog));
    const plugged = new Set<number>();
    for (const item of fit.items) {
      if (item.kind !== "item" || !isPlugged(item.place)) {
        continue;
      }
      if (plugged.has(item.type.id)) {
        throw new EsfError(`${repr(item.type.name)} is plugged in twice`, {
          line: item.line.number,
        });
      }
      plugged.add(item.type.id);
    }
  }
  checkCycles(fits);
  for (const fit of fits) {
    for (const rack of RACKS) {
      const items = fit.items.filter((item) => item.place === rack);
      if (items.length > 0) {
        fit.racks.set(rack, layout(items));
      }
    }
  }
  return fits;
}
