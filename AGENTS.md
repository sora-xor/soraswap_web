# SoraSwap Web Agent Handbook

## Purpose
- `soraswap_web` is the Apache-2.0 Vue 3 frontend for SoraSwap on Sora Nexus.
- The canonical neighboring repos are `../soraswap` for Kotodama contracts and `../iroha` for Torii, Connect, and SDK/runtime changes.

## Product Rules
- Keep the app IPFS-safe: prefer hash routing, relative assets, and no middleware assumptions.
- Use Torii directly. Do not add indexers, proxy APIs, or centralized relays as a dependency of the production path.
- Treat `https://taira.sora.org` as the default public testnet endpoint unless the user overrides it.
- Preserve the six-view shell from the Tonswap app: `wallet`, `defi`, `swap`, `launchpad`, `crosschain`, `more`.
- `Crosschain` is a capability view until a real Nexus bridge surface exists.

## Engineering Rules
- Prefer browser-safe TypeScript utilities over server-only SDK imports.
- If the app needs a missing Torii, Connect, or browser SDK capability, patch `../iroha` in the narrowest layer that solves it.
- Keep mutation flows honest. If canonical browser-side transaction assembly is unavailable, surface the blocker clearly instead of faking execution.
- Favor runtime discovery from `VITE_SORASWAP_DATASPACE` and deployment manifests over hardcoded instance IDs.

## Local Workflow
- Install: `npm install`
- Dev server: `npm run dev`
- Typecheck: `npm run typecheck`
- Unit tests: `npm run test:unit`
- Production build: `npm run build`

## App Map
- `src/App.vue` owns view routing, theme state, runtime polling, watch-account state, and Connect bootstrap.
- `src/components/Layout.vue` renders shared chrome, route transitions, and tab navigation.
- `src/components/views/*` contains the six main product surfaces.
- `src/services/torii.ts` is the direct Torii fetch layer.
- `src/services/connect.ts` is the browser-safe Iroha Connect preview/session helper layer.
- `src/services/registry.ts` resolves expected SoraSwap contract addresses from the generated manifest registry.
- `src/data/soraswap.ts` carries static reference catalogs and parity-driven module metadata.

## Repo Status
- This repo is the first serious frontend surface for Sora Nexus.
- Read paths are wired directly to Torii.
- Unsigned contract-call drafts are available through direct Torii calls.
- Live Connect signing, detached submit, and pipeline polling are wired.
- Expected contract metadata comes from `src/generated/soraswapRegistry.ts`, refreshed by `npm run sync:registry`.
