# esf-format

[![npm](https://img.shields.io/npm/v/@eveshipfit/esf-format.svg)](https://www.npmjs.com/package/@eveshipfit/esf-format)
[![CI](https://github.com/EVEShipFit/esf-format-ts/actions/workflows/test.yml/badge.svg)](https://github.com/EVEShipFit/esf-format-ts/actions/workflows/test.yml)

[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/S5V5BkvNf7)

Read and write [esf/1](https://github.com/EVEShipFit/esf-format), the
plain-text format for EVE Online ship fits. Text, canonical and binary forms.
No dependencies. Works in Node.js and in the browser.

```
npm install @eveshipfit/esf-format
```

## Usage

```ts
import {
  fromBase64url,
  load,
  save,
  saveBinary,
  toBase64url,
  type EsfFit,
} from "@eveshipfit/esf-format";

const fit: EsfFit = {
  hull: 587, // Rifter
  name: "Shield Buffer",
  entries: [
    { type: 2889, count: 3, charge: 21898 }, // 3 guns, a full load of ammo each
    { location: "high" }, // an empty high slot
    { type: 448, state: "off" }, // an offline module
    { type: 2048 }, // goes in its own rack
    { type: 2456, count: 5 }, // 5 drones
    { type: 21898, count: 1000, location: "cargo" },
  ],
};

const text = save([fit], catalog); // canonical text
const data = saveBinary([fit], catalog); // binary, as a Uint8Array
const fits = load(data, catalog); // text or binary

const url = toBase64url(data); // the binary form in a URL
const back = fromBase64url(url);
```

`save()` and `saveBinary()` take entries in any order, and check every rule
of the spec. `load()` returns fits in canonical form. All three throw an
`EsfError` when the data or a fit is not valid. It says where: `line` for text, or `fit` and
`entry` (counting from 1) for fits. `reason` is the message without the place.

Catch a subclass to handle one kind of error:

| Error             | When                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| `EsfFormatError`  | The data is not a well-formed document: broken text, binary or base64url, or a fit name that cannot be written. |
| `EsfCatalogError` | The catalog does not know a name or ID, or a name matches more than one type.                                   |
| `EsfRuleError`    | The fit breaks a rule, like a module in the wrong rack.                                                         |

## Extra data

A document can hold more than fits: a text block with another header, like
`%fleet/1`, or another field in the binary form. `load()` skips these.
`loadDocument()` returns them too:

```ts
import { binaryField, loadDocument, save, saveBinary } from "@eveshipfit/esf-format";

const { fits, extra } = loadDocument(data, catalog);
for (const e of extra) {
  if (e.kind === "text") {
    // e.name is "fleet", e.version is 1, e.text is the block after its header line
  } else {
    // e.field is the field number, e.bytes its content
  }
}

// To write extra data, append it.
const text = save(fits, catalog) + "%fleet/1\n" + fleetText;
const data = new Uint8Array([...saveBinary(fits, catalog), ...binaryField(2, fleetBytes)]);
```

`extra` is in document order, and empty when there is none. Only
length-delimited binary fields come back. `binaryField()` takes a field
number from 2 to 536870911, and throws a `RangeError` for any other.
`loadDocument()` throws an `EsfFormatError` for a text block whose version is
above 4294967295; `load()` skips that block.

## Fits

An `EsfFit` is one fit: `hull`, `name`, tactical `mode` and its `entries`.
`hull` is absent for a fit without a ship. A document can hold more than one
fit.

Each `Entry` is one line of the fit. An absent field means the default:

| field         | what it is                                                                    | absent means                        |
| ------------- | ----------------------------------------------------------------------------- | ----------------------------------- |
| `type`        | The type ID.                                                                  | An empty slot.                      |
| `count`       | How many.                                                                     | One; for fighters, a full squadron. |
| `fitName`     | The name of another fit in the list, which this ship or container carries.    | Carries no fit.                     |
| `charge`      | The charge loaded.                                                            |                                     |
| `chargeCount` | How many charges.                                                             | A full load.                        |
| `mutaplasmid` | The mutaplasmid applied.                                                      |                                     |
| `overrides`   | Dogma attribute values by attribute ID, such as `{ 50: 31.5 }`.               |                                     |
| `state`       | `"off"`, `"on"` or `"heat"`.                                                  | Active if the type can be, else on. |
| `location`    | `"cargo"`, `"bay"` or another hold; a rack for an empty slot, or with `slot`. | Where the type goes by default.     |
| `slot`        | The slot in the `location` rack, counting from 1.                             | The next free slot.                 |

`load()` never sets `slot`: it returns each rack in slot order, with empty slots between.
The launch tubes are the rack `"tube"`, one fighter squadron per tube.

## The Catalog

The library holds no game data. You give it a `Catalog`: an object that looks
up types and dogma attributes in your copy of the SDE.

```ts
import type { Catalog } from "@eveshipfit/esf-format";

const catalog: Catalog = {
  type: (foldedName) => ...,
  typeById: (typeId) => ...,
  attribute: (foldedName) => ...,
  attributeById: (attributeId) => ...,

  // Optional. Without them, no hull has tactical modes and no type has mutaplasmids.
  modes: (hullId) => ...,
  mutaplasmids: (typeId) => ...,
};
```

Each method and field says what to return and where in the SDE it comes
from. `sde` has helpers for the parts that take more than a lookup:

```ts
import { sde, type TypeRecord } from "@eveshipfit/esf-format";

const typeNames = sde.nameIndex(
  types,
  (t) => t._key,
  (t) => t.name.en,
  (t) => t.published ?? false,
);

// effects: effectID -> effectCategoryID; attributes: dogma attributeID -> value

const record: TypeRecord = {
  id: t._key,
  name: t.name.en,
  kind: sde.kind(group.categoryID, t.groupID, effects.keys()),
  active: sde.active(effects),
  capacity: t.capacity ?? 0,
  volume: t.volume ?? 0,
  squadronSize: sde.squadronSize(attributes),
};
```

[examples/sde-jsonl-catalog.ts](https://github.com/EVEShipFit/esf-format-ts/blob/main/examples/sde-jsonl-catalog.ts)
is a complete example on the official SDE in JSONL: copy it into your project.

## ESI

ESI gives each item in a ship a `location_flag`. `esi` turns it into a
location and a slot:

```ts
import { esi, type Entry } from "@eveshipfit/esf-format";

const entry: Entry = { type, location: esi.location(flag) ?? "cargo", slot: esi.slot(flag) };
```

`HiSlot2` gives `"high"` and slot 3, and `ShipHangar` gives `"maintenance"`.
A flag that is not inside a ship, like `Hangar`, gives `undefined`; the
example puts those items in the cargo hold.

Only a ship, structure or container can be a fit's hull. Check that
`catalog.typeById(typeId)` gives a type, and that `canBeHull(type.kind)` is true,
before you use it as one.

## Tests

The test cases live in [esf-format](https://github.com/EVEShipFit/esf-format).
You need Node.js 22.18 or later, and [uv](https://docs.astral.sh/uv/):

```
git clone --branch load-document https://github.com/EVEShipFit/esf-format
npm ci
uv run --project esf-format/tools esf-test -- node tests/program.ts
npm run lint
npm test
```
