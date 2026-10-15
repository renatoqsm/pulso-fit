-- Cloudflare D1 / SQLite physical schema. Domain types are generated from Prisma.

PRAGMA foreign_keys=ON;

CREATE TABLE "User" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "mfaEnabled" INTEGER NOT NULL DEFAULT 0,
  "mfaCipher" TEXT,
  "mfaIv" TEXT,
  "mfaSalt" TEXT,
  "mfaLastCounter" INTEGER,
  "mfaRecoveryHashes" TEXT NOT NULL DEFAULT '[]',
  "disabledAt" TEXT,
  "adminPermissions" TEXT NOT NULL DEFAULT '["VERIFY_CREDENTIALS","MANAGE_USERS","MANAGE_CATALOG"]',
  "role" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("email"),
  CHECK ("mfaEnabled" IS NULL OR "mfaEnabled" IN (0,1)),
  CHECK ("mfaRecoveryHashes" IS NULL OR json_valid("mfaRecoveryHashes")),
  CHECK ("adminPermissions" IS NULL OR json_valid("adminPermissions")),
  CHECK ("role" IN ('STUDENT','PROFESSIONAL','ADMIN'))
);

CREATE TABLE "Profile" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "bio" TEXT NOT NULL DEFAULT '',
  "specialty" TEXT NOT NULL DEFAULT '',
  "contact" TEXT NOT NULL DEFAULT '',
  "photoId" TEXT,
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Profile_userId_idx" ON "Profile" ("userId");

CREATE TABLE "Session" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("tokenHash"),
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Session_userId_idx" ON "Session" ("userId");

CREATE TABLE "ProfessionalCredential" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "professionalId" TEXT NOT NULL,
  "area" TEXT NOT NULL,
  "registration" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewerId" TEXT,
  "reviewedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("professionalId","area"),
  FOREIGN KEY ("professionalId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CHECK ("area" IN ('TRAINING','NUTRITION')),
  CHECK ("status" IN ('PENDING','VERIFIED','REJECTED'))
);

CREATE INDEX "ProfessionalCredential_professionalId_idx" ON "ProfessionalCredential" ("professionalId");

CREATE INDEX "ProfessionalCredential_reviewerId_idx" ON "ProfessionalCredential" ("reviewerId");

CREATE TABLE "Invitation" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "professionalId" TEXT NOT NULL,
  "area" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TEXT NOT NULL,
  "consumedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("tokenHash"),
  FOREIGN KEY ("professionalId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK ("area" IN ('TRAINING','NUTRITION'))
);

CREATE INDEX "Invitation_professionalId_idx" ON "Invitation" ("professionalId");

CREATE TABLE "ProfessionalStudentLink" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "studentId" TEXT NOT NULL,
  "professionalId" TEXT NOT NULL,
  "area" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "startedAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "endedAt" TEXT,
  "invitationId" TEXT NOT NULL,
  UNIQUE ("studentId","professionalId","area"),
  FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("professionalId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("invitationId") REFERENCES "Invitation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK ("area" IN ('TRAINING','NUTRITION')),
  CHECK ("status" IN ('ACTIVE','ENDED'))
);

CREATE INDEX "ProfessionalStudentLink_studentId_idx" ON "ProfessionalStudentLink" ("studentId");

CREATE INDEX "ProfessionalStudentLink_professionalId_idx" ON "ProfessionalStudentLink" ("professionalId");

CREATE INDEX "ProfessionalStudentLink_invitationId_idx" ON "ProfessionalStudentLink" ("invitationId");

CREATE TABLE "AccessConsent" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "linkId" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "grantedAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "revokedAt" TEXT,
  FOREIGN KEY ("linkId") REFERENCES "ProfessionalStudentLink" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK ("scope" IN ('TRAINING_HISTORY','NUTRITION_HISTORY'))
);

CREATE INDEX "AccessConsent_linkId_idx" ON "AccessConsent" ("linkId");

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog" ("actorId");

CREATE TABLE "RateLimit" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "count" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TEXT NOT NULL
);

