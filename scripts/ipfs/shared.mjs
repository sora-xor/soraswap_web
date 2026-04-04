import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const rootDir = path.resolve(__dirname, '../..');
export const DEFAULT_IPNS_KEY_NAME = 'soraswap-web';
export const DEFAULT_IPNS_KEY_ID = '';

const DEFAULT_IPFS_GATEWAY = 'http://localhost:8080';
const DEFAULT_IPFS_API = 'http://127.0.0.1:5001';
const normalizeGatewayUrl = (value) => (value ? value.replace(/\/+$/, '') : value);

export const isBase32Cid = (value) => /^b[a-z2-7]+$/.test(value);
export const dwebPathUrlForCid = (value) => `https://dweb.link/ipfs/${value}/`;
export const dwebSubdomainUrlForCid = (value) => `https://${value}.ipfs.dweb.link/`;

const ipfsGatewayOverride = normalizeGatewayUrl(
  process.env.IPFS_GATEWAY_URL || process.env.IPFS_GATEWAY
);
const homeIpfsPath = path.join(os.homedir(), '.ipfs');
const localIpfsPath = path.join(rootDir, '.ipfs');
const ipfsApiMultiaddr = '/ip4/127.0.0.1/tcp/5001';
const localSwarmAddrs = ['/ip4/127.0.0.1/tcp/4001'];
const localGatewayAddr = '/ip4/127.0.0.1/tcp/8080';

