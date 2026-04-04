import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  AccountAddress,
  ToriiClient,
  publicKeyFromPrivate,
  resignSignedTransaction,
  signEd25519,
  submitSignedTransaction,
} from '@iroha/iroha-js';

const repoRoot = process.cwd();
const gasLimit = Number(process.env.SORASWAP_SMOKE_GAS_LIMIT || 5000);
const defaultClientConfigPath = path.resolve(repoRoot, '../soraswap/tmp/iroha-localnet/client.toml');
const clientConfigPath = process.env.SORASWAP_CLIENT_CONFIG || defaultClientConfigPath;
const localDeploymentsDir = path.resolve(repoRoot, '../soraswap/deployments/local');

const exists = async (targetPath) => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const normalizeHex = (value, label) => {
  const trimmed = String(value || '').trim().replace(/^0x/iu, '');
  if (!trimmed || !/^[0-9a-f]+$/iu.test(trimmed) || trimmed.length % 2 !== 0) {
    throw new Error(`${label} must be an even-length hex string`);
  }
  return trimmed.toUpperCase();
};

const decodeEd25519PublicKey = (literal) => {
  const hex = normalizeHex(literal, 'account.public_key');
  if (hex.length === 64) {
    return Buffer.from(hex, 'hex');
  }
  if (hex.startsWith('ED0120') && hex.length === 70) {
    return Buffer.from(hex.slice(6), 'hex');
  }
  throw new Error('account.public_key must be a raw 32-byte Ed25519 key or ed0120-prefixed multihash');
};

const decodeEd25519PrivateKey = (literal) => {
  const hex = normalizeHex(literal, 'account.private_key');
  if (hex.length === 64 || hex.length === 128) {
    return Buffer.from(hex, 'hex');
  }
  if (hex.startsWith('802620') && hex.length === 70) {
    return Buffer.from(hex.slice(6), 'hex');
  }
  throw new Error('account.private_key must be a raw 32/64-byte Ed25519 key or 802620-prefixed multihash');
};

const readConfigField = (config, pattern, label) => {
  const match = config.match(pattern);
  if (!match) {
    throw new Error(`${label} is missing from ${clientConfigPath}`);
  }
  return match[1];
};

const readClientConfig = async () => {
  if (!(await exists(clientConfigPath))) {
    throw new Error(`local client config is missing at ${clientConfigPath}`);
  }

  const config = await readFile(clientConfigPath, 'utf8');
  const toriiUrl = readConfigField(config, /^torii_url = "([^"]+)"/mu, 'torii_url').replace(/\/+$/u, '');
  const domain = readConfigField(config, /^\[account\][\s\S]*?^domain = "([^"]+)"/mu, 'account.domain');
  const publicKey = decodeEd25519PublicKey(
    readConfigField(config, /^\[account\][\s\S]*?^public_key *= "([^"]+)"/mu, 'account.public_key')
  );
  const privateKey = decodeEd25519PrivateKey(
    readConfigField(config, /^\[account\][\s\S]*?^private_key = "([^"]+)"/mu, 'account.private_key')
  );

  const derivedPublicKey = publicKeyFromPrivate(privateKey);
  if (!derivedPublicKey.equals(publicKey)) {
    throw new Error('account.private_key does not match account.public_key in the local client config');
  }

  const authority = AccountAddress.fromAccount({
    domain,
    publicKey,
  }).toI105();

  return {
    authority,
    publicKey,
    privateKey,
    toriiUrl,
  };
};

const fetchJson = async (target, init) => {
  const response = await fetch(target, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`${response.status} ${response.statusText}: ${message || 'request failed'}`);
  }
  return response.json();
};

