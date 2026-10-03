/**
 * Compute the defHash of every tool the live gateway advertises, for pasting
 * into config/tool-classes.json after you have reviewed the tool. The hash is
 * of the SANITISED definition, the same one WHINK registers.
 *
 * Usage (token comes from the environment and is never printed):
 *   OPENCLAW_URL=http://127.0.0.1:3100 OPENCLAW_TOKEN=... npx tsx --tsconfig tsconfig.json scripts/tool-def-hash.ts
 */
import { listOpenClawTools } from '../lib/openclaw-client';
import { defHash } from '../lib/tool-definition';

async function main(): Promise<void> {
  const tools = await listOpenClawTools();
  for (const t of tools) {
    const hash = defHash({ description: t.description, inputSchema: t.inputSchema });
    console.log(`${`openclaw__${t.name.toLowerCase()}`}\t${hash}`);
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : 'failed');
  process.exit(1);
});
