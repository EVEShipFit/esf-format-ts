import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  sde,
  type AttributeRecord,
  type Catalog,
  type MutaplasmidRecord,
  type TypeRecord,
} from "@eveshipfit/esf-format";

interface Named {
  id: number;
  name: string;
  published: boolean;
}

interface Dogma {
  effects: number[];
  squadronSize: number | undefined;
  rollable: Map<number, number>;
}

interface GroupRow {
  _key: number;
  categoryID: number;
}

interface EffectRow {
  _key: number;
  effectCategoryID?: number;
}

interface MutaplasmidRow {
  _key: number;
  inputOutputMapping: { applicableTypes: number[] }[];
  attributeIDs: { _key: number }[];
}

interface TypeDogmaRow {
  _key: number;
  dogmaEffects?: { effectID: number }[];
  dogmaAttributes?: { attributeID: number; value: number }[];
}

interface TypeRow {
  _key: number;
  name: { en?: string };
  groupID: number;
  published?: boolean;
  capacity?: number;
  volume?: number;
}

interface AttributeRow {
  _key: number;
  name: string;
  published?: boolean;
  defaultValue?: number;
}

function rows<T>(dir: string, file: string): T[] {
  return readFileSync(join(dir, file), "utf-8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as T);
}

function append<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list === undefined) {
    map.set(key, [value]);
  } else {
    list.push(value);
  }
}

function byName(entries: Named[]): Map<string, number> {
  return sde.nameIndex(
    entries,
    (e) => e.id,
    (e) => e.name,
    (e) => e.published,
  );
}

/** A Catalog read from the official SDE in JSONL, unpacked into `dir`. */
export class SdeJsonlCatalog implements Catalog {
  private readonly types = new Map<number, TypeRecord>();
  private readonly attributes = new Map<number, AttributeRecord>();
  private readonly typeNames: Map<string, number>;
  private readonly attributeNames: Map<string, number>;
  private readonly modeTypes = new Map<number, TypeRecord[]>();
  private readonly mutaplasmidRecords = new Map<number, MutaplasmidRecord[]>();

  constructor(dir: string) {
    const categoryOfGroup = new Map<number, number>();
    for (const g of rows<GroupRow>(dir, "groups.jsonl")) {
      categoryOfGroup.set(g._key, g.categoryID);
    }

    const effectCategory = new Map<number, number>();
    for (const e of rows<EffectRow>(dir, "dogmaEffects.jsonl")) {
      effectCategory.set(e._key, e.effectCategoryID ?? 0);
    }

    const mutaplasmidRows = rows<MutaplasmidRow>(dir, "dynamicItemAttributes.jsonl").map((m) => ({
      id: m._key,
      bases: new Set(m.inputOutputMapping.flatMap((io) => io.applicableTypes)),
      attributes: m.attributeIDs.map((a) => a._key),
    }));

    const rollable = new Set(mutaplasmidRows.flatMap((m) => m.attributes));
    const dogma = new Map<number, Dogma>();
    for (const row of rows<TypeDogmaRow>(dir, "typeDogma.jsonl")) {
      const effects = (row.dogmaEffects ?? []).map((e) => e.effectID);
      const values = new Map((row.dogmaAttributes ?? []).map((a) => [a.attributeID, a.value]));
      dogma.set(row._key, {
        effects,
        squadronSize: sde.squadronSize(values),
        rollable: new Map([...values].filter(([id]) => rollable.has(id))),
      });
    }

    const typeRows: Named[] = [];
    const ships: Named[] = [];
    for (const t of rows<TypeRow>(dir, "types.jsonl")) {
      const name = t.name.en;
      if (name === undefined) {
        continue;
      }
      const categoryId = categoryOfGroup.get(t.groupID) as number;
      const d = dogma.get(t._key);
      const effects = d?.effects ?? [];
      const record: TypeRecord = {
        id: t._key,
        name,
        kind: sde.kind(categoryId, t.groupID, effects),
        active: sde.active(new Map(effects.map((e) => [e, effectCategory.get(e) ?? 0]))),
        capacity: t.capacity ?? 0,
        volume: t.volume ?? 0,
      };
      this.types.set(
        t._key,
        d?.squadronSize === undefined ? record : { ...record, squadronSize: d.squadronSize },
      );
      const named = { id: t._key, name, published: t.published ?? false };
      typeRows.push(named);
      if (categoryId === 6) {
        ships.push(named);
      }
    }
    this.typeNames = byName(typeRows);

    const attributeRows: Named[] = [];
    const defaults = new Map<number, number>();
    for (const a of rows<AttributeRow>(dir, "dogmaAttributes.jsonl")) {
      this.attributes.set(a._key, { id: a._key, name: a.name });
      attributeRows.push({ id: a._key, name: a.name, published: a.published ?? false });
      defaults.set(a._key, a.defaultValue ?? 0);
    }
    this.attributeNames = byName(attributeRows);

    const shipNames = byName(ships);
    for (const mode of this.types.values()) {
      if (mode.kind !== "mode") {
        continue;
      }
      const hull = sde.modeHull(mode.name, shipNames);
      if (hull !== undefined) {
        append(this.modeTypes, hull, mode);
      }
    }

    for (const m of mutaplasmidRows.sort((a, b) => a.id - b.id)) {
      const type = this.types.get(m.id) as TypeRecord;
      for (const base of m.bases) {
        const values = dogma.get(base)?.rollable;
        const rolls = m.attributes.map(
          (id) => [id, values?.get(id) ?? defaults.get(id) ?? 0] as const,
        );
        append(this.mutaplasmidRecords, base, { type, rolls });
      }
    }
  }

  type(foldedName: string): TypeRecord | undefined {
    const id = this.typeNames.get(foldedName);
    return id === undefined ? undefined : this.types.get(id);
  }

  typeById(typeId: number): TypeRecord | undefined {
    return this.types.get(typeId);
  }

  attribute(foldedName: string): AttributeRecord | undefined {
    const id = this.attributeNames.get(foldedName);
    return id === undefined ? undefined : this.attributes.get(id);
  }

  attributeById(attributeId: number): AttributeRecord | undefined {
    return this.attributes.get(attributeId);
  }

  modes(hullId: number): readonly TypeRecord[] {
    return this.modeTypes.get(hullId) ?? [];
  }

  mutaplasmids(typeId: number): readonly MutaplasmidRecord[] {
    return this.mutaplasmidRecords.get(typeId) ?? [];
  }
}