const canUseHomeIpfs = () => {
  try {
    if (!fs.existsSync(homeIpfsPath)) return false;
    fs.accessSync(homeIpfsPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
};

const ipfsRepoPath =
  process.env.IPFS_PATH || (canUseHomeIpfs() ? homeIpfsPath : localIpfsPath);
const usingLocalIpfsRepo =
  !process.env.IPFS_PATH && ipfsRepoPath === localIpfsPath;
const ipfsEnv = { ...process.env, IPFS_PATH: ipfsRepoPath };

let ipfsApiBase = DEFAULT_IPFS_API;
let ipfsDaemon = null;
let ipfsStartedByScript = false;

export const getIpfsRuntimeInfo = () => ({
  ipfsEnv,
  ipfsRepoPath,
  usingLocalIpfsRepo,
});

export const logIpfsRepoSelection = (log = console.log) => {
  if (usingLocalIpfsRepo) {
    log(`[ipfs] Using local repo at ${ipfsRepoPath}`);
  }
};

export const ensureIpfsCli = async () => {
  try {
    await runCommand('ipfs', ['--version'], {
      capture: true,
      env: ipfsEnv,
      silent: true,
    });
  } catch (error) {
    throw new Error(
      'The `ipfs` CLI is required. Install it and ensure `ipfs --version` works in your shell.',
      { cause: error }
    );
  }
};

const resolveBuildInvocation = (env = process.env) => {
  const userAgent = `${env.npm_config_user_agent || ''}`.toLowerCase();

  if (userAgent.startsWith('yarn/')) {
    return { buildArgs: ['build:ipfs'], buildCommand: 'yarn' };
  }

  if (userAgent.startsWith('pnpm/')) {
    return { buildArgs: ['build:ipfs'], buildCommand: 'pnpm' };
  }

  return { buildArgs: ['run', 'build:ipfs'], buildCommand: 'npm' };
};

export const runCommand = (
  command,
  args,
  { capture = false, cwd = rootDir, env, silent = false } = {}
) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: env ?? process.env,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const settle = (fn) => (...fnArgs) => {
      if (settled) return;
      settled = true;
      fn(...fnArgs);
    };

    if (capture) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on('error', settle((error) => reject(error)));
    child.on('close', settle((code) => {
      if (capture && !silent) {
        if (stdout) process.stdout.write(stdout);
        if (stderr) process.stderr.write(stderr);
      }

      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} failed with code ${code}`));
    }));
  });

const httpUrlFromMultiaddr = (value) => {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return normalizeGatewayUrl(trimmed);
  }

  const parts = trimmed.split('/').filter(Boolean);
  const tcpIndex = parts.indexOf('tcp');
  if (tcpIndex === -1 || tcpIndex + 1 >= parts.length) return null;

  const hostIndex = tcpIndex - 1;
  const protoIndex = tcpIndex - 2;
  if (hostIndex < 0 || protoIndex < 0) return null;

  const port = parts[tcpIndex + 1];
  const hostProto = parts[protoIndex];
  const rawHost = parts[hostIndex];
  const host = rawHost === '0.0.0.0' || rawHost === '::' ? '127.0.0.1' : rawHost;
  const formattedHost = hostProto === 'ip6' || hostProto === 'ip6zone' ? `[${host}]` : host;
  return `http://${formattedHost}:${port}`;
};

export const resolveGatewayUrl = async () => {
  if (ipfsGatewayOverride) return ipfsGatewayOverride;

  const gatewayFilePath = path.join(ipfsRepoPath, 'gateway');
  try {
    if (fs.existsSync(gatewayFilePath)) {
      const gatewayValue = fs.readFileSync(gatewayFilePath, 'utf8');
      const resolved = httpUrlFromMultiaddr(gatewayValue);
      if (resolved) return resolved;
    }
  } catch {
    // Fall through to config-based lookup.
  }

  try {
    const { stdout } = await runCommand('ipfs', ['config', 'Addresses.Gateway'], {
      capture: true,
      env: ipfsEnv,
      silent: true,
    });
    return httpUrlFromMultiaddr(stdout) || DEFAULT_IPFS_GATEWAY;
  } catch {
    return DEFAULT_IPFS_GATEWAY;
  }
};

const resolveApiUrl = async () => {
  if (usingLocalIpfsRepo) return DEFAULT_IPFS_API;

  const apiFilePath = path.join(ipfsRepoPath, 'api');
  try {
    if (fs.existsSync(apiFilePath)) {
      const apiMultiaddr = fs.readFileSync(apiFilePath, 'utf8');
      const resolved = httpUrlFromMultiaddr(apiMultiaddr);
      if (resolved) return resolved;
    }
  } catch {
    // Fall through to config-based lookup.
  }

  try {
    const { stdout } = await runCommand('ipfs', ['config', 'Addresses.API'], {
      capture: true,
      env: ipfsEnv,
      silent: true,
    });
    return httpUrlFromMultiaddr(stdout) || DEFAULT_IPFS_API;
  } catch {
    return DEFAULT_IPFS_API;
  }
};

const checkIpfsApi = () =>
  new Promise((resolve) => {
    let ipfsApiUrl;
    try {
      ipfsApiUrl = new URL('/api/v0/version', ipfsApiBase);
    } catch {
      ipfsApiUrl = new URL('/api/v0/version', DEFAULT_IPFS_API);
    }

    const req = http.request(
      ipfsApiUrl,
      { method: 'POST' },
      (res) => {
        res.resume();
        resolve(Boolean(res.statusCode && res.statusCode < 500));
      }
    );

    req.on('error', () => resolve(false));
    req.end();
  });

const waitForIpfs = async (attempts = 20, delayMs = 500) => {
  for (let index = 0; index < attempts; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    const ready = await checkIpfsApi();
    if (ready) return true;

    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return false;
};

const ensureLocalIpfsConfig = async () => {
  if (!usingLocalIpfsRepo) return true;

  try {
    await runCommand(
      'ipfs',
      ['config', '--json', 'Addresses.Swarm', JSON.stringify(localSwarmAddrs)],
      { env: ipfsEnv }
    );
    await runCommand('ipfs', ['config', 'Addresses.API', ipfsApiMultiaddr], {
      env: ipfsEnv,
    });
    await runCommand('ipfs', ['config', 'Addresses.Gateway', localGatewayAddr], {
      env: ipfsEnv,
    });
    return true;
  } catch (error) {
    console.error(`[ipfs] Local config update failed: ${error.message}`);
    return false;
  }
};

const ensureLocalIpfsRepo = async () => {
  if (!usingLocalIpfsRepo) return true;

  const configPath = path.join(ipfsRepoPath, 'config');
  if (!fs.existsSync(configPath)) {
    console.log(`[ipfs] Initializing local repo at ${ipfsRepoPath}`);
    try {
      await runCommand('ipfs', ['init'], { env: ipfsEnv });
    } catch (error) {
      console.error(`[ipfs] Repo init failed: ${error.message}`);
      return false;
    }
  }

  return ensureLocalIpfsConfig();
};

const ensureApiFile = () => {
  if (!usingLocalIpfsRepo) return;

  const apiFile = path.join(ipfsRepoPath, 'api');
  if (fs.existsSync(apiFile)) return;

  try {
    fs.writeFileSync(apiFile, ipfsApiMultiaddr);
  } catch (error) {
    console.error(`[ipfs] Failed to write api file: ${error.message}`);
  }
};

export const ensureIpfsDaemon = async () => {
  const repoReady = await ensureLocalIpfsRepo();
  if (!repoReady) return false;

  ipfsApiBase = await resolveApiUrl();
  const ready = await checkIpfsApi();
  if (ready) {
    ensureApiFile();
    return true;
  }

  console.log('[ipfs] Starting daemon...');
  ipfsStartedByScript = true;
  ipfsDaemon = spawn('ipfs', ['daemon'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: ipfsEnv,
  });

  ipfsDaemon.on('error', (error) => {
    console.error(`[ipfs] Failed to start daemon: ${error.message}`);
  });
  ipfsDaemon.on('close', () => {
    ipfsDaemon = null;
    ipfsStartedByScript = false;
  });

  const daemonReady = await waitForIpfs();
  if (!daemonReady) {
    console.error('[ipfs] Daemon did not become ready; run `ipfs daemon` manually.');
    return false;
  }

  ensureApiFile();
  return true;
};

export const stopManagedIpfsDaemon = () => {
  if (ipfsDaemon && ipfsStartedByScript && !ipfsDaemon.killed) {
    ipfsDaemon.kill('SIGTERM');
  }
};

const parseIpfsKeyList = (stdout) =>
  stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [keyId, ...nameParts] = line.split(/\s+/);
      return {
        keyId: keyId || null,
        keyName: nameParts.join(' ') || null,
      };
    });

export const buildAndPublishIpfsSite = async ({
  buildCommand,
  buildArgs,
  gatewayUrl,
  ipnsKeyName = process.env.IPFS_IPNS_KEY_NAME || DEFAULT_IPNS_KEY_NAME,
  ipnsKeyId = process.env.IPFS_IPNS_KEY_ID || DEFAULT_IPNS_KEY_ID,
} = {}) => {
  const buildInvocation = resolveBuildInvocation();

  console.log('[ipfs] Building for IPFS...');
  await runCommand(buildCommand || buildInvocation.buildCommand, buildArgs || buildInvocation.buildArgs);

  const { stdout } = await runCommand('ipfs', ['add', '-r', '-Q', 'dist'], {
    capture: true,
    env: ipfsEnv,
    silent: true,
  });
  const cid = stdout.trim();
  if (!cid) {
    throw new Error('IPFS did not return a CID for `dist`.');
  }

  const resolvedGateway = normalizeGatewayUrl(
    gatewayUrl || (await resolveGatewayUrl()) || DEFAULT_IPFS_GATEWAY
  );
  const summary = {
    cid,
    dwebIpfsUrl: dwebPathUrlForCid(cid),
    dwebSubdomainUrl: isBase32Cid(cid) ? dwebSubdomainUrlForCid(cid) : null,
    ipfsUrl: `${resolvedGateway}/ipfs/${cid}/`,
    ipns: null,
  };

  if (!ipnsKeyName) {
    return summary;
  }

  const keyList = await runCommand('ipfs', ['key', 'list', '-l'], {
    capture: true,
    env: ipfsEnv,
    silent: true,
  });
  const matchingKey = parseIpfsKeyList(keyList.stdout).find(
    (entry) => entry.keyName === ipnsKeyName
  );
  const resolvedIpnsKeyId = matchingKey?.keyId || ipnsKeyId || null;

  if (!matchingKey) {
    summary.ipns = {
      dwebIpnsUrl: resolvedIpnsKeyId
        ? `https://${resolvedIpnsKeyId}.ipns.dweb.link/`
        : null,
      ipnsUrl: resolvedIpnsKeyId
        ? `${resolvedGateway}/ipns/${resolvedIpnsKeyId}/`
        : null,
      keyId: resolvedIpnsKeyId,
      keyName: ipnsKeyName,
      published: false,
    };
    return summary;
  }

  await runCommand(
    'ipfs',
    ['name', 'publish', '--key', ipnsKeyName, `/ipfs/${cid}`],
    { env: ipfsEnv }
  );

  summary.ipns = {
    dwebIpnsUrl: resolvedIpnsKeyId ? `https://${resolvedIpnsKeyId}.ipns.dweb.link/` : null,
    ipnsUrl: resolvedIpnsKeyId ? `${resolvedGateway}/ipns/${resolvedIpnsKeyId}/` : null,
    keyId: resolvedIpnsKeyId,
    keyName: ipnsKeyName,
    published: true,
  };
  return summary;
};

export const logPublishSummary = (summary, log = console.log) => {
  log(`[ipfs] Published dist: ${summary.cid}`);
  log(`[ipfs] Local gateway: ${summary.ipfsUrl}`);
  log(`[ipfs] Dweb link: ${summary.dwebIpfsUrl}`);

  if (summary.dwebSubdomainUrl) {
    log(`[ipfs] Dweb subdomain: ${summary.dwebSubdomainUrl}`);
  } else {
    log('[ipfs] Dweb subdomain requires CIDv1 base32; use the path-style link above.');
  }

  if (!summary.ipns) {
    return;
  }

  if (summary.ipns.published) {
    log(`[ipfs] Updated IPNS key ${summary.ipns.keyName}`);
    if (summary.ipns.ipnsUrl) {
      log(`[ipfs] Local IPNS: ${summary.ipns.ipnsUrl}`);
    }
    if (summary.ipns.dwebIpnsUrl) {
      log(`[ipfs] Dweb IPNS: ${summary.ipns.dwebIpnsUrl}`);
    }
    return;
  }

  if (summary.ipns.keyId) {
    log(`[ipfs] IPNS key ${summary.ipns.keyName} not found locally, skipped publish`);
    log(`[ipfs] Expected IPNS key id: ${summary.ipns.keyId}`);
    return;
  }

  log(`[ipfs] IPNS key ${summary.ipns.keyName} not found, skipped IPNS publish`);
};
