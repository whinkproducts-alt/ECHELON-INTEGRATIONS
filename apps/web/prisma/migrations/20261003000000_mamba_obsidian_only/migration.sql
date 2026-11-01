-- MAMBA is Obsidian only (decision 2026-09-23). Normalise legacy WHITE / GREY values.
UPDATE "persona_states" SET "mambaMode" = 'OBSIDIAN' WHERE "mambaMode" IS NOT NULL AND "mambaMode" <> 'OBSIDIAN';
UPDATE "messages"       SET "mambaMode" = 'OBSIDIAN' WHERE "mambaMode" IS NOT NULL AND "mambaMode" <> 'OBSIDIAN';
UPDATE "hypotheses"     SET "mambaMode" = 'OBSIDIAN' WHERE "mambaMode" IS NOT NULL AND "mambaMode" <> 'OBSIDIAN';
UPDATE "actions"        SET "mambaMode" = 'OBSIDIAN' WHERE "mambaMode" IS NOT NULL AND "mambaMode" <> 'OBSIDIAN';
