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
`EsfError` when a rule is broken. It says where: `line` for text, or `fit` and
`entry` (counting from 1) for fits. `reason` is the message without the place.

## Fits

An `EsfFit` is one fit: `hull`, `name`, tactical `mode` and its `entries`.
`hull` is absent for a fit without a ship. A document can hold more than one
fit.

Each `Entry` is one line of the fit. An absent field means the default:

| field         | what it is                                                                 | absent means                        |
| ------------- | -------------------------------------------------------------------------- | ----------------------------------- |
| `type`        | The type ID.                                                               | An empty slot.                      |
| `count`       | How many.                                                                  | One; for fighters, a full squadron. |
| `fitName`     | The name of another fit in the list, which this ship or container carries. | Carries no fit.                     |
| `charge`      | The charge loaded.                                                         |                                     |
| `chargeCount` | How many charges.                                                          | A full load.                        |
| `mutaplasmid` | The mutaplasmid applied.                                                   |                                     |
| `overrides`   | Attribute values by attribute ID, such as `{ 50: 31.5 }`.                  |                                     |
| `state`       | `"off"`, `"on"` or `"heat"`.                                               | Active if the type can be, else on. |
| `location`    | `"cargo"`, `"bay"` or another hold; a rack only for an empty slot.         | Where the type goes by default.     |

## The Catalog

The library holds no game data. You give it a `Catalog`: an object that looks
up types and attributes in your copy of the SDE.

```ts
import type { Catalog } from "@eveshipfit/esf-format";

const catalog: Catalog = {
  type: (folded) => ...,
  typeById: (typeId) => ...,
  attribute: (folded) => ...,
  attributeById: (attributeId) => ...,

  // Optional. Without them, no hull has tactical modes and no type has mutaplasmids.
  modes: (hullId) => ...,
  mutaplasmids: (typeId) => ...,
};
```

Names are looked up folded: index them with `fold(name)`. Where names are
shared, published wins, then the lowest ID (§4.2).
[tests/catalog.ts](https://github.com/EVEShipFit/esf-format-ts/blob/main/tests/catalog.ts)
is a complete example.

## Tests

The test cases live in [esf-format](https://github.com/EVEShipFit/esf-format).
You need Node.js 22.18 or later, and [uv](https://docs.astral.sh/uv/):

```
git clone --branch v1.0 https://github.com/EVEShipFit/esf-format
npm ci
uv run --project esf-format/tools esf-test -- node tests/program.ts
npm run lint
npm test
```
