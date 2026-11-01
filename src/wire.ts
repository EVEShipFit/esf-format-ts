// The Protocol Buffers wire format.

import { EsfError } from "./errors.ts";

export const VARINT = 0;
export const I64 = 1;
export const LEN = 2;
export const SGROUP = 3;
export const EGROUP = 4;
export const I32 = 5;

export function tag(field: number, wire: number): number {
  return (field << 3) | wire;
}

function invalid(why: string): EsfError {
  return new EsfError(`binary: not valid Protocol Buffers (${why})`);
}

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export class Writer {
  private buf = new Uint8Array(256);
  private view = new DataView(this.buf.buffer);
  private pos = 0;

  private reserve(n: number): void {
    if (this.pos + n <= this.buf.length) {
      return;
    }
    const grown = new Uint8Array(Math.max(this.buf.length * 2, this.pos + n));
    grown.set(this.buf.subarray(0, this.pos));
    this.buf = grown;
    this.view = new DataView(grown.buffer);
  }

  varint(value: number): void {
    this.reserve(10);
    while (value > 0x7f) {
      this.buf[this.pos++] = (value % 0x80) | 0x80;
      value = Math.floor(value / 0x80);
    }
    this.buf[this.pos++] = value;
  }

  uint(field: number, value: number): void {
    this.varint(tag(field, VARINT));
    this.varint(value);
  }

  string(field: number, value: string): void {
    const bytes = ENCODER.encode(value);
    this.varint(tag(field, LEN));
    this.varint(bytes.length);
    this.reserve(bytes.length);
    this.buf.set(bytes, this.pos);
    this.pos += bytes.length;
  }

  packedUints(field: number, values: readonly number[]): void {
    const start = this.begin(field);
    for (const value of values) {
      this.varint(value);
    }
    this.end(start);
  }

  packedDoubles(field: number, values: readonly number[]): void {
    this.varint(tag(field, LEN));
    this.varint(values.length * 8);
    this.reserve(values.length * 8);
    for (const value of values) {
      this.view.setFloat64(this.pos, value, true);
      this.pos += 8;
    }
  }

  /** Start a length-delimited record; its length is written by end(). */
  begin(field: number): number {
    this.varint(tag(field, LEN));
    return this.pos;
  }

  end(start: number): void {
    const length = this.pos - start;
    let size = 1;
    while (length >= 0x80 ** size) {
      size++;
    }
    this.reserve(size);
    this.buf.copyWithin(start + size, start, this.pos);
    const end = this.pos + size;
    this.pos = start;
    this.varint(length);
    this.pos = end;
  }

  finish(): Uint8Array {
    return this.buf.slice(0, this.pos);
  }
}

export class Reader {
  private readonly data: Uint8Array;
  private readonly view: DataView;
  private readonly end: number;
  private pos: number;

  constructor(data: Uint8Array, pos = 0, end = data.length, view?: DataView) {
    this.data = data;
    this.view = view ?? new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.pos = pos;
    this.end = end;
  }

  done(): boolean {
    return this.pos >= this.end;
  }

  private take(n: number): number {
    if (n > this.end - this.pos) {
      throw invalid("cut short");
    }
    const at = this.pos;
    this.pos += n;
    return at;
  }

  private byte(): number {
    if (this.pos >= this.end) {
      throw invalid("cut short");
    }
    return this.data[this.pos++] as number;
  }

  /** A varint, masked to 64 bits; exact up to 2^53. */
  varint(): number {
    let value = 0;
    let scale = 1;
    for (let i = 0; i < 7; i++) {
      const byte = this.byte();
      value += (byte & 0x7f) * scale;
      if (byte < 0x80) {
        return value;
      }
      scale *= 0x80;
    }
    let big = BigInt(value);
    for (let shift = 49n; shift < 70n; shift += 7n) {
      const byte = this.byte();
      big |= BigInt(byte & 0x7f) << shift;
      if (byte < 0x80) {
        return Number(BigInt.asUintN(64, big));
      }
    }
    throw invalid("varint is too long");
  }

  /** The next record's tag: its field number and wire type. */
  key(): number {
    const key = this.varint();
    if (key < 8 || key > 0xffffffff || (key & 7) > I32) {
      throw invalid(`bad key ${String(key)}`);
    }
    return key;
  }

  /** The payload of a length-delimited record, as a reader. */
  message(): Reader {
    const length = this.varint();
    const at = this.take(length);
    return new Reader(this.data, at, at + length, this.view);
  }

  bytes(): Uint8Array {
    const length = this.varint();
    const at = this.take(length);
    return this.data.subarray(at, at + length);
  }

  string(): string | undefined {
    return DECODER.decode(this.bytes()) || undefined;
  }

  double(): number {
    return this.view.getFloat64(this.take(8), true);
  }

  uints(): number[] {
    const reader = this.message();
    const out: number[] = [];
    while (!reader.done()) {
      out.push(reader.varint());
    }
    return out;
  }

  doubles(): number[] {
    const length = this.varint();
    if (length % 8 !== 0) {
      throw invalid("packed doubles cut short");
    }
    const at = this.take(length);
    const out: number[] = [];
    for (let i = at; i < at + length; i += 8) {
      out.push(this.view.getFloat64(i, true));
    }
    return out;
  }

  /** Step over the value of a record that is not read. */
  skip(key: number): void {
    switch (key & 7) {
      case VARINT:
        this.varint();
        return;
      case I64:
        this.take(8);
        return;
      case I32:
        this.take(4);
        return;
      case LEN:
        this.take(this.varint());
        return;
      case SGROUP:
        this.skipGroup(key >>> 3);
        return;
      default:
        throw invalid("unmatched end group");
    }
  }

  private skipGroup(field: number): void {
    const open = [field];
    while (open.length > 0) {
      const key = this.key();
      const wire = key & 7;
      if (wire === SGROUP) {
        open.push(key >>> 3);
      } else if (wire === EGROUP) {
        if (open.pop() !== key >>> 3) {
          throw invalid("unmatched end group");
        }
      } else {
        this.skip(key);
      }
    }
  }
}
