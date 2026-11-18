import { decimalFromText, decimalToText, divideExactly, multiplyDecimals, type Decimal } from '#decimal';
import { normalizeNumberText } from '#numberText';

export type VolumeSourceUnit = { text: string; isWeb: boolean };

export type StatedVolumeCheck = { status: 'verified'; isWebBound: boolean } | { status: 'unverified' };

type Amount = { low: Decimal; high: Decimal | null };

type VolumeToken = { amount: Amount; suffix: string; key: string; start: number; end: number };

type DoseToken = { amountMg: Amount; isPerKg: boolean; key: string };

type ConcentrationToken = { amountMg: Decimal; volumeMl: Decimal; key: string };

const NUMBER = String.raw`\d+(?:\.\d+)?`;
const RANGE = String.raw`(${NUMBER})(?:\s*-\s*(${NUMBER}))?`;
const LETTER = 'а-яіїєґa-z';
const VOLUME_PATTERN = new RegExp(String.raw`${RANGE}\s*мл((?:\s*\/\s*[${LETTER}]+)*)(?![${LETTER}\d])`, 'giu');
const DOSE_PATTERN = new RegExp(String.raw`${RANGE}\s*(мкг|мг|г)(\s*\/\s*кг)?(?![${LETTER}\d])(?!\s*\/)`, 'giu');
const PER_ML_PATTERN = new RegExp(String.raw`(${NUMBER})\s*(мкг|мг)\s*\/\s*мл(?![${LETTER}])`, 'giu');
const PER_VOLUME_PATTERN = new RegExp(String.raw`(${NUMBER})\s*мг\s*\/\s*(${NUMBER})\s*мл(?![${LETTER}])`, 'giu');
const PERCENT_PATTERN = new RegExp(String.raw`(${NUMBER})\s*%`, 'gu');
const RATIO_PATTERN = /1\s*:\s*(\d+)(?![\d.:])/gu;
const NUMBER_PART_BEFORE = /(?:[\d.:]|\d\s*-\s*|\/\s*)$/u;
const SPACES = /\s+/g;
const PER_KG_SUFFIX = '/кг';
const MCG = 'мкг';
const GRAM = 'г';
const THOUSAND: Decimal = { units: 1000n, scale: 0 };
const THOUSANDTH: Decimal = { units: 1n, scale: 3 };
const ONE_ML: Decimal = { units: 1n, scale: 0 };
const HUNDRED_ML: Decimal = { units: 100n, scale: 0 };

const isStandalone = (text: string, index: number): boolean => !NUMBER_PART_BEFORE.test(text.slice(0, index));

const standaloneMatches = (text: string, pattern: RegExp): RegExpExecArray[] =>
  [...text.matchAll(pattern)].filter((match) => isStandalone(text, match.index));

const parseAmount = (lowText: string | undefined, highText: string | undefined): Amount | null => {
  const low = decimalFromText(lowText ?? '');
  if (!low) return null;
  if (highText === undefined) return { low, high: null };
  const high = decimalFromText(highText);
  return high ? { low, high } : null;
};

const amountKey = ({ low, high }: Amount): string => (high ? `${decimalToText(low)}-${decimalToText(high)}` : decimalToText(low));

const scaleAmount = ({ low, high }: Amount, factor: Decimal): Amount => ({
  low: multiplyDecimals(low, factor),
  high: high ? multiplyDecimals(high, factor) : null,
});

const toMilligrams = (amount: Amount, unit: string): Amount => {
  if (unit === MCG) return scaleAmount(amount, THOUSANDTH);
  if (unit === GRAM) return scaleAmount(amount, THOUSAND);
  return amount;
};

const findVolumes = (text: string): VolumeToken[] =>
  standaloneMatches(text, VOLUME_PATTERN).flatMap((match) => {
    const amount = parseAmount(match[1], match[2]);
    if (!amount) return [];
    const suffix = (match[3] ?? '').replace(SPACES, '').toLowerCase();
    return [{ amount, suffix, key: `${amountKey(amount)}мл${suffix}`, start: match.index, end: match.index + match[0].length }];
  });

const findDoses = (text: string): DoseToken[] =>
  standaloneMatches(text, DOSE_PATTERN).flatMap((match) => {
    const amount = parseAmount(match[1], match[2]);
    const unit = (match[3] ?? '').toLowerCase();
    if (!amount) return [];
    const isPerKg = match[4] !== undefined;
    return [{ amountMg: toMilligrams(amount, unit), isPerKg, key: `${amountKey(amount)}${unit}${isPerKg ? PER_KG_SUFFIX : ''}` }];
  });

const concentration = (amountMg: Decimal | null, volumeMl: Decimal | null, key: string): ConcentrationToken[] =>
  amountMg && volumeMl && amountMg.units > 0n && volumeMl.units > 0n ? [{ amountMg, volumeMl, key }] : [];

