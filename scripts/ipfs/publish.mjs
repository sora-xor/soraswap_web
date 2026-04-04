import {
  buildAndPublishIpfsSite,
  ensureIpfsCli,
  ensureIpfsDaemon,
  logIpfsRepoSelection,
  logPublishSummary,
  resolveGatewayUrl,
  stopManagedIpfsDaemon,
} from './shared.mjs';

try {
  logIpfsRepoSelection();
  await ensureIpfsCli();

  const ipfsReady = await ensureIpfsDaemon();
  if (!ipfsReady) {
    throw new Error('IPFS daemon did not become ready.');
  }

  const gatewayUrl = await resolveGatewayUrl();
  const summary = await buildAndPublishIpfsSite({ gatewayUrl });
  logPublishSummary(summary);
} catch (error) {
  console.error(`[ipfs] Publish failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  stopManagedIpfsDaemon();
}