const postContractCall = (baseUrl, body) =>
  fetchJson(new URL('/v1/contracts/call', `${baseUrl}/`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

const resolveLocalContractDeployment = async (contractKey) => {
  const deploymentPath = path.join(localDeploymentsDir, `${contractKey}.deploy.json`);
  if (!(await exists(deploymentPath))) {
    return {
      contractId: contractKey,
      namespace: (process.env.VITE_SORASWAP_NAMESPACE || 'universal').trim(),
    };
  }

  const raw = await readFile(deploymentPath, 'utf8');
  const deployment = JSON.parse(raw);
  return {
    contractId: String(deployment.contract_id || deployment.contract_address || contractKey).trim(),
    namespace: String(deployment.dataspace || process.env.VITE_SORASWAP_NAMESPACE || 'universal').trim(),
  };
};

const buildQuoteMintRequest = (authority, namespace, contractId, creationTimeMs) => ({
  authority,
  namespace,
  contract_id: contractId,
  entrypoint: 'quote_mint',
  payload: {
    usdt_in: 1,
    usdc_in: 2,
    kusd_in: 3,
  },
  gas_limit: gasLimit,
  ...(creationTimeMs ? { creation_time_ms: creationTimeMs } : {}),
});

const ensureApplied = async (client, hashHex, label) => {
  const status = await client.waitForTransactionStatusTyped(hashHex, {
    intervalMs: 250,
    timeoutMs: 15_000,
  });
  const kind = status?.content?.status?.kind;
  if (kind !== 'Applied' && kind !== 'Committed') {
    throw new Error(`${label} reached unexpected terminal pipeline status: ${kind || 'unknown'}`);
  }
  return kind;
};

const main = async () => {
  const { authority, publicKey, privateKey, toriiUrl } = await readClientConfig();
  const client = new ToriiClient(toriiUrl);
  const hubDeployment = await resolveLocalContractDeployment('n3x.n3x_hub');

  const instances = await fetchJson(new URL(`/v1/contracts/instances/${hubDeployment.namespace}`, `${toriiUrl}/`));
  const hasHub = Array.isArray(instances.instances)
    && instances.instances.some((instance) => instance.contract_id === hubDeployment.contractId);
  if (!hasHub) {
    throw new Error(
      `namespace "${hubDeployment.namespace}" does not expose n3x.n3x_hub (${hubDeployment.contractId}) on ${toriiUrl}`
    );
  }

  const detachedDraft = await postContractCall(
    toriiUrl,
    buildQuoteMintRequest(authority, hubDeployment.namespace, hubDeployment.contractId)
  );
  if (detachedDraft.submitted !== false) {
    throw new Error('expected detached draft response before providing a signature');
  }
  if (!detachedDraft.signing_message_b64) {
    throw new Error('detached draft did not include signing_message_b64');
  }
  const detachedSignature = signEd25519(
    Buffer.from(detachedDraft.signing_message_b64, 'base64'),
    privateKey,
  );
  const detachedSubmit = await postContractCall(toriiUrl, {
    ...buildQuoteMintRequest(
      authority,
      hubDeployment.namespace,
      hubDeployment.contractId,
      detachedDraft.creation_time_ms
    ),
    public_key_hex: publicKey.toString('hex').toUpperCase(),
    signature_b64: detachedSignature.toString('base64'),
  });
  if (!detachedSubmit.tx_hash_hex) {
    throw new Error('detached submit did not return tx_hash_hex');
  }
  const detachedStatus = await ensureApplied(client, detachedSubmit.tx_hash_hex, 'detached submit');

  const scaffoldDraft = await postContractCall(
    toriiUrl,
    buildQuoteMintRequest(
      authority,
      hubDeployment.namespace,
      hubDeployment.contractId,
      detachedDraft.creation_time_ms + 1
    ),
  );
  const scaffoldB64 = scaffoldDraft.transaction_scaffold_b64 || scaffoldDraft.signed_transaction_b64;
  if (!scaffoldB64) {
    throw new Error('scaffold draft did not include transaction_scaffold_b64 or signed_transaction_b64');
  }
  const resignedTransaction = resignSignedTransaction(Buffer.from(scaffoldB64, 'base64'), privateKey);
  const scaffoldSubmit = await submitSignedTransaction(client, resignedTransaction, {
    waitForCommit: true,
    pollIntervalMs: 250,
    timeoutMs: 15_000,
  });
  const scaffoldHash = String(scaffoldSubmit.hash);
  const scaffoldStatus = await ensureApplied(client, scaffoldHash, 'scaffold submit');

  process.stdout.write('Local Torii draft signing verification\n');
  process.stdout.write(`Client config: ${clientConfigPath}\n`);
  process.stdout.write(`Torii URL: ${toriiUrl}\n`);
  process.stdout.write(`Authority: ${authority}\n`);
  process.stdout.write(`Namespace: ${hubDeployment.namespace}\n`);
  process.stdout.write(`n3x contract id: ${hubDeployment.contractId}\n`);
  process.stdout.write(`Detached submit hash: ${detachedSubmit.tx_hash_hex}\n`);
  process.stdout.write(`Detached submit status: ${detachedStatus}\n`);
  process.stdout.write(`Scaffold submit hash: ${scaffoldHash}\n`);
  process.stdout.write(`Scaffold submit status: ${scaffoldStatus}\n`);
};

await main();