const findConcentrations = (text: string): ConcentrationToken[] => [
  ...standaloneMatches(text, PER_ML_PATTERN).flatMap(([, value = '', unit = '']) => {
    const amount = decimalFromText(value);
    const amountMg = amount && unit.toLowerCase() === MCG ? multiplyDecimals(amount, THOUSANDTH) : amount;
    return concentration(amountMg, ONE_ML, `${amount ? decimalToText(amount) : value}${unit.toLowerCase()}/мл`);
  }),
  ...standaloneMatches(text, PER_VOLUME_PATTERN).flatMap(([, amountText = '', volumeText = '']) => {
    const amountMg = decimalFromText(amountText);
    const volumeMl = decimalFromText(volumeText);
    return amountMg && volumeMl ? concentration(amountMg, volumeMl, `${decimalToText(amountMg)}мг/${decimalToText(volumeMl)}мл`) : [];
  }),
  ...standaloneMatches(text, PERCENT_PATTERN).flatMap(([, value = '']) => {
    const percent = decimalFromText(value);
    return percent ? concentration(multiplyDecimals(percent, THOUSAND), HUNDRED_ML, `${decimalToText(percent)}%`) : [];
  }),
  ...standaloneMatches(text, RATIO_PATTERN).flatMap(([, value = '']) => {
    const volumeMl = decimalFromText(value);
    return volumeMl ? concentration(THOUSAND, volumeMl, `1:${decimalToText(volumeMl)}`) : [];
  }),
];

type ParsedUnit = { isWeb: boolean; volumeKeys: Set<string>; doseKeys: Set<string>; concentrationKeys: Set<string> };

const parseUnit = ({ text, isWeb }: VolumeSourceUnit): ParsedUnit => {
  const normalized = normalizeNumberText(text);
  return {
    isWeb,
    volumeKeys: new Set(findVolumes(normalized).map(({ key }) => key)),
    doseKeys: new Set(findDoses(normalized).map(({ key }) => key)),
    concentrationKeys: new Set(findConcentrations(normalized).map(({ key }) => key)),
  };
};

const volumeOf = (doseMg: Decimal, { amountMg, volumeMl }: ConcentrationToken): string | null => {
  const volume = divideExactly(multiplyDecimals(doseMg, volumeMl), amountMg);
  return volume ? decimalToText(volume) : null;
};

const isRecomputed = (volume: VolumeToken, dose: DoseToken, concentrationToken: ConcentrationToken): boolean => {
  if (dose.isPerKg !== (volume.suffix === PER_KG_SUFFIX)) return false;
  if ((dose.amountMg.high === null) !== (volume.amount.high === null)) return false;
  const isLowEqual = volumeOf(dose.amountMg.low, concentrationToken) === decimalToText(volume.amount.low);
  if (dose.amountMg.high === null || volume.amount.high === null) return isLowEqual;
  return isLowEqual && volumeOf(dose.amountMg.high, concentrationToken) === decimalToText(volume.amount.high);
};

const supportingUnits = (
  volume: VolumeToken,
  sentence: { doses: DoseToken[]; concentrations: ConcentrationToken[] },
  units: ParsedUnit[],
): ParsedUnit[] => {
  const isRecomputable = volume.suffix === '' || volume.suffix === PER_KG_SUFFIX;
  if (!isRecomputable || sentence.doses.length === 0 || sentence.concentrations.length === 0) {
    return units.filter(({ volumeKeys }) => volumeKeys.has(volume.key));
  }
  return units.filter((unit) =>
    sentence.doses.some(
      (dose) =>
        unit.doseKeys.has(dose.key) &&
        sentence.concentrations.some(
          (concentrationToken) => unit.concentrationKeys.has(concentrationToken.key) && isRecomputed(volume, dose, concentrationToken),
        ),
    ),
  );
};

const toCheck = (supporting: ParsedUnit[]): StatedVolumeCheck =>
  supporting.length === 0 ? { status: 'unverified' } : { status: 'verified', isWebBound: supporting.every(({ isWeb }) => isWeb) };

export const checkStatedVolumes = (sentence: string, sourceUnits: VolumeSourceUnit[]): StatedVolumeCheck[] => {
  const normalized = normalizeNumberText(sentence);
  const volumes = findVolumes(normalized);
  if (volumes.length === 0) return [];
  const tokens = { doses: findDoses(normalized), concentrations: findConcentrations(normalized) };
  const units = sourceUnits.map(parseUnit);
  return volumes.map((volume) => toCheck(supportingUnits(volume, tokens, units)));
};

export const maskStatedVolumes = (normalizedText: string): string =>
  findVolumes(normalizedText).reduce(
    (masked, { start, end }) => `${masked.slice(0, start)}${' '.repeat(end - start)}${masked.slice(end)}`,
    normalizedText,
  );
