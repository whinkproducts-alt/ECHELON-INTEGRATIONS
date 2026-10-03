import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseConfig, ConfigError } from './config.js';
import { Aggregator } from './aggregator.js';
import { createGateway, parseAllowedHosts } from './server.js';
import { log } from './log.js';

function main(): void {
  const port = Number.parseInt(process.env.PORT ?? '3100', 10);
  const host = process.env.HOST ?? '127.0.0.1';
  const token = process.env.OPENCLAW_TOKEN?.trim() || undefined;
  const configPath = process.env.CONFIG_PATH ?? '/app/config/servers.json';

  if (!token) {
    log.error('refusing to start without OPENCLAW_TOKEN');
    process.exit(1);
  }

  // Optional untracked override: <config dir>/local/servers.json replaces the tracked file.
  const localPath = join(dirname(configPath), 'local', 'servers.json');
  const useLocal = existsSync(localPath);
  let configs;
  try {
    configs = parseConfig(readFileSync(useLocal ? localPath : configPath, 'utf8'));
  } catch (err) {
    // ConfigError messages are fixed strings that never contain config values.
    log.error('invalid config', { source: useLocal ? 'local override' : 'default', reason: err instanceof ConfigError ? err.message : 'unreadable' });
    process.exit(1);
  }
  log.info('config loaded', { source: useLocal ? 'config/local/servers.json' : 'config/servers.json' });
  const agg = new Aggregator(configs);
  const server = createGateway(agg, token, parseAllowedHosts(process.env.GATEWAY_ALLOWED_HOSTS));
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
