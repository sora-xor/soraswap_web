import { describe, expect, test } from 'vitest';
import { formatPercent, shorten } from '@/services/format';

describe('format helpers', () => {
  test('shorten preserves head and tail', () => {
    expect(shorten('1234567890abcdef', 4, 4)).toBe('1234...cdef');
  });

  test('formatPercent keeps sign', () => {
    expect(formatPercent(5.123)).toBe('+5.12%');
    expect(formatPercent(-1.2)).toBe('-1.20%');
  });
});
