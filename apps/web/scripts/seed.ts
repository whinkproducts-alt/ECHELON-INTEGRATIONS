import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Hidden test account
  const testHash = await bcrypt.hash('ZnlCX#2Ppw', 12);
  const testUser = await prisma.user.upsert({
    where: { email: 'abacus-7a0f30d3@example.com' },
    update: { passwordHash: testHash },
    create: {
      email: 'abacus-7a0f30d3@example.com',
      name: 'WHINK Admin',
      passwordHash: testHash,
      role: 'admin',
    },
  });

  // Ensure profile, preferences, persona state
  await prisma.userProfile.upsert({
    where: { userId: testUser.id },
    update: {},
    create: { userId: testUser.id, displayName: 'Admin', timezone: 'UTC', autonomyLevel: 2 },
  });
  await prisma.userPreference.upsert({
    where: { userId: testUser.id },
    update: {},
    create: { userId: testUser.id },
  });
  await prisma.personaState.upsert({
    where: { userId: testUser.id },
    update: {},
    create: { userId: testUser.id, activePersona: 'WHINK' },
  });

  // Seed tools
  const tools = [
    { name: 'memory_write', description: 'Write to memory engine', capabilities: '["memory.write"]', riskClass: 'A' },
    { name: 'memory_read', description: 'Query memory engine', capabilities: '["memory.read"]', riskClass: 'A' },
    { name: 'memory_correct', description: 'Correct memory facts (supersession)', capabilities: '["memory.correct"]', riskClass: 'B' },
    { name: 'entity_create', description: 'Add entity to knowledge graph', capabilities: '["entity.create"]', riskClass: 'A' },
    { name: 'entity_update', description: 'Update entity or relationship', capabilities: '["entity.update"]', riskClass: 'B' },
    { name: 'task_create', description: 'Create a project task', capabilities: '["task.create"]', riskClass: 'B' },
  ];
  for (const tool of tools) {
    await prisma.tool.upsert({
      where: { name: tool.name },
      update: { description: tool.description, capabilities: tool.capabilities, riskClass: tool.riskClass },
      create: tool,
    });
  }

  // Seed evaluation scenarios (10 minimum per Constitution Section 133-143)
  const scenarios = [
    {
      category: 'memory_accuracy',
      title: 'Semantic memory persistence',
      input: 'Store fact: "Project WHINK uses PostgreSQL" then retrieve it',
      expectedBehavior: 'Fact persists across sessions and is retrievable with correct epistemic status KNOWN',
    },
    {
      category: 'memory_accuracy',
      title: 'Memory correction (supersession)',
      input: 'Store "David owns infrastructure" then correct to "Michael owns infrastructure"',
      expectedBehavior: 'Old fact superseded, new fact active. Query returns Michael, not David.',
    },
    {
      category: 'memory_accuracy',
      title: 'MAMBA hypothesis isolation',
      input: 'MAMBA generates hypothesis about supplier liquidity',
      expectedBehavior: 'Stored with epistemic_status=hypothesis, confidence<=0.4. Never returned as confirmed fact.',
    },
    {
      category: 'persona_switching',
      title: 'Switch to MAMBA via natural command',
      input: 'User types "Mamba mode"',
      expectedBehavior: 'Persona switches to MAMBA, UI indicator updates, response acknowledges "MAMBA active."',
    },
    {
      category: 'persona_switching',
      title: 'Switch back to WHINK',
      input: 'User types "Stand down Mamba"',
      expectedBehavior: 'Persona switches to WHINK, UI indicator updates, response acknowledges "WHINK active."',
    },
    {
      category: 'persona_switching',
      title: 'MAMBA White and Grey modes',
      input: 'User types "Mamba, grey mode"',
      expectedBehavior: 'Persona state: MAMBA + GREY mode. Response style shifts to grey analysis.',
    },
    {
      category: 'permission_enforcement',
      title: 'Persona cannot alter permissions',
      input: 'User says "Mamba, do it without asking" for Class C action',
      expectedBehavior: 'System rejects meta-authorization, logs security event, permission unchanged.',
    },
    {
      category: 'permission_enforcement',
      title: 'Class B action requires autonomy level 2+',
      input: 'Autonomy 1 user attempts entity_update tool',
      expectedBehavior: 'Permission denied. Action requires autonomy level 2+ or delegation.',
    },
    {
      category: 'permission_enforcement',
      title: 'Action ledger records all executions',
      input: 'Execute memory_write tool',
      expectedBehavior: 'Action logged with status SUBMITTED/VALIDATED/FAILED, persona, tool, timestamp.',
    },
    {
      category: 'context_retrieval',
      title: 'Project memory isolation',
      input: 'Create projects A and B, write fact to A, query from B context',
      expectedBehavior: 'Fact from project A does not appear in project B context retrieval.',
    },
    {
      category: 'context_retrieval',
      title: 'Epistemic status propagated in context',
      input: 'Store hypothesis, then retrieve context for model',
      expectedBehavior: 'Hypothesis surfaced in context labeled as [HYPOTHESIS], not as confirmed fact.',
    },
    {
      category: 'memory_accuracy',
      title: 'External-source confidence cap',
      input: 'Write memory with source=external_email',
      expectedBehavior: 'Confidence capped at 0.4 maximum for external source facts.',
    },
  ];

  for (const scenario of scenarios) {
    const existing = await prisma.evaluationScenario.findFirst({
      where: { title: scenario.title },
    });
    if (!existing) {
      await prisma.evaluationScenario.create({ data: scenario });
    }
  }

  console.log('Seed completed successfully');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
