const DECIMAL_PATTERN = /^(?:\d+(?:\.\d*)?|\.\d+)$/;
const INTEGER_PATTERN = /^-?\d+$/;

const trimLeadingZeros = (value: string) => {
  const normalized = value.replace(/^0+(?=\d)/, '');
  return normalized === '' ? '0' : normalized;
};

export const assertIntegerString = (value: string, label: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  if (!INTEGER_PATTERN.test(trimmed)) {
    throw new Error(`${label} must be an integer.`);
  }
  return trimmed;
};

export const scaleDecimalToBaseUnits = (
  value: string,
  scale: number,
  label: string,
  options?: { allowZero?: boolean }
) => {
  if (!Number.isInteger(scale) || scale < 0 || scale > 28) {
    throw new Error(`${label} uses an unsupported asset scale.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  if (trimmed.startsWith('-')) {
    throw new Error(`${label} cannot be negative.`);
  }
  if (trimmed.startsWith('+')) {
    throw new Error(`${label} must not include a sign.`);
  }
  if (/[eE,_]/.test(trimmed) || !DECIMAL_PATTERN.test(trimmed)) {
    throw new Error(`${label} must be a plain decimal number.`);
  }

  const [wholeRaw, fractionRaw = ''] = trimmed.split('.');
  const whole = trimLeadingZeros(wholeRaw === '' ? '0' : wholeRaw);
  const fraction = fractionRaw.replace(/0+$/, '');

  if (fraction.length > scale) {
    throw new Error(`${label} supports up to ${scale} decimal place${scale === 1 ? '' : 's'}.`);
  }

  const paddedFraction = fraction.padEnd(scale, '0');
  const baseUnits =
    BigInt(whole) * 10n ** BigInt(scale) +
    BigInt(paddedFraction === '' ? '0' : paddedFraction);

  if (!options?.allowZero && baseUnits <= 0n) {
    throw new Error(`${label} must be greater than zero.`);
  }

  return baseUnits.toString();
};

export const formatBaseUnits = (
  value: string | bigint,
  scale: number,
  options?: { trimTrailingZeros?: boolean }
) => {
  if (!Number.isInteger(scale) || scale < 0 || scale > 28) {
    throw new Error('Unsupported asset scale.');
  }

  const normalized = typeof value === 'bigint' ? value.toString() : assertIntegerString(value, 'Amount');
  const negative = normalized.startsWith('-');
  const digits = (negative ? normalized.slice(1) : normalized).replace(/^0+(?=\d)/, '') || '0';

  if (scale === 0) {
    return `${negative ? '-' : ''}${digits}`;
  }

  const padded = digits.padStart(scale + 1, '0');
  const whole = padded.slice(0, -scale) || '0';
  let fraction = padded.slice(-scale);
  if (options?.trimTrailingZeros !== false) {
    fraction = fraction.replace(/0+$/, '');
  }

  if (!fraction) {
    return `${negative ? '-' : ''}${whole}`;
  }

  return `${negative ? '-' : ''}${whole}.${fraction}`;
};
