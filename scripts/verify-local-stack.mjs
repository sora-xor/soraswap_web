import { spawnSync } from 'node:child_process';
import path from 'node:path';

const repoRoot = process.cwd();
const soraswapRoot = path.resolve(repoRoot, '../soraswap');

const run = (label, command, args, cwd, envOverrides = {}) => {
  process.stdout.write(`\n== ${label} ==\n`);
  const result = spawnSync(command, args, {
    cwd,
    env: {
      ...process.env,
      ...envOverrides
    },
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

run('Stop stale localnet', './scripts/local_down.sh', [], soraswapRoot);
run('Start localnet', './scripts/local_up.sh', [], soraswapRoot);
run('Deploy local contracts', './scripts/deploy_local.sh', [], soraswapRoot);
run('Smoke local contracts', './scripts/smoke_local.sh', [], soraswapRoot);
run('Verify Torii draft signing', 'node', ['scripts/verify-local-torii-draft-signing.mjs'], repoRoot);
run('Sync frontend registry', 'node', ['scripts/sync-soraswap-registry.mjs'], repoRoot, {
  SORASWAP_REGISTRY_ENV: 'local'
});
run('Check local readiness', 'node', ['scripts/check-local-readiness.mjs'], repoRoot);