CREATE TABLE "Exercise" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "source" TEXT NOT NULL,
  "externalId" TEXT,
  "ownerId" TEXT,
  "name" TEXT NOT NULL,
  "aliases" TEXT NOT NULL DEFAULT '[]',
  "description" TEXT NOT NULL DEFAULT '',
  "instructions" TEXT NOT NULL DEFAULT '',
  "searchText" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'OTHER',
  "sourceCategory" TEXT,
  "movementType" TEXT,
  "technicalLevel" TEXT,
  "active" INTEGER NOT NULL DEFAULT 1,
  "provenance" TEXT NOT NULL,
  "contentHash" TEXT,
  "sourceRevision" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updatedAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("source","externalId"),
  FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CHECK ("source" IN ('WGER','CUSTOM')),
  CHECK ("aliases" IS NULL OR json_valid("aliases")),
  CHECK ("category" IN ('STRENGTH','CARDIO','MOBILITY','OTHER')),
  CHECK ("active" IS NULL OR "active" IN (0,1)),
  CHECK ("provenance" IS NULL OR json_valid("provenance")),
  CHECK ((source='WGER' AND ownerId IS NULL AND externalId IS NOT NULL) OR (source='CUSTOM' AND ownerId IS NOT NULL AND externalId IS NULL))
);

CREATE INDEX "Exercise_ownerId_idx" ON "Exercise" ("ownerId");

CREATE TABLE "Muscle" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "alternateName" TEXT
);

CREATE TABLE "Equipment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL
);

CREATE TABLE "ExerciseMuscle" (
  "exerciseId" TEXT NOT NULL,
  "muscleId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  PRIMARY KEY ("exerciseId","muscleId","role"),
  FOREIGN KEY ("exerciseId") REFERENCES "Exercise" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("muscleId") REFERENCES "Muscle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK ("role" IN ('PRIMARY','SECONDARY'))
);

CREATE INDEX "ExerciseMuscle_exerciseId_idx" ON "ExerciseMuscle" ("exerciseId");

CREATE INDEX "ExerciseMuscle_muscleId_idx" ON "ExerciseMuscle" ("muscleId");

CREATE TABLE "ExerciseEquipment" (
  "exerciseId" TEXT NOT NULL,
  "equipmentId" TEXT NOT NULL,
  PRIMARY KEY ("exerciseId","equipmentId"),
  FOREIGN KEY ("exerciseId") REFERENCES "Exercise" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ExerciseEquipment_exerciseId_idx" ON "ExerciseEquipment" ("exerciseId");

CREATE INDEX "ExerciseEquipment_equipmentId_idx" ON "ExerciseEquipment" ("equipmentId");

CREATE TABLE "ExerciseFavorite" (
  "userId" TEXT NOT NULL,
  "exerciseId" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("userId","exerciseId"),
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("exerciseId") REFERENCES "Exercise" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ExerciseFavorite_userId_idx" ON "ExerciseFavorite" ("userId");

CREATE INDEX "ExerciseFavorite_exerciseId_idx" ON "ExerciseFavorite" ("exerciseId");

CREATE TABLE "ExerciseImportJob" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "source" TEXT NOT NULL,
  "revision" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "imported" INTEGER NOT NULL DEFAULT 0,
  "updated" INTEGER NOT NULL DEFAULT 0,
  "unchanged" INTEGER NOT NULL DEFAULT 0,
  "skipped" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT NOT NULL,
  "startedAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "finishedAt" TEXT,
  CHECK ("notes" IS NULL OR json_valid("notes"))
);

CREATE TABLE "WorkoutProgram" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "authorId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "template" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK ("template" IS NULL OR "template" IN (0,1))
);

CREATE INDEX "WorkoutProgram_authorId_idx" ON "WorkoutProgram" ("authorId");

CREATE TABLE "WorkoutVersion" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "programId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "draftRevision" INTEGER NOT NULL DEFAULT 0,
  "objective" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "validFrom" TEXT,
  "validUntil" TEXT,
  "publishedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("programId","number"),
  FOREIGN KEY ("programId") REFERENCES "WorkoutProgram" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "WorkoutVersion_programId_idx" ON "WorkoutVersion" ("programId");

CREATE TABLE "WorkoutDay" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "versionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "suggestedDays" TEXT NOT NULL DEFAULT '[]',
  "position" INTEGER NOT NULL,
  UNIQUE ("versionId","position"),
  FOREIGN KEY ("versionId") REFERENCES "WorkoutVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CHECK ("suggestedDays" IS NULL OR json_valid("suggestedDays"))
);

