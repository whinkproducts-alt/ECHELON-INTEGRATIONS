import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './server.js';
import { isPlatform } from './tools.js';

const i = process.argv.indexOf('--platform');
const platform: unknown = i >= 0 ? process.argv[i + 1] : undefined;
if (!isPlatform(platform)) {
  process.stderr.write('usage: --platform x|instagram|tiktok\n');
  process.exit(2);
}
await buildServer(platform).connect(new StdioServerTransport());
