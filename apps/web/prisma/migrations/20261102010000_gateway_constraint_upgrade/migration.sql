-- Forward upgrade for databases that applied the original gateway migration
-- before its foreign-key actions were strengthened. Preserve all rows.
BEGIN;
ALTER TABLE "actions" DROP CONSTRAINT IF EXISTS "actions_connectorInstallId_fkey";
ALTER TABLE "actions" ADD CONSTRAINT "actions_connectorInstallId_fkey" FOREIGN KEY ("connectorInstallId") REFERENCES "connector_installs"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "actions" DROP CONSTRAINT IF EXISTS "actions_capabilityId_fkey";
ALTER TABLE "actions" ADD CONSTRAINT "actions_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "tools"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "actions" DROP CONSTRAINT IF EXISTS "actions_hostId_fkey";
ALTER TABLE "actions" ADD CONSTRAINT "actions_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "hosts"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "capability_grants" DROP CONSTRAINT IF EXISTS "capability_grants_executionPlanId_fkey";
ALTER TABLE "capability_grants" ADD CONSTRAINT "capability_grants_executionPlanId_fkey" FOREIGN KEY ("executionPlanId") REFERENCES "execution_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;
