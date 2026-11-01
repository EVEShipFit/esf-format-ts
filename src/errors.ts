// The error for a document or fit that breaks a rule of esf/1.

/** Where a broken rule is: a line of text, or a fit and entry, counting from 1. */
export interface Where {
  line?: number;
  fit?: number;
  entry?: number;
}

/** A broken rule of esf/1, and where it is. */
export class EsfError extends Error {
  override name = "EsfError";
  readonly reason: string;
  readonly line: number | undefined;
  readonly fit: number | undefined;
  readonly entry: number | undefined;

  constructor(reason: string, where: Where = {}) {
    super(prefix(where) + reason);
    this.reason = reason;
    this.line = where.line;
    this.fit = where.fit;
    this.entry = where.entry;
  }
}

function prefix({ line, fit, entry }: Where): string {
  if (fit !== undefined) {
    return entry === undefined
      ? `fit ${String(fit)}: `
      : `fit ${String(fit)}, entry ${String(entry)}: `;
  }
  return line === undefined ? "" : `line ${String(line)}: `;
}
