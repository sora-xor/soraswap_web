import { describe, expect, test } from 'vitest';
import { formatBaseUnits, scaleDecimalToBaseUnits } from '@/services/amounts';

describe('amount scaling helpers', () => {
  test('scales whole and fractional decimals into base units', () => {
    expect(scaleDecimalToBaseUnits('42', 0, 'Amount')).toBe('42');
    expect(scaleDecimalToBaseUnits('1.23', 2, 'Amount')).toBe('123');
    expect(scaleDecimalToBaseUnits('.5', 3, 'Amount')).toBe('500');
  });

  test('accepts trailing zero input and preserves zero when allowed', () => {
    expect(scaleDecimalToBaseUnits('1.2300', 4, 'Amount')).toBe('12300');
    expect(scaleDecimalToBaseUnits('0', 0, 'Amount', { allowZero: true })).toBe('0');
  });

  test('rejects invalid precision and syntax', () => {
    expect(() => scaleDecimalToBaseUnits('1.234', 2, 'Amount')).toThrow('Amount supports up to 2 decimal places.');
    expect(() => scaleDecimalToBaseUnits('1e3', 2, 'Amount')).toThrow('Amount must be a plain decimal number.');
    expect(() => scaleDecimalToBaseUnits('-1', 2, 'Amount')).toThrow('Amount cannot be negative.');
  });

  test('formats base units back into human decimals', () => {
    expect(formatBaseUnits('12300', 4)).toBe('1.23');
    expect(formatBaseUnits('500', 3)).toBe('0.5');
    expect(formatBaseUnits('42', 0)).toBe('42');
  });
});
