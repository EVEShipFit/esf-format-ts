import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";
import { parse } from "smol-toml";
import {
  EsfError,
  fromBase64url,
  load,
  loadDocument,
  save,
  saveBinary,
  type Extra,
} from "../src/index.ts";
import { catalogPath } from "./catalog.ts";
import { catalog } from "./fixture.ts";

const root = dirname(catalogPath());
const cases = ["valid", "invalid"].flatMap((kind) =>
  readdirSync(join(root, kind)).map((name) => `${kind}/${name}`),
);

interface ExtraToml {
  name?: string;
  version?: number;
  text?: string;
  field?: number;
  bytes?: string;
}

function expectedExtra(path: string): Extra[] {
  const file = join(path, "extra.toml");
  if (!existsSync(file)) {
    return [];
  }
  const { extra } = parse(readFileSync(file, "utf-8")) as unknown as { extra: ExtraToml[] };
  return extra.map((e) =>
    e.bytes === undefined
      ? {
          kind: "text",
          name: e.name as string,
          version: e.version as number,
          text: e.text as string,
        }
      : { kind: "binary", field: e.field as number, bytes: fromBase64url(e.bytes) },
  );
}

function input(path: string): Uint8Array {
  const text = join(path, "input.esf");
  return existsSync(text)
    ? readFileSync(text)
    : fromBase64url(readFileSync(join(path, "input.b64"), "utf-8"));
}

test.each(cases)("%s", (name) => {
  const path = join(root, name);
  if (name.startsWith("invalid/")) {
    expect(() => load(input(path), catalog)).toThrow(EsfError);
    return;
  }
  const canonical = readFileSync(join(path, "canonical.esf"), "utf-8");
  const binary = fromBase64url(readFileSync(join(path, "canonical.b64"), "utf-8"));
  const fits = load(input(path), catalog);
  expect(save(fits, catalog), "canonical of input").toBe(canonical);
  expect(save(load(canonical, catalog), catalog), "canonical of canonical.esf").toBe(canonical);
  expect(saveBinary(fits, catalog), "binary of input").toStrictEqual(binary);
  expect(save(load(binary, catalog), catalog), "canonical of canonical.b64").toBe(canonical);
  const document = loadDocument(input(path), catalog);
  expect(document.fits, "loadDocument fits").toStrictEqual(fits);
  expect(document.extra, "loadDocument extra").toStrictEqual(expectedExtra(path));
});
