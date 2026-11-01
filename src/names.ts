// Name matching rules (SPEC §6.10, §6.1, §6.6).

const FOLDS = new Map([
  [0xb5, 0x3bc],
  [0x17f, 0x73],
  [0x345, 0x3b9],
  [0x3c2, 0x3c3],
  [0x3d0, 0x3b2],
  [0x3d1, 0x3b8],
  [0x3d5, 0x3c6],
  [0x3d6, 0x3c0],
  [0x3f0, 0x3ba],
  [0x3f1, 0x3c1],
  [0x3f5, 0x3b5],
  [0x1c80, 0x432],
  [0x1c81, 0x434],
  [0x1c82, 0x43e],
  [0x1c83, 0x441],
  [0x1c84, 0x442],
  [0x1c85, 0x442],
  [0x1c86, 0x44a],
  [0x1c87, 0x463],
  [0x1c88, 0xa64b],
  [0x1e9b, 0x1e61],
  [0x1fbe, 0x3b9],
]);

const PRINTABLE_ASCII = /^[ -~]*$/;

function foldCodePoint(c: string): string {
  const code = c.codePointAt(0) as number;
  const folded = FOLDS.get(code);
  if (folded !== undefined) {
    return String.fromCodePoint(folded);
  }
  if (code >= 0x13a0 && code <= 0x13f5) {
    return c;
  }
  if (code >= 0x13f8 && code <= 0x13fd) {
    return String.fromCodePoint(code - 8);
  }
  if (code >= 0xab70 && code <= 0xabbf) {
    return String.fromCodePoint(code - 0xab70 + 0x13a0);
  }
  const lowered = c.toLowerCase();
  return lowered.length === c.length ? lowered : c;
}

/** Unicode simple case folding. */
export function fold(s: string): string {
  if (PRINTABLE_ASCII.test(s)) {
    return s.toLowerCase();
  }
  let out = "";
  for (const c of s) {
    out += foldCodePoint(c);
  }
  return out;
}

/** Whether `prefix` is `name` with zero or more whole words dropped from the end. */
export function isWordPrefix(prefix: string, name: string): boolean {
  const words = fold(prefix).split(" ");
  const full = fold(name).split(" ");
  return words.length <= full.length && words.every((word, i) => word === full[i]);
}

/** The fewest leading words of `name` that are a word prefix of no name in `others`. */
export function shortestUnique(name: string, others: readonly string[]): string {
  const words = name.split(" ");
  for (let n = 1; n <= words.length; n++) {
    const candidate = words.slice(0, n).join(" ");
    if (!others.some((other) => isWordPrefix(candidate, other))) {
      return candidate;
    }
  }
  return name;
}

/** Compare strings by code point, the order of their UTF-8 bytes. */
export function compareCodePoints(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    let x = a.charCodeAt(i);
    let y = b.charCodeAt(i);
    if (x !== y) {
      if (x >= 0xd800 && y >= 0xd800) {
        x = x >= 0xe000 ? x - 0x800 : x + 0x2000;
        y = y >= 0xe000 ? y - 0x800 : y + 0x2000;
      }
      return x - y;
    }
  }
  return a.length - b.length;
}
