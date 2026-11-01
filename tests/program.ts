// The program the esf-format test runner calls: program.ts check|canonical|binary.

import { readFileSync } from "node:fs";
import { EsfError, load, save, saveBinary } from "../src/index.ts";
import { JsonCatalog, catalogPath } from "./catalog.ts";

const command = process.argv[2];
const catalog = new JsonCatalog(catalogPath());
try {
  const fits = load(readFileSync(0), catalog);
  if (command === "canonical") {
    process.stdout.write(save(fits, catalog));
  } else if (command === "binary") {
    process.stdout.write(saveBinary(fits, catalog));
  }
} catch (e) {
  if (!(e instanceof EsfError)) {
    throw e;
  }
  process.stderr.write(`invalid: ${e.message}\n`);
  process.exitCode = 1;
}
