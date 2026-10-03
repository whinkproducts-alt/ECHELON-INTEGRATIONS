import { readFileSync } from 'node:fs';
import { parseConfig } from './config.js';
import { Aggregator } from './aggregator.js';
import { createGateway } from './server.js';
import { log } from './log.js';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

function main(): void {
  const port = Number.parseInt(process.env.PORT ?? '3100', 10);
  const host = process.env.HOST ?? '127.0.0.1';
  const token = process.env.OPENCLAW_TOKEN?.trim() || undefined;
  const configPath = process.env.CONFIG_PATH ?? '/app/config/servers.json';

  if (!token && !LOOPBACK.has(host)) {
    log.error('refusing to bind a non-loopback address without OPENCLAW_TOKEN');
    process.exit(1);
  }
  if (!token) log.warn('OPENCLAW_TOKEN is not set: requests are unauthenticated (loopback only)');

  const configs = parseConfig(readFileSync(configPath, 'utf8'));
  const agg = new Aggregator(configs);
  const server = createGateway(agg, token);
  server.listen(port, host, () => {
    log.info('gateway listening', { host, port, upstreams: configs.map((c) => c.platform) });
    void agg.refresh();
  });

  const shutdown = (): void => {
    server.close();
    void agg.close().finally(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();
