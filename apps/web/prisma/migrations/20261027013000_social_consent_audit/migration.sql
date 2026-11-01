-- Persist the consent version and timestamp that authorised a social connection.
ALTER TABLE "social_connections"
  ADD COLUMN "consentGrantedAt" TIMESTAMP(3),
  ADD COLUMN "consentTextVersion" TEXT;

ALTER TABLE "oauth_states"
  ADD COLUMN "consentGrantedAt" TIMESTAMP(3),
  ADD COLUMN "consentTextVersion" TEXT;
