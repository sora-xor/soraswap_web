import { access } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const defaultToriiUrl = process.env.VITE_TORII_URL || 'https://taira.sora.org';
const toriiUrl = defaultToriiUrl.replace(/\/+$/u, '');
const dataspace = (
  process.env.VITE_SORASWAP_DATASPACE ||
  process.env.VITE_SORASWAP_NAMESPACE ||
  'universal'
).trim();
const siblingConfigPath = path.resolve(repoRoot, '../soraswap/config/testnet/taira.client.toml');
const siblingExamplePath = path.resolve(repoRoot, '../soraswap/config/testnet/taira.client.toml.example');
const irohaCliCandidates = [
  process.env.CARGO_TARGET_DIR ? path.resolve(process.env.CARGO_TARGET_DIR, 'debug/iroha') : '',
  path.resolve(repoRoot, '../iroha/target/debug/iroha'),
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

const firstExistingPath = async (candidates) => {
  for (const candidate of candidates) {
    if (await exists(candidate)) {
      return candidate;
    }
  }
  return '';
};

const fetchJson = async (target) => {
  const response = await fetch(target, {
    headers: {
      Accept: 'application/json'
    }
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
};

const main = async () => {
  const [configExists, exampleExists, irohaCliPath, connectStatus, contracts] = await Promise.all([
    exists(siblingConfigPath),
    exists(siblingExamplePath),
    firstExistingPath(irohaCliCandidates),
    fetchJson(new URL('/v1/connect/status', `${toriiUrl}/`)),
    fetchJson(new URL(`/v1/contracts/instances/${dataspace}`, `${toriiUrl}/`))
  ]);
  const irohaCliExists = Boolean(irohaCliPath);

  const activeClientConfig = process.env.SORASWAP_CLIENT_CONFIG || (configExists ? siblingConfigPath : '');
  const findings = [
    ['Torii URL', toriiUrl],
    ['Dataspace', dataspace],
    ['Connect enabled', connectStatus.enabled ? 'yes' : 'no'],
    ['Connect sessions active', String(connectStatus.sessions_active ?? 0)],
    ['Live contract instances', String(contracts.total ?? 0)],
    ['Client config', activeClientConfig || 'missing'],
    ['Example config', exampleExists ? siblingExamplePath : 'missing'],
    ['iroha CLI binary', irohaCliExists ? irohaCliPath : 'missing'],
    ['SORASWAP_AUTHORITY env', process.env.SORASWAP_AUTHORITY || 'missing']
  ];

  process.stdout.write('SoraSwap testnet readiness\n');
  for (const [label, value] of findings) {
    process.stdout.write(`${label}: ${value}\n`);
  }

  process.stdout.write('\n');
  if (!activeClientConfig) {
    process.stdout.write('Blocker: no real testnet client config is available for deploy-testnet.\n');
  }
  if (!irohaCliExists) {
    process.stdout.write('Blocker: no built iroha CLI binary was found in the known cargo target directories.\n');
  }
  if ((contracts.total ?? 0) === 0) {
    process.stdout.write(`Blocker: ${toriiUrl} currently exposes 0 live "${dataspace}" contract instances.\n`);
    if (toriiUrl === 'https://taira.sora.org' && dataspace === 'universal') {
      process.stdout.write('Hint: Taira should pin `nexus.fees.fee_asset_id = "xor#universal"` and SoraSwap testnet deploys should use `iroha app contracts deploy-activate` before expecting contract-backed trading to work.\n');
    }
  }
};

await main();
