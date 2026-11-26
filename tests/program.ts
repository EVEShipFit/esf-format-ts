// The program the esf-format test runner calls: program.ts check|canonical|binary|extra.

import { readFileSync } from "node:fs";
import { EsfError, load, loadDocument, save, saveBinary, toBase64url } from "../src/index.ts";
import { JsonCatalog, catalogPath } from "./catalog.ts";

const command = process.argv[2];
const catalog = new JsonCatalog(catalogPath());
try {
  const data = readFileSync(0);
  if (command === "extra") {
    for (const e of loadDocument(data, catalog).extra) {
      const line =
        e.kind === "text"
          ? { name: e.name, version: e.version, text: e.text }
          : { field: e.field, bytes: toBase64url(e.bytes) };
      process.stdout.write(`${JSON.stringify(line)}\n`);
    }
  } else {
    const fits = load(data, catalog);
    if (command === "canonical") {
      process.stdout.write(save(fits, catalog));
    } else if (command === "binary") {
      process.stdout.write(saveBinary(fits, catalog));
    }
  }
} catch (e) {
  if (!(e instanceof EsfError)) {
    throw e;
  }
  process.stderr.write(`invalid: ${e.message}\n`);
  process.exitCode = 1;
}
