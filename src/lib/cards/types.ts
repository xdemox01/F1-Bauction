// Core card domain types. Kept framework-free so they can be shared by the
// UI, seed generation, tests and (later) server-side game logic.

export const CARD_CATEGORIES = ["driver", "car", "pit_crew"] as const;
export type CardCategory = (typeof CARD_CATEGORIES)[number];

/** Fictional game rarity tiers (not official F1 classifications). Lowest first. */
export const RARITIES = ["common", "rare", "epic", "mythic", "apex"] as const;
export type Rarity = (typeof RARITIES)[number];

/** Fictional card editions. A driver can have several editions in one season. */
export const EDITIONS = [
  "standard",
  "rookie",
  "elite",
  "championship",
  "legendary",
  "special_event",
] as const;
export type Edition = (typeof EDITIONS)[number];

export const ACQUISITION_METHODS = [
  "starter",
  "pack",
  "auction",
  "trade",
  "reward",
  "randoms_reward",
  "admin_grant",
] as const;
export type AcquisitionMethod = (typeof ACQUISITION_METHODS)[number];

export interface DriverAttributes {
  pace: number;
  racecraft: number;
  consistency: number;
  tyre_management: number;
  wet_weather: number;
  experience: number;
}

export interface CarAttributes {
  pace: number;
  aero: number;
  straight_line_speed: number;
  tyre_management: number;
  reliability: number;
}

export interface PitCrewAttributes {
  pit_stop_speed: number;
  consistency: number;
  coordination: number;
  reliability: number;
}

export interface AttributesByCategory {
  driver: DriverAttributes;
  car: CarAttributes;
  pit_crew: PitCrewAttributes;
}

interface TemplateBase {
  /** Stable, human-readable identifier, e.g. "2026-driver-standard-max-verstappen". */
  slug: string;
  edition: Edition;
  rarity: Rarity;
  season: number;
  name: string;
  teamId: string;
  /** True when attributes are game estimates rather than derived from measured data. */
  estimated: boolean;
  ratingNote: string;
  /** Limited editions carry serial numbers 1..serialLimit. Null = unlimited. */
  serialLimit: number | null;
}

export interface DriverCardTemplate extends TemplateBase {
  category: "driver";
  driverId: string;
  attributes: DriverAttributes;
}

export interface CarCardTemplate extends TemplateBase {
  category: "car";
  attributes: CarAttributes;
}

export interface PitCrewCardTemplate extends TemplateBase {
  category: "pit_crew";
  attributes: PitCrewAttributes;
}

export type CardTemplate = DriverCardTemplate | CarCardTemplate | PitCrewCardTemplate;

/** A template plus derived values the UI needs. */
export type RatedCardTemplate = CardTemplate & { overall: number };

export interface Team {
  id: string;
  name: string;
  /** Neutral game accent colour, not a team trademark colour. */
  accent: string;
}

export interface Driver {
  id: string;
  fullName: string;
  /** ISO 3166-1 alpha-3 code. */
  nationality: string;
  dataSource: string;
  dataUpdatedAt: string;
}

export interface DriverSeason {
  driverId: string;
  season: number;
  teamId: string;
  /** Null until verified against the F1 data source. */
  carNumber: number | null;
}
