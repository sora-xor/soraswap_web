# SoraSwap Web

SoraSwap Web is the Vue 3 frontend for the SoraSwap DEX on Sora Nexus. It keeps the six-tab Tonswap shell, replaces TON-specific services with direct Torii reads, and targets IPFS deployment without middleware or centralized servers.

## Current scope

- Direct runtime reads from Torii: API versions, node capabilities, Connect status, contract instance discovery, account assets, and account transactions
- Browser-safe Iroha Connect session bootstrap for wallet pairing
- Connect preview/session bootstrap now comes from the sibling `@iroha/iroha-js/connect-browser` helper, while the encrypted live channel remains app-local
- Runtime-configurable Torii endpoint, chain id, dataspace, and poll interval with TAIRA/local presets persisted in browser storage
- Generated SoraSwap manifest registry synced from `../soraswap` so the frontend can compare runtime discovery against expected contract metadata
- Sora-specific red/black/white UI, hash-routing support, and IPFS-friendly asset resolution
- Capability-gated execution surfaces for Spot, Perps, Options, Launchpad, DeFi, and Crosschain

## Important status

The browser write path now covers Torii draft scaffolds, encrypted live Connect signing, detached contract-call submit, and pipeline-status polling.

The frontend prefers deployment-backed contract addresses from `../soraswap/deployments/<env>/*.deploy.json`. When the current sibling deployment root has no live deploy records, registry sync falls back to compiled manifests and disables live write targeting until fresh deploy evidence exists.

The remaining blocker is canonical browser-side transaction assembly. The app now prefers `SIGN_REQUEST_TX` using Torii's scaffold transaction (`transaction_scaffold_b64`, with legacy `signed_transaction_b64` fallback) and falls back to `SIGN_REQUEST_RAW` for older draft responses, but it still does not construct full transactions in-browser.

## Environment

Copy `.env.example` to `.env.local` if you need build-time defaults.

The More tab can override the runtime endpoint, dataspace, Connect chain id, app URL, and refresh interval without rebuilding the IPFS bundle.

Default values:

- `VITE_TORII_URL=https://taira.sora.org`
- `VITE_SORASWAP_DATASPACE=universal`
- `VITE_CONNECT_CHAIN_ID=809574f5-fee7-5e69-bfcf-52451e42d50f`
- `VITE_CONNECT_APP_NAME=SoraSwap`
- `VITE_TORII_API_VERSION=1.1`

## Commands

- `npm install`
- `npm run sync:iroha-sdk`
- `npm run sync:registry`
- `npm run doctor:local`
- `npm run doctor:testnet`
- `npm run build:iroha-cli`
- `npm run compile:soraswap`
- `npm run verify:local:drafts`
- `npm run verify:local`
- `npm run verify:siblings`
- `npm run dev`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run build:ipfs`
- `npm run ipfs:publish`
- `npm run preview`

## IPFS publish

The repo now has the same publish workflow shape as `../tonswap_web`.

- `yarn ipfs:publish` or `npm run ipfs:publish` builds with `VITE_BASE=./`, adds `dist/` to IPFS, and prints the CID plus local gateway and `dweb.link` URLs.
- The script uses your writable `~/.ipfs` repo if available. Otherwise it falls back to a repo-local `.ipfs/` directory and will start a local daemon if needed.
- Optional IPNS publish is enabled when an `ipfs` key named `soraswap-web` exists locally. Override that with `IPFS_IPNS_KEY_NAME=<name>`, or force the printed IPNS id with `IPFS_IPNS_KEY_ID=<peer-id>`.
- Runtime Nexus settings still come from the More tab, so changing TAIRA vs local Torii does not require rebuilding the IPFS bundle.

## Repo relationships

- `../soraswap`: Kotodama contracts, deployment scripts, parity register
- `../iroha`: Torii, Connect, and SDK/runtime patches
- `../tonswap_web`: UX shell and route-structure reference

## Registry sync

`npm run sync:registry` scans the sibling `../soraswap` repo for deployment manifests.

Default resolution order:

- `deployments/testnet/*.manifest.json` only when matching `*.deploy.json` files with canonical contract addresses exist
- `artifacts/compiled/**/*.manifest.json`

Explicit local resolution:

- `SORASWAP_REGISTRY_ENV=local npm run sync:registry`

Override the default selection with `SORASWAP_REGISTRY_ENV=testnet`, `SORASWAP_REGISTRY_ENV=local`, or `SORASWAP_REGISTRY_ENV=compiled` when you need a specific environment. The local verifier now uses `local` automatically.

The generated output is committed at `src/generated/soraswapRegistry.ts` so the app can build without needing sibling-repo access at runtime.

## Sibling verification

`npm run verify:siblings` runs the full local integration chain for the neighboring repos:

- refresh the sibling `@iroha/iroha-js` browser helper dist and local file dependency
- build the sibling `../iroha` CLI
- compile the sibling `../soraswap` contracts
- refresh the generated frontend registry
- report current TAIRA readiness and deployment blockers

`npm run verify:local` runs the local Nexus and SoraSwap contract flow end to end:

- stop any stale sibling localnet
- start `../soraswap` local Nexus
- deploy all local SoraSwap contracts
- execute the local `n3x.n3x_hub.quote_mint` smoke call
- verify both detached-sign submit and scaffold re-sign submit directly against local Torii
- refresh the frontend registry and report local readiness

`npm run doctor:local` reads the generated sibling localnet config, checks Torii health, and compares live `universal` instances against `../soraswap/deployments/local`.
