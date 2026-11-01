// Fits as type IDs, the way load() returns them and save() takes them (SPEC §5, §10).

/** The state of an item, when not its default (§6.4). */
export type State = "off" | "on" | "heat";

/** A rack of slots (§5). */
export type Rack = "high" | "mid" | "low" | "rig" | "sub" | "svc";

/** A special hold (§5.1). */
export type Hold =
  | "ammo"
  | "booster"
  | "command"
  | "corpse"
  | "depot"
  | "expedition"
  | "fleet"
  | "frigate"
  | "fuel"
  | "gas"
  | "ice"
  | "infrastructure"
  | "maintenance"
  | "mineral"
  | "mining"
  | "moon"
  | "planetary"
  | "quafe"
  | "subsystem";

/** Where an entry is, when not where its type goes by default (§5). */
export type Location = Rack | "cargo" | "bay" | Hold;

/** One line of a fit. */
export interface Entry {
  type?: number;
  count?: number;
  fitName?: string;
  charge?: number;
  chargeCount?: number;
  mutaplasmid?: number;
  overrides?: Record<number, number>;
  state?: State;
  location?: Location;
}

/** `T` with every optional field also allowed to be undefined. */
export type Loose<T> = { [K in keyof T]?: T[K] | undefined };

/** `value` without its undefined fields. */
export function compact<T extends object>(value: Loose<T>): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/** A fit: its hull and its entries. */
export interface EsfFit {
  hull?: number;
  name?: string;
  mode?: number;
  entries: Entry[];
}
