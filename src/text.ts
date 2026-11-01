// Reading the text form into lines, without a Catalog (SPEC §4.1, grammar.ebnf).

import { EsfError } from "./errors.ts";
import type { Hold, Rack, State } from "./model.ts";

export type Stored = "cargo" | "bay" | Hold;

export const SIGILS = ':+{!@/"';
export const RACKS: readonly Rack[] = ["sub", "high", "mid", "low", "rig", "svc"];
export const HOLDS: readonly Hold[] = [
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
export const STORED: readonly Stored[] = ["cargo", "bay", ...HOLDS];

export const UINT32_MAX = 0xffffffff;

const COUNT = /^[0-9]+x$/;
const HEADER = /^ *%([a-z][a-z0-9-]*)\/([0-9]+) *$/;
const STATE = /!(off|on|heat)/y;
const LOCATION = /@([a-z]+)([0-9]*)/y;
const OVERRIDE = /([A-Za-z][A-Za-z0-9]*) +(-?[0-9]+(?:\.[0-9]+)?)/y;

export function isRack(name: string): name is Rack {
  return (RACKS as readonly string[]).includes(name);
}

export function isStored(name: string): name is Stored {
  return (STORED as readonly string[]).includes(name);
}

export interface EmptyLine {
  kind: "empty";
  number: number;
  rack: Rack;
  count: number | undefined;
  index: number | undefined;
}

export interface ItemLine {
  kind: "item";
  number: number;
  name: string;
  count: number | undefined;
  fitName: string | undefined;
  charge: string | undefined;
  chargeCount: number | undefined;
  mutaplasmid: string | undefined;
  overrides: [name: string, value: string][];
  state: State | undefined;
  location: Rack | Stored | undefined;
  index: number | undefined;
}

export interface FitBlock {
  number: number;
  hullLine: number;
  hull: string | undefined;
  fitName: string | undefined;
  mode: string | undefined;
  lines: (EmptyLine | ItemLine)[];
}

export function isCount(token: string): boolean {
  return COUNT.test(token);
}

class Cursor {
  readonly number: number;
  readonly s: string;
  i = 0;

  constructor(number: number, s: string) {
    this.number = number;
    this.s = s;
  }

  error(message: string): never {
    throw new EsfError(message, { line: this.number });
  }

  peek(): string {
    return this.s.charAt(this.i);
  }

  token(): string {
    const end = this.s.indexOf(" ", this.i);
    return this.s.slice(this.i, end >= 0 ? end : this.s.length);
  }

  skipSpaces(): boolean {
    const start = this.i;
    while (this.s.charCodeAt(this.i) === 0x20) {
      this.i++;
    }
    return this.i > start;
  }

  /** Step over the separating space; false at the end of the line or a comment. */
  nextElement(): boolean {
    const spaced = this.skipSpaces();
    if (this.i >= this.s.length) {
      return false;
    }
    if (this.s.startsWith("//", this.i)) {
      if (!spaced) {
        this.error("a comment needs a space before it");
      }
      this.i = this.s.length;
      return false;
    }
    if (!spaced) {
      this.error(`expected a space before ${repr(this.token())}`);
    }
    return true;
  }

  positive(digits: string, what: string): number {
    const trimmed = digits.replace(/^0+/, "");
    if (trimmed === "") {
      this.error(`${what} must be at least 1`);
    }
    const value = Number(trimmed);
    if (value > UINT32_MAX) {
      this.error(`${what} is too large`);
    }
    return value;
  }

  finish(): void {
    if (this.nextElement()) {
      this.error(`unexpected ${repr(this.token())}`);
    }
  }

  count(): number | undefined {
    const token = this.token();
    if (!isCount(token)) {
      return undefined;
    }
    this.i += token.length;
    if (!this.nextElement()) {
      this.error("a count must be followed by a type name");
    }
    return this.positive(token.slice(0, -1), "a count");
  }

  quoted(): string {
    let out = "";
    let from = this.i + 1;
    for (;;) {
      const end = this.s.indexOf('"', from);
      if (end < 0) {
        this.error("unterminated quoted string");
      }
      out += this.s.slice(from, end);
      if (this.s.charCodeAt(end + 1) !== 0x22) {
        this.i = end + 1;
        break;
      }
      out += '"';
      from = end + 2;
    }
    if (out === "") {
      this.error("a quoted string cannot be empty");
    }
    return out;
  }

  word(): string {
    const token = this.token();
    this.i += token.length;
    return token;
  }

  typeName(): string {
    const c = this.peek();
    if (c === '"') {
      return this.quoted();
    }
    if (c === "" || c === " " || SIGILS.includes(c)) {
      this.error("expected a type name");
    }
    if (c === "-" || c === "%") {
      this.error(`a name starting with ${repr(c)} must be quoted`);
    }
    const words = [this.word()];
    for (;;) {
      const end = this.i;
      this.skipSpaces();
      const next = this.peek();
      if (this.i === end || next === "" || SIGILS.includes(next)) {
        this.i = end;
        return words.join(" ");
      }
      words.push(this.word());
    }
  }

  match(pattern: RegExp): RegExpExecArray | null {
    pattern.lastIndex = this.i;
    const match = pattern.exec(this.s);
    if (match !== null) {
      this.i = pattern.lastIndex;
    }
    return match;
  }

  location(): [Rack | Stored, number | undefined] {
    const match = this.match(LOCATION);
    if (match === null) {
      this.error(`unknown location ${repr(this.token())}`);
    }
    const [, name = "", index = ""] = match;
    if (index !== "") {
      if (!isRack(name)) {
        this.error(`unknown rack ${repr(name)}`);
      }
      return [name, this.positive(index, "a slot number")];
    }
    if (!isStored(name) && !isRack(name)) {
      this.error(`unknown location ${repr(name)}`);
    }
    return [name, undefined];
  }

  overrides(): [string, string][] {
    this.i++;
    this.skipSpaces();
    const pairs: [string, string][] = [];
    for (;;) {
      const match = this.match(OVERRIDE);
      if (match === null) {
        this.error("malformed override; expected 'attribute value'");
      }
      pairs.push([match[1] as string, match[2] as string]);
      this.skipSpaces();
      const c = this.peek();
      if (c === ",") {
        this.i++;
        this.skipSpaces();
        continue;
      }
      if (c === "}") {
        this.i++;
        return pairs;
      }
      this.error("malformed overrides; expected ',' or '}'");
    }
  }
}

/** A string in quotes, for error messages. */
export function repr(s: string): string {
  return s.includes("'") && !s.includes('"') ? `"${s}"` : `'${s.replaceAll("'", "\\'")}'`;
}

function hull(header: number, cur: Cursor): FitBlock {
  const block: FitBlock = {
    number: header,
    hullLine: cur.number,
    hull: undefined,
    fitName: undefined,
    mode: undefined,
    lines: [],
  };
  cur.skipSpaces();
  if (cur.token() === "-") {
    cur.i++;
    if (cur.nextElement()) {
      if (cur.peek() !== '"') {
        cur.error("a hull line of '-' takes only a fit name");
      }
      block.fitName = cur.quoted();
    }
    cur.finish();
    return block;
  }

  if (isCount(cur.token())) {
    cur.error("the hull line cannot have a count");
  }
  block.hull = cur.typeName();
  let more = cur.nextElement();
  if (more && cur.peek() === '"') {
    block.fitName = cur.quoted();
    more = cur.nextElement();
  }
  if (more) {
    if (cur.peek() !== "/") {
      cur.error(`unexpected ${repr(cur.token())} on the hull line`);
    }
    cur.i++;
    block.mode = cur.typeName();
  }
  cur.finish();
  return block;
}

function entry(cur: Cursor): EmptyLine | ItemLine {
  cur.skipSpaces();
  const count = cur.count();

  if (cur.token() === "-") {
    cur.i++;
    if (!cur.nextElement() || cur.peek() !== "@") {
      cur.error("an empty slot must name its rack");
    }
    const [rack, index] = cur.location();
    if (!isRack(rack)) {
      cur.error("an empty slot must name a rack");
    }
    if (index !== undefined && count !== undefined) {
      cur.error("a count and a pinned slot are mutually exclusive");
    }
    cur.finish();
    return { kind: "empty", number: cur.number, rack, count, index };
  }

  const line: ItemLine = {
    kind: "item",
    number: cur.number,
    name: cur.typeName(),
    count,
    fitName: undefined,
    charge: undefined,
    chargeCount: undefined,
    mutaplasmid: undefined,
    overrides: [],
    state: undefined,
    location: undefined,
    index: undefined,
  };
  let more = cur.nextElement();

  if (more && cur.peek() === '"') {
    line.fitName = cur.quoted();
    if (cur.nextElement()) {
      if (cur.peek() !== "@") {
        cur.error("a reference takes only a count and a location");
      }
      const [location, index] = cur.location();
      if (index !== undefined || !isStored(location)) {
        cur.error("a reference can only be stored");
      }
      line.location = location;
      cur.finish();
    }
    return line;
  }

  let stage = 0;
  while (more) {
    const c = cur.peek();
    if (c === ":" && stage < 1) {
      cur.i++;
      line.chargeCount = cur.count();
      line.charge = cur.typeName();
      stage = 1;
    } else if (c === "+" && stage < 2) {
      cur.i++;
      line.mutaplasmid = cur.typeName();
      stage = 2;
    } else if (c === "{" && stage < 3) {
      line.overrides = cur.overrides();
      stage = 3;
    } else if (c === "!" && stage < 4) {
      const match = cur.match(STATE);
      if (match === null) {
        cur.error(`unknown state ${repr(cur.token())}`);
      }
      line.state = match[1] as State;
      stage = 4;
    } else if (c === "@" && stage < 5) {
      [line.location, line.index] = cur.location();
      if (line.index === undefined && !isStored(line.location)) {
        cur.error("an item names a rack only to pin a slot, which needs an index");
      }
      if (line.index !== undefined && count !== undefined) {
        cur.error("a count and a pinned slot are mutually exclusive");
      }
      stage = 5;
    } else {
      cur.error(`unexpected ${repr(cur.token())}`);
    }
    more = cur.nextElement();
  }
  return line;
}

function trimSpaces(text: string): string {
  let i = 0;
  while (text.charCodeAt(i) === 0x20) {
    i++;
  }
  return text.slice(i);
}

function isBlank(text: string): boolean {
  const stripped = trimSpaces(text);
  return stripped === "" || stripped.startsWith("//");
}

const DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function isUtf8(data: Uint8Array): boolean {
  try {
    DECODER.decode(data);
    return true;
  } catch {
    return false;
  }
}

/** A text document as a string. */
export function decode(data: Uint8Array): string {
  try {
    return DECODER.decode(data);
  } catch {
    let line = 1;
    let start = 0;
    let end = data.indexOf(0x0a);
    while (end >= 0 && isUtf8(data.subarray(start, end))) {
      line++;
      start = end + 1;
      end = data.indexOf(0x0a, start);
    }
    throw new EsfError("not valid UTF-8", { line });
  }
}

/** Split a text document into fits; other blocks are skipped. */
export function parse(text: string): FitBlock[] {
  const lines = text.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  if (!text.isWellFormed()) {
    const line = lines.findIndex((line) => !line.isWellFormed()) + 1;
    throw new EsfError("not valid UTF-8", { line });
  }

  const fits: FitBlock[] = [];
  let current: FitBlock | undefined;
  let header: number | undefined;
  let inBlock = false;
  for (const [i, line] of lines.entries()) {
    const number = i + 1;
    const raw = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (raw.includes("\r")) {
      throw new EsfError("a CR must be followed by an LF", { line: number });
    }

    if (trimSpaces(raw).startsWith("%")) {
      const match = HEADER.exec(raw);
      if (match === null) {
        throw new EsfError("malformed header", { line: number });
      }
      if (header !== undefined) {
        throw new EsfError("a fit needs a hull line", { line: header });
      }
      inBlock = true;
      current = undefined;
      if (match[1] === "esf") {
        if (match[2] !== "1") {
          throw new EsfError(`unsupported version esf/${match[2] as string}`, { line: number });
        }
        header = number;
      }
      continue;
    }

    if (!inBlock) {
      throw new EsfError("a document starts with a header", { line: number });
    }
    if (isBlank(raw)) {
      continue;
    }

    const cur = new Cursor(number, raw);
    if (header !== undefined) {
      current = hull(header, cur);
      fits.push(current);
      header = undefined;
    } else if (current !== undefined) {
      current.lines.push(entry(cur));
    }
  }

  if (header !== undefined) {
    throw new EsfError("a fit needs a hull line", { line: header });
  }
  if (fits.length === 0) {
    throw new EsfError("a document holds at least one fit");
  }
  return fits;
}
