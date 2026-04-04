import { describe, expect, test } from 'vitest';
import { buildPath, parseRoute } from '@/viewRoutes';

describe('viewRoutes', () => {
  test('parses swap route with token pair', () => {
    expect(parseRoute('/swap/xor/usdt')).toEqual({
      view: 'swap',
      swapFrom: 'XOR',
      swapTo: 'USDT'
    });
  });

  test('parses launchpad detail route', () => {
    expect(parseRoute('/launchpad/red-ledger')).toEqual({
      view: 'launchpad',
      launchpadMode: 'detail',
      launchpadId: 'red-ledger'
    });
  });

  test('builds swap path from route state', () => {
    expect(
      buildPath({
        view: 'swap',
        swapFrom: 'XOR',
        swapTo: 'USDT'
      })
    ).toContain('/swap/xor/usdt');
  });
});

