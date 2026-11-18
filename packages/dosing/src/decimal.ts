import type { RoundingDirection } from '#dosingRule';

export type Decimal = { units: bigint; scale: number };

const NUMBER_TEXT_PATTERN = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/;

const powerOfTen = (exponent: number): bigint => BigInt(`1${'0'.repeat(exponent)}`);

const greatestCommonDivisor = (left: bigint, right: bigint): bigint => {
  let a = left;
  let b = right;
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
};

const countFactor = (value: bigint, factor: bigint): { count: number; rest: bigint } => {
  let count = 0;
  let rest = value;
  while (rest % factor === 0n) {
    rest /= factor;
    count += 1;
  }
  return { count, rest };
};

export const decimalFromNumber = (value: number): Decimal => {
  const match = NUMBER_TEXT_PATTERN.exec(String(value));
  if (!match) {
    throw new Error(`Expected a non-negative finite number, got ${value}`);
  }
  const [, integerDigits = '', fractionDigits = '', exponentText = '0'] = match;
  const units = BigInt(integerDigits + fractionDigits);
  const scale = fractionDigits.length - Number(exponentText);
  return scale >= 0 ? { units, scale } : { units: units * powerOfTen(-scale), scale: 0 };
};

export const multiplyDecimals = (left: Decimal, right: Decimal): Decimal => ({
  units: left.units * right.units,
  scale: left.scale + right.scale,
});

export const isGreaterThan = (left: Decimal, right: Decimal): boolean =>
  left.units * powerOfTen(right.scale) > right.units * powerOfTen(left.scale);

export const divideExactly = (dividend: Decimal, divisor: Decimal): Decimal | null => {
  const numerator = dividend.units * powerOfTen(divisor.scale);
  const denominator = divisor.units * powerOfTen(dividend.scale);
  const divisorOfBoth = greatestCommonDivisor(numerator, denominator);
  const reducedDenominator = denominator / divisorOfBoth;
  const twos = countFactor(reducedDenominator, 2n);
  const fives = countFactor(twos.rest, 5n);
  if (fives.rest !== 1n) {
    return null;
  }
  const scale = Math.max(twos.count, fives.count);
  return { units: (numerator / divisorOfBoth) * (powerOfTen(scale) / reducedDenominator), scale };
};

export const roundToStep = (value: Decimal, step: Decimal, direction: RoundingDirection): Decimal => {
  const scaledValue = value.units * powerOfTen(step.scale);
  const scaledStep = step.units * powerOfTen(value.scale);
  const stepCount =
    direction === 'down' ? scaledValue / scaledStep : (2n * scaledValue + scaledStep) / (2n * scaledStep);
  return { units: stepCount * step.units, scale: step.scale };
};

export const decimalToText = (value: Decimal): string => {
  const digits = value.units.toString().padStart(value.scale + 1, '0');
  const integerPart = digits.slice(0, digits.length - value.scale);
  const fractionPart = digits.slice(digits.length - value.scale).replace(/0+$/, '');
  return fractionPart ? `${integerPart}.${fractionPart}` : integerPart;
};