CREATE INDEX "WorkoutDay_versionId_idx" ON "WorkoutDay" ("versionId");

CREATE TABLE "WorkoutPrescriptionExercise" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "dayId" TEXT NOT NULL,
  "exerciseId" TEXT NOT NULL,
  "snapshot" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "groupKey" TEXT,
  UNIQUE ("dayId","position"),
  FOREIGN KEY ("dayId") REFERENCES "WorkoutDay" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CHECK ("snapshot" IS NULL OR json_valid("snapshot"))
);

CREATE INDEX "WorkoutPrescriptionExercise_dayId_idx" ON "WorkoutPrescriptionExercise" ("dayId");

CREATE TABLE "WorkoutPrescriptionSet" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "exerciseId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "repsMin" INTEGER,
  "repsMax" INTEGER,
  "targetKg" TEXT,
  "durationSeconds" INTEGER,
  "restSeconds" INTEGER NOT NULL DEFAULT 60,
  "kind" TEXT NOT NULL DEFAULT 'WORKING',
  "cadence" TEXT,
  "rpe" TEXT,
  "rir" INTEGER,
  "unilateral" INTEGER NOT NULL DEFAULT 0,
  "technique" TEXT,
  UNIQUE ("exerciseId","position"),
  FOREIGN KEY ("exerciseId") REFERENCES "WorkoutPrescriptionExercise" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CHECK ("unilateral" IS NULL OR "unilateral" IN (0,1)),
  CHECK (repsMin IS NULL OR repsMin>=0),
  CHECK (repsMax IS NULL OR repsMax>=coalesce(repsMin,0)),
  CHECK (targetKg IS NULL OR CAST(targetKg AS REAL)>=0),
  CHECK (durationSeconds IS NULL OR durationSeconds>=0),
  CHECK (restSeconds BETWEEN 0 AND 86400),
  CHECK (rir IS NULL OR rir BETWEEN 0 AND 100),
  CHECK (rpe IS NULL OR CAST(rpe AS REAL) BETWEEN 0 AND 10),
  CHECK (kind IN ('WARMUP','WORKING','TIMED','FAILURE'))
);

CREATE INDEX "WorkoutPrescriptionSet_exerciseId_idx" ON "WorkoutPrescriptionSet" ("exerciseId");

CREATE TABLE "WorkoutAssignment" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "versionId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("versionId","studentId"),
  FOREIGN KEY ("versionId") REFERENCES "WorkoutVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "WorkoutAssignment_versionId_idx" ON "WorkoutAssignment" ("versionId");

CREATE INDEX "WorkoutAssignment_studentId_idx" ON "WorkoutAssignment" ("studentId");

CREATE TABLE "WorkoutSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "studentId" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "dayId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  "revision" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "endedAt" TEXT,
  "effort" INTEGER,
  "difficulty" INTEGER,
  "feedback" TEXT NOT NULL DEFAULT '',
  "discomfort" TEXT NOT NULL DEFAULT '',
  "technicalDifficulty" INTEGER NOT NULL DEFAULT 0,
  "rating" INTEGER,
  FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("versionId") REFERENCES "WorkoutVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("dayId") REFERENCES "WorkoutDay" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK ("status" IN ('IN_PROGRESS','COMPLETED','INTERRUPTED')),
  CHECK ("technicalDifficulty" IS NULL OR "technicalDifficulty" IN (0,1)),
  CHECK (revision>=0),
  CHECK ((status='IN_PROGRESS' AND endedAt IS NULL) OR (status<>'IN_PROGRESS' AND endedAt IS NOT NULL AND endedAt>=startedAt)),
  CHECK (effort IS NULL OR effort BETWEEN 0 AND 10),
  CHECK (difficulty IS NULL OR difficulty BETWEEN 0 AND 10),
  CHECK (rating IS NULL OR rating BETWEEN 1 AND 5)
);

CREATE INDEX "WorkoutSession_studentId_idx" ON "WorkoutSession" ("studentId");

CREATE INDEX "WorkoutSession_versionId_idx" ON "WorkoutSession" ("versionId");

CREATE INDEX "WorkoutSession_dayId_idx" ON "WorkoutSession" ("dayId");

