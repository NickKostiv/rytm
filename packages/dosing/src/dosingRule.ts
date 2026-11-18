export const ROUTES = ['im', 'iv', 'io', 'po', 'nebulized', 'iv_infusion'] as const;
export type Route = (typeof ROUTES)[number];

export type Concentration = { amountMg: number; volumeMl: number };

export type PerKgDose = { kind: 'per_kg'; mgPerKg: number };

export type WeightBand = { minKg: number | null; maxKgExclusive: number | null; doseMg: number; label: string };

export type BandDose = { kind: 'band'; bands: WeightBand[] };

export type RepeatInterval = { minMinutes: number; maxMinutes: number };

export type RoundingDirection = 'down' | 'nearest';

export type Rounding = 'none' | { stepMg: number; direction: RoundingDirection };

export type RuleSource = {
  registryId: string;
  orderNumber: string;
  orderDate: string;
  annex: string | null;
  section: string;
  page: number;
  quote: string;
};

export type DosingRule = {
  id: string;
  drug: string;
  indication: string;
  population: string | null;
  route: Route;
  concentration: Concentration | null;
  concentrationText: string | null;
  dose: PerKgDose | BandDose;
  maxSingleDoseMg: number | null;
  repeat: RepeatInterval | null;
  rounding: Rounding;
  source: RuleSource;
};

export type SourceValidity = 'unknown' | 'in_force' | 'superseded' | 'needs_review';

export type UsableSourceValidity = Extract<SourceValidity, 'unknown' | 'in_force'>;
