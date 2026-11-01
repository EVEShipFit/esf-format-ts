// Fits as the text they stand for, and the check that their IDs match it (SPEC §10.2).

import type { Catalog } from "./catalog.ts";
import { formatNumber } from "./number.ts";
import { quote, quoteType } from "./canonical.ts";
import { EsfError, type Where } from "./errors.ts";
import type { Entry, EsfFit } from "./model.ts";
import type { Fit } from "./resolve.ts";
import { isRack, isStored } from "./text.ts";

const STATES: readonly string[] = ["off", "on", "heat"];

function name(text: string): string {
  if (text.includes("\r") || text.includes("\n")) {
    throw new EsfError("a fit name contains CR or LF");
  }
  return quote(text);
}

function typeName(catalog: Catalog, typeId: number, what: string): string {
  const type = catalog.typeById(typeId);
  if (type === undefined) {
    throw new EsfError(`unknown ${what} type ID ${String(typeId)}`);
  }
  return quoteType(type.name);
}

function count(n: number): string {
  if (!Number.isInteger(n) || n < 1) {
    throw new EsfError(`a count must be a whole number of at least 1, not ${String(n)}`);
  }
  return `${String(n)}x`;
}

function value(n: number): string {
  if (!Number.isFinite(n)) {
    throw new EsfError("an override value is not finite");
  }
  return formatNumber(n);
}

function entryText(e: Entry, catalog: Catalog): string {
  if (e.type != null && e.location != null && isRack(e.location)) {
    throw new EsfError("a rack location is only for an empty slot");
  }
  if (e.chargeCount != null && e.charge == null) {
    throw new EsfError("a charge count is set without a charge");
  }

  const parts: string[] = [];
  if (e.count != null) {
    parts.push(count(e.count));
  }
  parts.push(e.type == null ? "-" : typeName(catalog, e.type, "item"));
  if (e.fitName) {
    parts.push(name(e.fitName));
  }
  if (e.charge != null) {
    const n = e.chargeCount == null ? "" : `${count(e.chargeCount)} `;
    parts.push(`:${n}${typeName(catalog, e.charge, "charge")}`);
  }
  if (e.mutaplasmid != null) {
    parts.push(`+${typeName(catalog, e.mutaplasmid, "mutaplasmid")}`);
  }
  const overrides = Object.entries(e.overrides ?? {});
  if (overrides.length > 0) {
    const pairs = overrides.map(([id, v]) => {
      const attribute = catalog.attributeById(Number(id));
      if (attribute === undefined) {
        throw new EsfError(`unknown attribute ID ${id}`);
      }
      return `${attribute.name} ${value(v)}`;
    });
    parts.push(`{${pairs.join(", ")}}`);
  }
  if (e.state != null) {
    if (!STATES.includes(e.state)) {
      throw new EsfError(`unknown state ${e.state}`);
    }
    parts.push(`!${e.state}`);
  }
  if (e.location != null) {
    if (!isRack(e.location) && !isStored(e.location)) {
      throw new EsfError(`unknown location ${String(e.location)}`);
    }
    parts.push(`@${e.location}`);
  }
  return parts.join(" ");
}

function hullText(fit: EsfFit, catalog: Catalog): string {
  const hull = [fit.hull == null ? "-" : typeName(catalog, fit.hull, "hull")];
  if (fit.name) {
    hull.push(name(fit.name));
  }
  if (fit.mode != null) {
    hull.push(`/${typeName(catalog, fit.mode, "tactical mode")}`);
  }
  return hull.join(" ");
}

function at(where: Where, run: () => void): void {
  try {
    run();
  } catch (e) {
    throw e instanceof EsfError ? new EsfError(e.reason, where) : e;
  }
}

/** The text document the fits stand for, and the fit and entry each line is. */
export function source(fits: readonly EsfFit[], catalog: Catalog): [string, Where[]] {
  if (fits.length === 0) {
    throw new EsfError("a document holds at least one fit");
  }
  const out: string[] = [];
  const where: Where[] = [];
  fits.forEach((f, i) => {
    const fit = { fit: i + 1 };
    at(fit, () => out.push("%esf/1", hullText(f, catalog)));
    where.push(fit, fit);
    f.entries.forEach((e, j) => {
      const entry = { fit: i + 1, entry: j + 1 };
      at(entry, () => out.push(entryText(e, catalog)));
      where.push(entry);
    });
  });
  out.push("");
  return [out.join("\n"), where];
}

function same(got: { id: number } | undefined, want: number | undefined | null, what: string) {
  const id = got?.id;
  if (id !== (want ?? undefined)) {
    throw new EsfError(
      `${what} ID ${String(want)} is not what its name resolves to (${String(id)})`,
    );
  }
}

/** Check that every ID is the one its name resolves to. */
export function verify(resolved: readonly Fit[], fits: readonly EsfFit[]): void {
  resolved.forEach((fit, i) => {
    const given = fits[i] as EsfFit;
    at({ fit: i + 1 }, () => {
      same(fit.hull, given.hull, "hull");
      same(fit.mode, given.mode, "tactical mode");
    });
    fit.items.forEach((item, j) => {
      if (item.kind === "empty") {
        return;
      }
      const entry = given.entries[j] as Entry;
      at({ fit: i + 1, entry: j + 1 }, () => {
        same(item.type, entry.type, "type");
        same(item.charge, entry.charge, "charge");
        same(item.mutaplasmid?.type, entry.mutaplasmid, "mutaplasmid");
        const got = item.overrides.map(([a]) => a.id).join(", ");
        const want = Object.keys(entry.overrides ?? {}).join(", ");
        if (got !== want) {
          throw new EsfError(`attribute IDs [${want}] resolve to [${got}]`);
        }
      });
    });
  });
}