CREATE TABLE "WorkoutSessionExercise" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "sessionId" TEXT NOT NULL,
  "prescriptionExerciseId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "substituteId" TEXT,
  "substituteSnapshot" TEXT,
  "notes" TEXT NOT NULL DEFAULT '',
  UNIQUE ("sessionId","prescriptionExerciseId"),
  FOREIGN KEY ("sessionId") REFERENCES "WorkoutSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("prescriptionExerciseId") REFERENCES "WorkoutPrescriptionExercise" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK ("substituteSnapshot" IS NULL OR json_valid("substituteSnapshot"))
);

CREATE INDEX "WorkoutSessionExercise_sessionId_idx" ON "WorkoutSessionExercise" ("sessionId");

CREATE INDEX "WorkoutSessionExercise_prescriptionExerciseId_idx" ON "WorkoutSessionExercise" ("prescriptionExerciseId");

CREATE TABLE "WorkoutSessionSet" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "sessionExerciseId" TEXT NOT NULL,
  "prescriptionSetId" TEXT NOT NULL,
  "actualReps" INTEGER,
  "actualKg" TEXT,
  "actualSeconds" INTEGER,
  "rpe" TEXT,
  "rir" INTEGER,
  "completedAt" TEXT,
  UNIQUE ("sessionExerciseId","prescriptionSetId"),
  FOREIGN KEY ("sessionExerciseId") REFERENCES "WorkoutSessionExercise" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("prescriptionSetId") REFERENCES "WorkoutPrescriptionSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK (actualReps IS NULL OR actualReps>=0),
  CHECK (actualKg IS NULL OR CAST(actualKg AS REAL)>=0),
  CHECK (actualSeconds IS NULL OR actualSeconds>=0),
  CHECK (rpe IS NULL OR CAST(rpe AS REAL) BETWEEN 0 AND 10),
  CHECK (rir IS NULL OR rir BETWEEN 0 AND 100)
);

CREATE INDEX "WorkoutSessionSet_sessionExerciseId_idx" ON "WorkoutSessionSet" ("sessionExerciseId");

CREATE INDEX "WorkoutSessionSet_prescriptionSetId_idx" ON "WorkoutSessionSet" ("prescriptionSetId");

CREATE TABLE "WorkoutReply" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "sessionId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY ("sessionId") REFERENCES "WorkoutSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "WorkoutReply_sessionId_idx" ON "WorkoutReply" ("sessionId");

CREATE TABLE "ActivityOutbox" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("sessionId"),
  CHECK ("payload" IS NULL OR json_valid("payload"))
);

CREATE TABLE "Food" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "ownerId" TEXT,
  "source" TEXT NOT NULL,
  "externalId" TEXT,
  "sourceVersion" TEXT,
  "name" TEXT NOT NULL,
  "aliases" TEXT NOT NULL DEFAULT '[]',
  "searchText" TEXT NOT NULL,
  "preparation" TEXT NOT NULL DEFAULT '',
  "referenceUnit" TEXT NOT NULL,
  "nutrients" TEXT NOT NULL,
  "provenance" TEXT NOT NULL,
  "active" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("source","externalId"),
  FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CHECK ("aliases" IS NULL OR json_valid("aliases")),
  CHECK ("nutrients" IS NULL OR json_valid("nutrients")),
  CHECK ("provenance" IS NULL OR json_valid("provenance")),
  CHECK ("active" IS NULL OR "active" IN (0,1)),
  CHECK (referenceUnit IN ('g','ml')),
  CHECK ((source='CUSTOM' AND ownerId IS NOT NULL AND externalId IS NULL) OR (source='USDA_FDC' AND ownerId IS NULL AND externalId IS NOT NULL))
);

CREATE INDEX "Food_ownerId_idx" ON "Food" ("ownerId");

CREATE TABLE "FoodMeasure" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "foodId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "provenance" TEXT NOT NULL,
  FOREIGN KEY ("foodId") REFERENCES "Food" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK (CAST(quantity AS REAL)>0),
  CHECK (unit IN ('g','ml'))
);

CREATE INDEX "FoodMeasure_foodId_idx" ON "FoodMeasure" ("foodId");

CREATE TABLE "NutritionPlan" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "authorId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "NutritionPlan_authorId_idx" ON "NutritionPlan" ("authorId");

