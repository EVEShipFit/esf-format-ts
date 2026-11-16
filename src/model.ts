// Fits as type IDs, the way load() returns them and save() takes them (SPEC §5, §10).

/**
 * Whether an item is offline, online or running, when that is not its default (esf/1 spec §6.4).
 *
 * - `"off"`: offline, fitted but not using powergrid or CPU.
 * - `"on"`: online, but not running, like a gun that is not shooting.
 * - `"heat"`: overloaded, which also means running.
 *
 * By default, a fitted or deployed item runs when its type is `active`, and is
 * online otherwise. An implant or booster is online by default, and only takes `"off"`.
 * A stored item, in cargo, a bay or a hold, has no state at all.
 */
export type State = "off" | "on" | "heat";

/**
 * A rack of slots (esf/1 spec §5).
 *
 * - `"high"`: the high slot rack.
 * - `"mid"`: the mid slot rack.
 * - `"low"`: the low slot rack.
 * - `"rig"`: the rig rack.
 * - `"sub"`: the subsystem rack. Not the same as the hold `"subsystem"`.
 * - `"svc"`: the structure service rack.
 * - `"tube"`: the fighter launch tubes, for fighters only.
 */
export type Rack = "high" | "mid" | "low" | "rig" | "sub" | "svc" | "tube";

/**
 * A special hold (esf/1 spec §5.1).
 *
 * - `"ammo"`: the Ammo Hold.
 * - `"booster"`: the Booster Hold.
 * - `"command"`: the Command Center Hold.
 * - `"corpse"`: the Corpse Hold.
 * - `"depot"`: the Mobile Depot Hold.
 * - `"expedition"`: the Expedition Hold.
 * - `"fleet"`: the Fleet Hangar.
 * - `"frigate"`: the Frigate Escape Bay.
 * - `"fuel"`: the Fuel Bay.
 * - `"gas"`: the Gas Hold.
 * - `"ice"`: the Ice Hold.
 * - `"infrastructure"`: the Infrastructure Hold.
 * - `"maintenance"`: the Ship Maintenance Bay.
 * - `"mineral"`: the Mineral Hold.
 * - `"mining"`: the Mining Hold.
 * - `"moon"`: the Moon Material Output Bay.
 * - `"planetary"`: the Planetary Commodities Hold.
 * - `"quafe"`: the Quafe Hold.
 * - `"subsystem"`: the Subsystem Hold, for spare subsystems. Not the same as the rack `"sub"`.
 */
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

/**
 * Where an entry goes, when not where its type goes by default (esf/1 spec §5).
 *
 * An item goes where its `Kind` says, so most entries leave this out. Set it to store an
 * item somewhere else, like a spare Damage Control II in `"cargo"`.
 * So a drone with no location is out in space, and a fighter is in a launch tube. Set
 * `"bay"` to keep either one in its bay.
 *
 * - A {@link Rack}, like `"high"`, is for empty slots, and for an item put in a given
 *   `slot`. Otherwise, an item never names its rack.
 * - `"cargo"` is the cargo hold.
 * - `"bay"` is the drone bay or fighter bay, for drones and fighters that are not out in
 *   space or in a tube.
 * - A {@link Hold}, like `"fleet"`, only makes sense on a hull that has that hold, but the
 *   library does not check that.
 */
export type Location = Rack | "cargo" | "bay" | Hold;

/**
 * One line of a fit: an item, an empty slot, or another fit carried by this one.
 *
 * Only `type` is needed; every other field is left out when it is the default.
 * Entries can be in any order, except within a rack: there, the order is the slot order,
 * unless an entry sets `slot`.
 */
export interface Entry {
  /**
   * The type ID of the item, like 2889 for a 200mm AutoCannon II.
   *
   * Leave it out for an empty slot. An empty slot must set `location` to its rack, like `"high"`.
   */
  type?: number;
  /**
   * How many there are. Left out means one.
   *
   * What a count means depends on where the item goes (esf/1 spec §6.2). For a fitted
   * module or a deployed drone, it is that many of the same line: 3 guns take 3 slots.
   * For a stored item, it is the size of one stack. For a fighter, it is how many are
   * in the squadron; left out means a full squadron. A plugged-in implant or booster takes
   * no count.
   */
  count?: number;
  /**
   * The name of another fit in the same list, which this entry carries.
   *
   * Only for a ship, structure or container. The other fit must have this entry's
   * `type` as its `hull` and this as its `name`, ignoring case. For example,
   * a Heron with fit name "Scout" and location `"frigate"` carries that fit in the
   * Frigate Escape Bay. Left out means an unfitted ship or an empty container.
   */
  fitName?: string;
  /** The type ID of the charge loaded into this item, like ammunition or a script. Left out for none. */
  charge?: number;
  /**
   * How many of `charge` are loaded into each item.
   *
   * Left out means a full load: the item's capacity divided by the charge's volume, rounded
   * down. Only set together with `charge`.
   */
  chargeCount?: number;
  /**
   * The type ID of the mutaplasmid applied to this item, which makes it abyssal.
   *
   * `type` is then the base type the mutaplasmid applies to, and `overrides` holds the
   * rolled values. Left out for a normal item.
   */
  mutaplasmid?: number;
  /**
   * Attribute values that replace the type's own, by attribute ID, like `{ 20: 524 }` for speedFactor.
   *
   * Each value is the new base value, not a change on top of it. Attributes not listed
   * keep the type's value. Left out or empty for none.
   */
  overrides?: Record<number, number>;
  /** Whether the item is offline, online or running. Left out means its default; see {@link State}. */
  state?: State;
  /** Where the item goes. Left out means where its type goes by default; see {@link Location}. */
  location?: Location;
  /**
   * The slot in the `location` rack, counting from 1, like 3 for the third high slot.
   *
   * Set `location` to the rack too; the item must go in that rack. It cannot be combined
   * with `count`, except for a fighter in `"tube"`, where `count` is still the size of
   * the squadron. Each slot can be pinned only once. Left out means the next free slot.
   * `load()` never sets this: it gives the rack in slot order, with empty slots in between.
   */
  slot?: number | undefined;
}

/** `T` with every optional field also allowed to be undefined. */
export type Loose<T> = { [K in keyof T]?: T[K] | undefined };

/** `value` without its undefined fields. */
export function compact<T extends object>(value: Loose<T>): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/**
 * One fit: a ship and everything on it, or a plain list of items.
 *
 * A list of fits is one document. A fit that another fit carries, through `Entry.fitName`,
 * exists only there. Any other fit stands on its own.
 */
export interface EsfFit {
  /**
   * The type ID of the ship, structure or container, like 587 for the Rifter.
   *
   * Leave it out for a fit without a ship, like the items in a contract: then every entry is
   * stored in cargo, and the fit has no slots and no `mode`.
   */
  hull?: number;
  /** The name of the fit, like "Shield Buffer". Left out for no name. */
  name?: string;
  /**
   * The type ID of the tactical mode the ship is in, like the Hecate's Sharpshooter Mode.
   *
   * Only for a hull that has tactical modes; see `Catalog.modes`. Left out for none.
   */
  mode?: number;
  /** The lines of the fit: items, empty slots and fits it carries. */
  entries: Entry[];
}
