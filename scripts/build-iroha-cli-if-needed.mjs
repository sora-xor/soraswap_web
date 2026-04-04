import { access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const repoRoot = process.cwd();
const irohaRoot = path.resolve(repoRoot, '../iroha');
const candidates = [
  process.env.CARGO_TARGET_DIR ? path.resolve(process.env.CARGO_TARGET_DIR, 'debug/iroha') : '',
  path.resolve(irohaRoot, 'target/debug/iroha'),
  '/tmp/iroha-codex-target/debug/iroha'
].filter(Boolean);

const exists = async (targetPath) => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

for (const candidate of candidates) {
  if (await exists(candidate)) {
    process.stdout.write(`iroha CLI already available at ${candidate}\n`);
    process.exit(0);
  }
}

const result = spawnSync('cargo', ['build', '--bin', 'iroha'], {
  cwd: irohaRoot,
  env: {
    ...process.env,
    NORITO_SKIP_BINDINGS_SYNC: '1'
  },
  stdio: 'inherit'
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
