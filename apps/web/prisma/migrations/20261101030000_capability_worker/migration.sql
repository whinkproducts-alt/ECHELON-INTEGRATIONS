ALTER TABLE "agent_jobs"
  ADD COLUMN "capabilityRequestEnc" TEXT,
  ADD COLUMN "capabilityRequestHash" TEXT,
  ADD COLUMN "capabilityReceiptId" TEXT,
  ADD COLUMN "capabilityApprovalId" TEXT;
