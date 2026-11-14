-- Migration: retire budget_envelopes and budget_reservations
-- Run: npx prisma migrate deploy
-- These tables only ever held zero micro rows.

DROP TABLE IF EXISTS "budget_reservations";
DROP TABLE IF EXISTS "budget_envelopes";