import { DEFAULT_SWAP_TOKENS, TOKEN_SYMBOLS } from '@/data/soraswap';
import type { RouteState, ViewType } from '@/types';

const viewToPath: Record<ViewType, string> = {
  wallet: '/wallet',
  defi: '/defi',
  swap: '/swap',
  launchpad: '/launchpad',
  crosschain: '/crosschain',
  more: '/more'
};

const swapTokenSymbols = new Set(TOKEN_SYMBOLS);

const normalizeSwapToken = (token?: string) => {
  if (!token) return undefined;
  const normalized = token.toUpperCase();
  return swapTokenSymbols.has(normalized as (typeof TOKEN_SYMBOLS)[number]) ? normalized : undefined;
};

const resolveFallbackSwapFrom = (swapTo?: string) => {
  const preferred = normalizeSwapToken(DEFAULT_SWAP_TOKENS.pay);
  if (swapTo && preferred && preferred !== swapTo) return preferred;
  const alternate = normalizeSwapToken(DEFAULT_SWAP_TOKENS.receive);
  if (swapTo && alternate && alternate !== swapTo) return alternate;
  return preferred || alternate || swapTo;
};

const rawBase = import.meta.env.BASE_URL || '/';
const basePath = rawBase === '/' || rawBase.startsWith('.') ? '' : rawBase.replace(/\/+$/, '');

const hasBasePrefix = (path: string) => !!basePath && (path === basePath || path.startsWith(`${basePath}/`));

const stripBase = (path: string) => {
  if (!basePath || !hasBasePrefix(path)) return path;
  const trimmed = path.slice(basePath.length);
  return trimmed === '' ? '/' : trimmed;
};

const withBase = (path: string) => {
  if (!basePath) return path;
  if (hasBasePrefix(path)) return path;
  return `${basePath}${path.startsWith('/') ? '' : '/'}${path}`;
};

const normalize = (path: string) => {
  if (!path) return '/';
  const stripped = stripBase(path).split(/[?#]/)[0] || '/';
  const trimmed = stripped.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
};

const normalizeHashPath = (hash: string) => {
  if (!hash) return '/';
  const cleaned = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!cleaned) return '/';
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
};

export const isHashRouting = () => {
  if (typeof window !== 'undefined' && /^#\/.+/.test(window.location.hash || '')) {
    return true;
  }
  if (import.meta.env.VITE_ROUTER_MODE === 'hash') return true;
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname || '';
  const path = window.location.pathname || '';
  return /(?:^|\.)ipfs\./i.test(host) || /(?:^|\.)ipns\./i.test(host) || path.includes('/ipfs/') || path.includes('/ipns/');
};

export const getRoutePathFromLocation = (location: Location) =>
  isHashRouting() ? normalizeHashPath(location.hash) : location.pathname;

export const parseRoute = (pathname: string): RouteState => {
  const path = normalize(pathname);
  const segments = path.split('/').filter(Boolean);
  if (segments[0] === 'swap') {
    const swapFrom = normalizeSwapToken(segments[1]);
    const swapTo = normalizeSwapToken(segments[2]);
    if (swapFrom && swapTo && swapFrom !== swapTo) {
      return { view: 'swap', swapFrom, swapTo };
    }
    if (swapFrom) return { view: 'swap', swapFrom };
    if (swapTo) {
      const fallbackFrom = resolveFallbackSwapFrom(swapTo);
      if (fallbackFrom && fallbackFrom !== swapTo) {
        return { view: 'swap', swapFrom: fallbackFrom, swapTo };
      }
      return { view: 'swap', swapFrom: swapTo };
    }
    return { view: 'swap' };
  }
  if (segments[0] === 'launchpad') {
    if (segments[1] === 'create') return { view: 'launchpad', launchpadMode: 'create' };
    if (segments[1]) return { view: 'launchpad', launchpadMode: 'detail', launchpadId: segments[1] };
    return { view: 'launchpad', launchpadMode: 'list' };
  }
  if (segments[0] === 'crosschain') return { view: 'crosschain' };

  const found = (Object.entries(viewToPath) as Array<[ViewType, string]>).find(([, candidate]) => normalize(candidate) === path);
  return found ? { view: found[0] } : { view: 'swap' };
};

export const buildPath = (state: RouteState) => {
  let path = '/swap';
  switch (state.view) {
    case 'swap': {
      const swapFrom = normalizeSwapToken(state.swapFrom);
      const swapTo = normalizeSwapToken(state.swapTo);
      if (swapFrom && swapTo && swapFrom !== swapTo) {
        path = `/swap/${swapFrom.toLowerCase()}/${swapTo.toLowerCase()}`;
      } else if (swapFrom) {
        path = `/swap/${swapFrom.toLowerCase()}`;
      } else {
        path = '/swap';
      }
      break;
    }
    case 'launchpad':
      if (state.launchpadMode === 'create') {
        path = '/launchpad/create';
      } else if (state.launchpadMode === 'detail' && state.launchpadId) {
        path = `/launchpad/${state.launchpadId}`;
      } else {
        path = '/launchpad';
      }
      break;
    case 'crosschain':
      path = '/crosschain';
      break;
    default:
      path = viewToPath[state.view];
      break;
  }
  const withBasePath = withBase(path);
  return isHashRouting() ? `#${withBasePath.startsWith('/') ? withBasePath : `/${withBasePath}`}` : withBasePath;
};

export const basePathForView = (view: ViewType) => {
  const withBasePath = withBase(viewToPath[view] || '/swap');
  return isHashRouting() ? `#${withBasePath.startsWith('/') ? withBasePath : `/${withBasePath}`}` : withBasePath;
};

export const resolveHashRoutingEntryPath = (pathname: string) => {
  const path = normalize(pathname);
  const segments = path.split('/').filter(Boolean);
  if (
    segments[0] === 'wallet' ||
    segments[0] === 'defi' ||
    segments[0] === 'swap' ||
    segments[0] === 'launchpad' ||
    segments[0] === 'crosschain' ||
    segments[0] === 'more'
  ) {
    const rooted = withBase('/');
    return rooted || '/';
  }
  return pathname || withBase('/') || '/';
};
