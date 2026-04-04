import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const namespace = (process.env.VITE_SORASWAP_NAMESPACE || 'universal').trim();
const defaultClientConfigPath = path.resolve(repoRoot, '../soraswap/tmp/iroha-localnet/client.toml');
const clientConfigPath = process.env.SORASWAP_CLIENT_CONFIG || defaultClientConfigPath;
const localManifestDir = path.resolve(repoRoot, '../soraswap/deployments/local');

const exists = async (targetPath) => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const readToriiUrlFromConfig = async (targetPath) => {
  const config = await readFile(targetPath, 'utf8');
  const match = config.match(/^torii_url = "([^"]+)"/mu);

  if (!match) {
    throw new Error(`torii_url is missing from ${targetPath}`);
  }

  return match[1].replace(/\/+$/u, '');
};

const listExpectedContractIds = async () => {
  if (!(await exists(localManifestDir))) {
    return [];
  }

  const entries = await readdir(localManifestDir, { withFileTypes: true });
  const deployFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.deploy.json'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  if (deployFiles.length > 0) {
    const expected = await Promise.all(
      deployFiles.map(async (fileName) => {
        const raw = await readFile(path.join(localManifestDir, fileName), 'utf8');
        const deployment = JSON.parse(raw);
        return String(
          deployment.contract_id || deployment.contract_address || fileName.replace(/\.deploy\.json$/u, '')
        ).trim();
      })
    );
    return expected.filter(Boolean).sort((left, right) => left.localeCompare(right));
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.manifest.json'))
    .map((entry) => entry.name.replace(/\.manifest\.json$/u, ''))
    .sort((left, right) => left.localeCompare(right));
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
  const clientConfigExists = await exists(clientConfigPath);
  const toriiUrl = clientConfigExists
    ? await readToriiUrlFromConfig(clientConfigPath)
    : (process.env.SORASWAP_TORII_URL || 'http://127.0.0.1:8080').replace(/\/+$/u, '');
  const expectedContractIds = await listExpectedContractIds();

  let health = 'unreachable';
  let liveContractIds = [];
  let fetchError = '';

  try {
    const healthResponse = await fetch(new URL('/health', `${toriiUrl}/`));
    health = healthResponse.ok
      ? (await healthResponse.text()).trim()
      : `${healthResponse.status} ${healthResponse.statusText}`;

    const contracts = await fetchJson(new URL(`/v1/contracts/instances/${namespace}`, `${toriiUrl}/`));
    liveContractIds = Array.isArray(contracts.instances)
      ? contracts.instances
        .map((instance) => instance.contract_id)
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right))
      : [];
  } catch (error) {
    fetchError = error instanceof Error ? error.message : String(error);
  }

  const missingContractIds = expectedContractIds.filter((contractId) => !liveContractIds.includes(contractId));
  const unexpectedContractIds = liveContractIds.filter((contractId) => !expectedContractIds.includes(contractId));

  process.stdout.write('SoraSwap local readiness\n');
  process.stdout.write(`Client config: ${clientConfigExists ? clientConfigPath : 'missing'}\n`);
  process.stdout.write(`Torii URL: ${toriiUrl}\n`);
  process.stdout.write(`Namespace: ${namespace}\n`);
  process.stdout.write(`Torii health: ${health}\n`);
  process.stdout.write(`Expected local deployments: ${expectedContractIds.length}\n`);
  process.stdout.write(`Live contract instances: ${liveContractIds.length}\n`);
  process.stdout.write(`Live contract ids: ${liveContractIds.length > 0 ? liveContractIds.join(', ') : 'none'}\n`);
  process.stdout.write('\n');

  if (!clientConfigExists) {
    process.stdout.write(`Blocker: local client config is missing at ${clientConfigPath}.\n`);
  }
  if (fetchError) {
    process.stdout.write(`Blocker: could not query local Torii: ${fetchError}.\n`);
  }
  if (expectedContractIds.length === 0) {
    process.stdout.write(`Blocker: no local deployment manifests were found in ${localManifestDir}.\n`);
  }
  if (missingContractIds.length > 0) {
    process.stdout.write(`Blocker: missing live contract ids: ${missingContractIds.join(', ')}.\n`);
  }
  if (unexpectedContractIds.length > 0) {
    process.stdout.write(`Notice: unexpected live contract ids: ${unexpectedContractIds.join(', ')}.\n`);
  }
};

await main();
