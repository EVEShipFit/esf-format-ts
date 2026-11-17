// The errors of esf/1.

/** Where a broken rule is: a line of text, or a fit and entry, counting from 1. */
export interface Where {
  line?: number;
  fit?: number;
  entry?: number;
}

/**
 * An esf/1 error, and where it is.
 *
 * Every error is one of three kinds. Catch `EsfFormatError`, `EsfCatalogError` or `EsfRuleError`
 * to handle one kind, or this class to handle them all.
 */
export abstract class EsfError extends Error {
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

/**
 * The data is not a well-formed esf/1 document.
 *
 * The text does not follow the grammar, the binary form or base64url is broken, or a fit name
 * cannot be written.
 */
export class EsfFormatError extends EsfError {
  override name = "EsfFormatError";
}

/**
 * The catalog does not know a name or ID, or a name matches more than one type.
 *
 * This often means the catalog is older than the fit.
 */
export class EsfCatalogError extends EsfError {
  override name = "EsfCatalogError";
}

/**
 * The fit breaks a rule of esf/1.
 *
 * The document is well formed and the catalog knows every type, but the fit is not valid. For
 * example, a module is in the wrong rack.
 */
export class EsfRuleError extends EsfError {
  override name = "EsfRuleError";
}

export function at(error: EsfError, where?: Where): EsfError {
  const Kind = error.constructor as new (reason: string, where?: Where) => EsfError;
  return new Kind(error.reason, where);
}

function prefix({ line, fit, entry }: Where): string {
  if (fit !== undefined) {
    return entry === undefined
      ? `fit ${String(fit)}: `
      : `fit ${String(fit)}, entry ${String(entry)}: `;
  }
  return line === undefined ? "" : `line ${String(line)}: `;
}
