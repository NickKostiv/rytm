import { MOH_DOSING_RULES, normalizeNumberText } from '@rytm/dosing';
import type { Route } from '@rytm/dosing';

export const NOT_IN_LIST = 'other';

type NotInList = typeof NOT_IN_LIST;

export type DoseExtraction = {
  isDoseRequest: boolean;
  drug: string | NotInList | null;
  indication: string | NotInList | null;
  route: Route | NotInList | null;
  weightKg: number | null;
};

export type StructuredOutput = { stopReason: string | null; text: string };

export const ROUTE_WORDING = {
  im: 'в/м, внутрішньомʼязово',
  iv: 'в/в, внутрішньовенно',
  io: 'в/к, внутрішньокістково',
  po: 'перорально, всередину',
  nebulized: 'через небулайзер, інгаляційно',
  iv_infusion: 'в/в інфузія, крапельно',
} satisfies Record<Route, string>;

const isRoute = (value: string): value is Route => Object.hasOwn(ROUTE_WORDING, value);

const EXTRACTION_DRUGS = [...new Set(MOH_DOSING_RULES.map(({ drug }) => drug))];
const EXTRACTION_INDICATIONS = [...new Set(MOH_DOSING_RULES.map(({ indication }) => indication))];
const EXTRACTION_ROUTES = Object.keys(ROUTE_WORDING);

const nullableEnum = (values: string[]): Record<string, unknown> => ({
  anyOf: [{ type: 'string', enum: [...values, NOT_IN_LIST] }, { type: 'null' }],
});

export const DOSE_EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    isDoseRequest: { type: 'boolean' },
    drug: nullableEnum(EXTRACTION_DRUGS),
    indication: nullableEnum(EXTRACTION_INDICATIONS),
    route: nullableEnum(EXTRACTION_ROUTES),
    weightKg: { anyOf: [{ type: 'number' }, { type: 'null' }] },
  },
  required: ['isDoseRequest', 'drug', 'indication', 'route', 'weightKg'],
  additionalProperties: false,
};

const END_TURN = 'end_turn';
const LOCALE = 'uk';

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type Canonical = { value: string | null } | null;

const canonicalListValue = (value: unknown, list: readonly string[]): Canonical => {
  if (value === null) return { value: null };
  if (typeof value !== 'string') return null;
  const lowered = value.trim().toLocaleLowerCase(LOCALE);
  const match = [...list, NOT_IN_LIST].find((item) => item.toLocaleLowerCase(LOCALE) === lowered);
  return match === undefined ? null : { value: match };
};

const toRoute = (value: string | null): Route | NotInList | null => {
  if (value === null || value === NOT_IN_LIST) return value;
  return isRoute(value) ? value : null;
};

const KILOGRAM_WEIGHT = /(?<![\d.])(\d+(?:\.\d+)?)\s*(?:кг|kg|кілограм\p{L}*)(?!\p{L})(?!\s*\/)/giu;

const isWeightInUserText = (weightKg: number, userTexts: string[]): boolean =>
  userTexts.some((text) => [...normalizeNumberText(text).matchAll(KILOGRAM_WEIGHT)].some(([, number]) => Number(number) === weightKg));

const toStatedWeight = (value: unknown, userTexts: string[]): number | null =>
  typeof value === 'number' && Number.isFinite(value) && isWeightInUserText(value, userTexts) ? value : null;

export const parseDoseExtraction = (output: StructuredOutput, userTexts: string[]): DoseExtraction | null => {
  if (output.stopReason !== END_TURN) return null;
  const parsed = parseJson(output.text);
  if (!isRecord(parsed) || typeof parsed.isDoseRequest !== 'boolean') return null;
  if (parsed.weightKg !== null && typeof parsed.weightKg !== 'number') return null;
  const drug = canonicalListValue(parsed.drug, EXTRACTION_DRUGS);
  const indication = canonicalListValue(parsed.indication, EXTRACTION_INDICATIONS);
  const route = canonicalListValue(parsed.route, EXTRACTION_ROUTES);
  if (!drug || !indication || !route) return null;
  return {
    isDoseRequest: parsed.isDoseRequest,
    drug: drug.value,
    indication: indication.value,
    route: toRoute(route.value),
    weightKg: toStatedWeight(parsed.weightKg, userTexts),
  };
};
