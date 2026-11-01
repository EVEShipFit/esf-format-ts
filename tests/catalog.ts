// A Catalog read from the esf-format test catalog.

import { readFileSync } from "node:fs";
import {
  fold,
  type AttributeRecord,
  type Catalog,
  type Kind,
  type MutaplasmidRecord,
  type TypeRecord,
} from "../src/index.ts";

interface Named {
  id: number;
  name: string;
  published: boolean;
}

interface Data {
  types: (Named & {
    kind: Kind;
    active: boolean;
    capacity: number;
    volume: number;
    squadron_size?: number;
  })[];
  attributes: Named[];
  modes: { hull: number; modes: number[] }[];
  mutaplasmids: { base: number; mutaplasmid: number; rolls: [number, number][] }[];
}

function byName(entries: Named[]): Map<string, number> {
  const index = new Map<string, number>();
  const sorted = entries.toSorted(
    (a, b) => Number(b.published) - Number(a.published) || a.id - b.id,
  );
  for (const e of sorted) {
    const folded = fold(e.name);
    if (!index.has(folded)) {
      index.set(folded, e.id);
    }
  }
  return index;
}

export class JsonCatalog implements Catalog {
  private readonly types = new Map<number, TypeRecord>();
  private readonly attributes = new Map<number, AttributeRecord>();
  private readonly typeNames: Map<string, number>;
  private readonly attributeNames: Map<string, number>;
  private readonly modeTypes = new Map<number, TypeRecord[]>();
  private readonly mutaplasmidRecords = new Map<number, MutaplasmidRecord[]>();

  constructor(path: string) {
    const data = JSON.parse(readFileSync(path, "utf-8")) as Data;
    for (const t of data.types) {
      const { id, name, kind, active, capacity, volume, squadron_size } = t;
      const record: TypeRecord = { id, name, kind, active, capacity, volume };
      this.types.set(
        id,
        squadron_size === undefined ? record : { ...record, squadronSize: squadron_size },
      );
    }
    for (const { id, name } of data.attributes) {
      this.attributes.set(id, { id, name });
    }
    this.typeNames = byName(data.types);
    this.attributeNames = byName(data.attributes);
    for (const m of data.modes) {
      this.modeTypes.set(
        m.hull,
        m.modes.map((id) => this.types.get(id) as TypeRecord),
      );
    }
    for (const m of data.mutaplasmids) {
      const record = { type: this.types.get(m.mutaplasmid) as TypeRecord, rolls: m.rolls };
      const list = this.mutaplasmidRecords.get(m.base) ?? [];
      list.push(record);
      this.mutaplasmidRecords.set(m.base, list);
    }
  }

  type(folded: string): TypeRecord | undefined {
    const id = this.typeNames.get(folded);
    return id === undefined ? undefined : this.types.get(id);
  }

  typeById(typeId: number): TypeRecord | undefined {
    return this.types.get(typeId);
  }

  attribute(folded: string): AttributeRecord | undefined {
    const id = this.attributeNames.get(folded);
    return id === undefined ? undefined : this.attributes.get(id);
  }

  attributeById(attributeId: number): AttributeRecord | undefined {
    return this.attributes.get(attributeId);
  }

  modes(hullId: number): TypeRecord[] {
    return this.modeTypes.get(hullId) ?? [];
  }

  mutaplasmids(typeId: number): MutaplasmidRecord[] {
    return this.mutaplasmidRecords.get(typeId) ?? [];
  }
}

export function catalogPath(): string {
  return (
    process.env.ESF_CATALOG ?? new URL("../esf-format/tests/catalog.json", import.meta.url).pathname
  );
}