CREATE TABLE "NutritionVersion" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "planId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "draftRevision" INTEGER NOT NULL DEFAULT 0,
  "objective" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "validFrom" TEXT,
  "publishedAt" TEXT,
  UNIQUE ("planId","number"),
  FOREIGN KEY ("planId") REFERENCES "NutritionPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "NutritionVersion_planId_idx" ON "NutritionVersion" ("planId");

CREATE TABLE "NutritionMeal" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "versionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "time" TEXT,
  "position" INTEGER NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  UNIQUE ("versionId","position"),
  FOREIGN KEY ("versionId") REFERENCES "NutritionVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "NutritionMeal_versionId_idx" ON "NutritionMeal" ("versionId");

CREATE TABLE "NutritionMealItem" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "mealId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "foodId" TEXT NOT NULL,
  "quantity" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "snapshot" TEXT NOT NULL,
  "substitutions" TEXT NOT NULL,
  UNIQUE ("mealId","position"),
  FOREIGN KEY ("mealId") REFERENCES "NutritionMeal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CHECK ("snapshot" IS NULL OR json_valid("snapshot")),
  CHECK ("substitutions" IS NULL OR json_valid("substitutions")),
  CHECK (CAST(quantity AS REAL)>0),
  CHECK (unit IN ('g','ml'))
);

CREATE INDEX "NutritionMealItem_mealId_idx" ON "NutritionMealItem" ("mealId");

CREATE TABLE "NutritionAssignment" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "versionId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  UNIQUE ("versionId","studentId"),
  FOREIGN KEY ("versionId") REFERENCES "NutritionVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "NutritionAssignment_versionId_idx" ON "NutritionAssignment" ("versionId");

CREATE INDEX "NutritionAssignment_studentId_idx" ON "NutritionAssignment" ("studentId");

CREATE TABLE "MealLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "studentId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "mealName" TEXT NOT NULL,
  "prescribedMealId" TEXT,
  "consumedAt" TEXT,
  "notes" TEXT NOT NULL DEFAULT '',
  "revision" INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK (revision>=0)
);

CREATE INDEX "MealLog_studentId_idx" ON "MealLog" ("studentId");

CREATE TABLE "MealLogItem" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "logId" TEXT NOT NULL,
  "foodId" TEXT NOT NULL,
  "quantity" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "snapshot" TEXT NOT NULL,
  FOREIGN KEY ("logId") REFERENCES "MealLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CHECK ("snapshot" IS NULL OR json_valid("snapshot")),
  CHECK (CAST(quantity AS REAL)>0),
  CHECK (unit IN ('g','ml'))
);

CREATE INDEX "MealLogItem_logId_idx" ON "MealLogItem" ("logId");

CREATE TABLE "NutritionReply" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "logId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY ("logId") REFERENCES "MealLog" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "NutritionReply_logId_idx" ON "NutritionReply" ("logId");

CREATE TABLE "MediaAsset" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "ownerId" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "data" BLOB NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "MediaAsset_ownerId_idx" ON "MediaAsset" ("ownerId");

CREATE TABLE "DeletionRequest" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_RETENTION_REVIEW',
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "DeletionRequest_userId_idx" ON "DeletionRequest" ("userId");

CREATE UNIQUE INDEX one_active_workout_session ON WorkoutSession(studentId) WHERE status='IN_PROGRESS';

CREATE UNIQUE INDEX one_prescribed_meal_per_day ON MealLog(studentId,date,prescribedMealId) WHERE prescribedMealId IS NOT NULL;

CREATE INDEX food_source_active_idx ON Food(source,active);

CREATE INDEX exercise_source_active_idx ON Exercise(source,active);

CREATE INDEX workout_student_started_idx ON WorkoutSession(studentId,startedAt);

CREATE INDEX meal_student_date_idx ON MealLog(studentId,date);

CREATE INDEX rate_expiry_idx ON RateLimit(expiresAt);

CREATE TABLE "__StoreClock" (id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL DEFAULT 0);

INSERT INTO "__StoreClock" (id,revision) VALUES (1,0);

CREATE TABLE "__CommitGuard" (id TEXT PRIMARY KEY,revision INTEGER NOT NULL);

CREATE TRIGGER assert_store_revision BEFORE INSERT ON "__CommitGuard" BEGIN SELECT CASE WHEN NEW.revision<>(SELECT revision FROM "__StoreClock" WHERE id=1) THEN RAISE(ABORT,'PULSO_WRITE_CONFLICT') END; UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;
