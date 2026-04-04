import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const soraswapRoot = path.resolve(repoRoot, '../soraswap');
const outputPath = path.join(repoRoot, 'src/generated/soraswapRegistry.ts');
const requestedEnv = (process.env.SORASWAP_REGISTRY_ENV || '').trim();

const sourceCandidates = [
  {
    env: 'testnet',
    dir: path.join(soraswapRoot, 'deployments/testnet'),
    recursive: false,
    requiresDeployMetadata: true
  },
  {
    env: 'local',
    dir: path.join(soraswapRoot, 'deployments/local'),
    recursive: false,
    requiresDeployMetadata: true
  },
  {
    env: 'compiled',
    dir: path.join(soraswapRoot, 'artifacts/compiled'),
    recursive: true,
    requiresDeployMetadata: false
  }
];

const defaultSourceOrder = ['testnet', 'compiled'];

const normalizeHashHex = (value) => value.replace(/^hash:/i, '').replace(/#.*$/, '').toLowerCase();

const collectManifestFiles = async (rootDir, recursive) => {
  const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) {
        files.push(...(await collectManifestFiles(absolutePath, recursive)));
      }
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.manifest.json')) {
      files.push(absolutePath);
    }
  }
  return files.sort();
};

const contractKeyFromPath = (rootDir, filePath) =>
  path
    .relative(rootDir, filePath)
    .replace(/\.manifest\.json$/u, '')
    .split(path.sep)
    .join('.');

const moduleIdFromContractKey = (contractKey) => contractKey.split('.')[0] || contractKey;

const readDeployMetadata = async (manifestPath) => {
  const deployPath = manifestPath.replace(/\.manifest\.json$/u, '.deploy.json');
  const raw = await readFile(deployPath, 'utf8').catch(() => '');
  if (!raw) return null;
  return JSON.parse(raw);
};

const collectSourceFiles = async (candidate) => {
  const manifestFiles = await collectManifestFiles(candidate.dir, candidate.recursive);
  if (!candidate.requiresDeployMetadata) {
    return manifestFiles;
  }
  const deployBackedFiles = [];
  for (const filePath of manifestFiles) {
    const deploy = await readDeployMetadata(filePath);
    if (deploy?.contract_address) {
      deployBackedFiles.push(filePath);
    }
  }
  return deployBackedFiles;
};

const pickSource = async () => {
  if (requestedEnv) {
    const requestedCandidate = sourceCandidates.find((candidate) => candidate.env === requestedEnv);
    if (!requestedCandidate) {
      throw new Error(`Unsupported SORASWAP_REGISTRY_ENV "${requestedEnv}".`);
    }
    const files = await collectSourceFiles(requestedCandidate);
    if (files.length === 0) {
      throw new Error(`No deployment-backed SoraSwap manifests found for requested env "${requestedEnv}".`);
    }
    return {
      ...requestedCandidate,
      files
    };
  }

  for (const env of defaultSourceOrder) {
    const candidate = sourceCandidates.find((entry) => entry.env === env);
    if (!candidate) {
      continue;
    }
    const files = await collectSourceFiles(candidate);
    if (files.length > 0) {
      return {
        ...candidate,
        files
      };
    }
  }
  throw new Error('No SoraSwap manifest files found in ../soraswap.');
};

const main = async () => {
  const source = await pickSource();
  const contracts = [];

  for (const filePath of source.files) {
    const raw = await readFile(filePath, 'utf8');
    const manifest = JSON.parse(raw);
    const deploy = await readDeployMetadata(filePath);
    const contractKey = String(deploy?.contract_key || contractKeyFromPath(source.dir, filePath)).trim();
    const contractAddress = deploy?.contract_address ? String(deploy.contract_address).trim() : undefined;
    contracts.push({
      moduleId: moduleIdFromContractKey(contractKey),
      contractKey,
      ...(contractAddress ? { contractAddress } : {}),
      codeHashHex: normalizeHashHex(String(deploy?.code_hash_hex || manifest.code_hash)),
      abiHashHex: normalizeHashHex(String(deploy?.abi_hash_hex || manifest.abi_hash)),
      ...(deploy?.dataspace ? { dataspace: String(deploy.dataspace).trim() } : {}),
      entrypoints: Array.isArray(manifest.entrypoints)
        ? manifest.entrypoints.map((entry) => entry.name).filter(Boolean)
        : [],
      sourcePath: path.relative(repoRoot, filePath)
    });
  }

  const payload = {
    sourceEnv: source.env,
    generatedAt: new Date().toISOString(),
    sourceRoot: path.relative(repoRoot, source.dir),
    contracts: contracts.sort((left, right) =>
      (left.contractAddress || left.contractKey).localeCompare(right.contractAddress || right.contractKey)
    )
  };

  const contents = `import type { SoraswapContractRegistry } from '@/types';\n\nexport const generatedSoraswapRegistry: SoraswapContractRegistry = ${JSON.stringify(payload, null, 2)};\n`;

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, contents, 'utf8');
  process.stdout.write(`Wrote ${contracts.length} registry contracts from ${source.env} manifests to ${path.relative(repoRoot, outputPath)}\n`);
};

await main();
