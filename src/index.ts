// Read and write esf/1 (https://github.com/EVEShipFit/esf-format).

import * as binary from "./binary.ts";
import { canonicalFit, render, toModel, type CanonFit } from "./canonical.ts";
import type { Catalog } from "./catalog.ts";
import { EsfError } from "./errors.ts";
import type { EsfFit } from "./model.ts";
import { resolve } from "./resolve.ts";
import { source, verify } from "./source.ts";
import { decode, parse, type FitBlock } from "./text.ts";

export type { AttributeRecord, Catalog, Kind, MutaplasmidRecord, TypeRecord } from "./catalog.ts";
export { EsfError, type Where } from "./errors.ts";
export type { Entry, EsfFit, Hold, Location, Rack, State } from "./model.ts";
export { fold } from "./names.ts";

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const BASE64URL_DIGITS = new Int8Array(128).fill(-1);
for (let i = 0; i < BASE64URL.length; i++) {
  BASE64URL_DIGITS[BASE64URL.charCodeAt(i)] = i;
}
const ENCODER = new TextEncoder();

/** Whether a document is text, by its first character (§10). */
export function isText(data: Uint8Array | string): boolean {
  const first = typeof data === "string" ? data.charCodeAt(0) : data[0];
  return first === 0x25 || first === 0x20;
}

function canonical(blocks: FitBlock[], catalog: Catalog, given?: readonly EsfFit[]): CanonFit[] {
  const fits = resolve(blocks, catalog);
  if (given !== undefined) {
    verify(fits, given);
  }
  return fits.map((fit) => canonicalFit(fit, catalog));
}

function checked(fits: readonly EsfFit[], catalog: Catalog): CanonFit[] {
  const [text, where] = source(fits, catalog);
  try {
    return canonical(parse(text), catalog, fits);
  } catch (e) {
    if (e instanceof EsfError && e.line !== undefined) {
      throw new EsfError(e.reason, where[e.line - 1]);
    }
    throw e;
  }
}

/** Read a text or binary document, in canonical form. */
export function load(data: Uint8Array | string, catalog: Catalog): EsfFit[] {
  if (data.length === 0) {
    throw new EsfError("the document is empty");
  }
  if (isText(data)) {
    const text = typeof data === "string" ? data : decode(data);
    return canonical(parse(text), catalog).map(toModel);
  }
  const bytes = typeof data === "string" ? ENCODER.encode(data) : data;
  return checked(binary.decode(bytes), catalog).map(toModel);
}

/** Write fits as canonical text (§8). */
export function save(fits: readonly EsfFit[], catalog: Catalog): string {
  return render(checked(fits, catalog));
}

/** Write fits in the binary form (§10). */
export function saveBinary(fits: readonly EsfFit[], catalog: Catalog): Uint8Array {
  return binary.encode(checked(fits, catalog));
}

/** The binary form as base64url without padding, for URLs (§10.4). */
export function toBase64url(data: Uint8Array): string {
  const out: string[] = [];
  for (let i = 0; i < data.length; i += 3) {
    const chunk = ((data[i] as number) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0);
    const chars = Math.min(4, Math.ceil(((data.length - i) * 4) / 3));
    for (let j = 0; j < chars; j++) {
      out.push(BASE64URL.charAt((chunk >> (18 - 6 * j)) & 0x3f));
    }
  }
  return out.join("");
}

/** The binary form from base64url without padding (§10.4). */
export function fromBase64url(encoded: string): Uint8Array {
  const text = encoded.trim();
  if (text.length % 4 === 1) {
    throw new EsfError("not valid base64url");
  }
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let pos = 0;
  for (let i = 0; i < text.length; i++) {
    const digit = BASE64URL_DIGITS[text.charCodeAt(i)] ?? -1;
    if (digit < 0) {
      throw new EsfError("not valid base64url");
    }
    value = ((value << 6) | digit) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[pos++] = (value >> bits) & 0xff;
    }
  }
  return out;
}
