-- Protect the distinction between shared source records and private exercises.
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_source_ownership_check" CHECK (
  ("source" = 'WGER' AND "ownerId" IS NULL AND "externalId" IS NOT NULL)
  OR ("source" = 'CUSTOM' AND "ownerId" IS NOT NULL AND "externalId" IS NULL)
);
