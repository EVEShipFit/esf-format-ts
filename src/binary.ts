// The binary form (SPEC §10).

import { lines, type CanonFit, type CanonLine } from "./canonical.ts";
import { EsfError } from "./errors.ts";
import {
  compact,
  type Entry,
  type EsfFit,
  type Loose,
  type Location,
  type State,
} from "./model.ts";
import { UINT32_MAX } from "./text.ts";
import { I64, LEN, Reader, VARINT, Writer, tag } from "./wire.ts";

const STATES: readonly State[] = ["off", "on", "heat"];
const LOCATIONS: readonly Location[] = [
  "high",
  "mid",
  "low",
  "rig",
  "sub",
  "svc",
  "cargo",
  "bay",
  "ammo",
  "booster",
  "command",
  "corpse",
  "depot",
  "expedition",
  "fleet",
  "frigate",
  "fuel",
  "gas",
  "ice",
  "infrastructure",
  "maintenance",
  "mineral",
  "mining",
  "moon",
  "planetary",
  "quafe",
  "subsystem",
];

function encodeLine(out: Writer, line: CanonLine): void {
  const start = out.begin(5);
  if (line.type !== undefined) out.uint(1, line.type.id);
  if (line.count !== undefined) out.uint(2, line.count);
  if (line.fitName) out.string(3, line.fitName);
  if (line.charge !== undefined) out.uint(4, line.charge.id);
  if (line.chargeCount !== undefined) out.uint(5, line.chargeCount);
  if (line.mutaplasmid !== undefined) out.uint(6, line.mutaplasmid.type.id);
  if (line.overrides.length > 0) {
    out.packedUints(
      7,
      line.overrides.map(([a]) => a.id),
    );
    out.packedDoubles(
      8,
      line.overrides.map(([, v]) => v),
    );
  }
  if (line.state !== undefined) out.uint(9, STATES.indexOf(line.state) + 1);
  if (line.location !== undefined) out.uint(10, LOCATIONS.indexOf(line.location) + 1);
  out.end(start);
}

export function encode(fits: readonly CanonFit[]): Uint8Array {
  const out = new Writer();
  for (const fit of fits) {
    const start = out.begin(1);
    out.uint(1, 1);
    if (fit.hull !== undefined) out.uint(2, fit.hull.id);
    if (fit.name) out.string(3, fit.name);
    if (fit.mode !== undefined) out.uint(4, fit.mode.id);
    for (const line of lines(fit)) {
      encodeLine(out, line);
    }
    out.end(start);
  }
  return out.finish();
}

function uint32(value: number, what: string): number {
  if (value > UINT32_MAX) {
    throw new EsfError(`binary: ${what} is out of range`);
  }
  return value;
}

function string(reader: Reader, what: string): string | undefined {
  try {
    return reader.string();
  } catch (e) {
    if (e instanceof EsfError) {
      throw e;
    }
    throw new EsfError(`binary: ${what} is not valid UTF-8`);
  }
}

function enumValue<T>(names: readonly T[], value: number, what: string): T | undefined {
  if (value === 0) {
    return undefined;
  }
  const name = names[value - 1];
  if (name === undefined) {
    throw new EsfError(`binary: unknown ${what} value ${String(value)}`);
  }
  return name;
}

function notInSchema(what: string): EsfError {
  return new EsfError(`binary: ${what} has a field that is not in the schema`);
}

function decodeEntry(reader: Reader): Entry {
  const e: Loose<Entry> = {};
  const attributes: number[] = [];
  const values: number[] = [];
  while (!reader.done()) {
    switch (reader.key()) {
      case tag(1, VARINT):
        e.type = uint32(reader.varint(), "Entry.type");
        break;
      case tag(2, VARINT):
        e.count = uint32(reader.varint(), "Entry.count");
        break;
      case tag(3, LEN):
        e.fitName = string(reader, "Entry.fit_name");
        break;
      case tag(4, VARINT):
        e.charge = uint32(reader.varint(), "Entry.charge");
        break;
      case tag(5, VARINT):
        e.chargeCount = uint32(reader.varint(), "Entry.charge_count");
        break;
      case tag(6, VARINT):
        e.mutaplasmid = uint32(reader.varint(), "Entry.mutaplasmid");
        break;
      case tag(7, VARINT):
        attributes.push(uint32(reader.varint(), "Entry.override_attributes"));
        break;
      case tag(7, LEN):
        for (const value of reader.uints()) {
          attributes.push(uint32(value, "Entry.override_attributes"));
        }
        break;
      case tag(8, I64):
        values.push(reader.double());
        break;
      case tag(8, LEN):
        values.push(...reader.doubles());
        break;
      case tag(9, VARINT):
        e.state = enumValue(STATES, reader.varint(), "State");
        break;
      case tag(10, VARINT):
        e.location = enumValue(LOCATIONS, reader.varint(), "Location");
        break;
      default:
        throw notInSchema("Entry");
    }
  }
  if (attributes.length !== values.length) {
    throw new EsfError("binary: override fields have different lengths");
  }
  if (attributes.length > 0) {
    const overrides: Record<number, number> = {};
    attributes.forEach((id, i) => {
      if (id in overrides) {
        throw new EsfError("binary: an attribute is overridden twice");
      }
      overrides[id] = values[i] as number;
    });
    e.overrides = overrides;
  }
  return compact(e);
}

function decodeFit(reader: Reader): EsfFit {
  const fit: Loose<EsfFit> & { entries: Entry[] } = { entries: [] };
  let version = 0;
  while (!reader.done()) {
    switch (reader.key()) {
      case tag(1, VARINT):
        version = uint32(reader.varint(), "Fit.version");
        break;
      case tag(2, VARINT):
        fit.hull = uint32(reader.varint(), "Fit.hull");
        break;
      case tag(3, LEN):
        fit.name = string(reader, "Fit.name");
        break;
      case tag(4, VARINT):
        fit.mode = uint32(reader.varint(), "Fit.tactical_mode");
        break;
      case tag(5, LEN):
        fit.entries.push(decodeEntry(reader.message()));
        break;
      default:
        throw notInSchema("Fit");
    }
  }
  if (version !== 1) {
    throw new EsfError(`binary: unsupported Fit.version ${String(version)}`);
  }
  return compact(fit);
}

export function decode(data: Uint8Array): EsfFit[] {
  const reader = new Reader(data);
  const fits: EsfFit[] = [];
  while (!reader.done()) {
    const key = reader.key();
    if (key >>> 3 !== 1) {
      reader.skip(key);
    } else if (key !== tag(1, LEN)) {
      throw new EsfError("binary: Document.fits has the wrong wire type");
    } else {
      fits.push(decodeFit(reader.message()));
    }
  }
  if (fits.length === 0) {
    throw new EsfError("binary: a document holds at least one fit");
  }
  return fits;
}
