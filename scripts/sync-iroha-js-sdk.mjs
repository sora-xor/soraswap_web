import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();
const sdkDir = resolve(root, '../iroha/javascript/iroha_js');

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

run('npm', ['run', 'build:dist'], sdkDir);
run('npm', ['install'], root);
