/**
 * Manual smoke test: list gateway tools through the adapter and show the names
 * WHINK would register. Usage (token comes from the environment, never printed):
 *   OPENCLAW_URL=http://localhost:3100 OPENCLAW_TOKEN=... npx tsx --tsconfig tsconfig.json scripts/gateway-smoke.ts [toolName jsonArgs]
 */
import { listOpenClawTools, callOpenClawTool } from '../lib/openclaw-client';

async function main(): Promise<void> {
  const tools = await listOpenClawTools();
  for (const t of tools) console.log(`openclaw__${t.name}`);
  const [name, args] = process.argv.slice(2);
  if (name) console.log(JSON.stringify(await callOpenClawTool(name, args ? JSON.parse(args) : {})));
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : 'failed');
  process.exit(1);
});
