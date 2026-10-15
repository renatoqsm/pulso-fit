-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'INTERRUPTED');

-- CreateTable
CREATE TABLE "WorkoutProgram" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "template" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutVersion" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "draftRevision" INTEGER NOT NULL DEFAULT 0,
    "objective" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutDay" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "suggestedDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "position" INTEGER NOT NULL,

    CONSTRAINT "WorkoutDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutPrescriptionExercise" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "position" INTEGER NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "groupKey" TEXT,

    CONSTRAINT "WorkoutPrescriptionExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutPrescriptionSet" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "repsMin" INTEGER,
    "repsMax" INTEGER,
    "targetKg" DECIMAL(10,3),
    "durationSeconds" INTEGER,
    "restSeconds" INTEGER NOT NULL DEFAULT 60,
    "kind" TEXT NOT NULL DEFAULT 'WORKING',
    "cadence" TEXT,
    "rpe" DECIMAL(4,1),
    "rir" INTEGER,
    "unilateral" BOOLEAN NOT NULL DEFAULT false,
    "technique" TEXT,

    CONSTRAINT "WorkoutPrescriptionSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutAssignment" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutSession" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "effort" INTEGER,
    "difficulty" INTEGER,
    "feedback" TEXT NOT NULL DEFAULT '',
    "discomfort" TEXT NOT NULL DEFAULT '',
    "technicalDifficulty" BOOLEAN NOT NULL DEFAULT false,
    "rating" INTEGER,

    CONSTRAINT "WorkoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutSessionExercise" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "prescriptionExerciseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "substituteId" TEXT,
    "substituteSnapshot" JSONB,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "WorkoutSessionExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutSessionSet" (
    "id" TEXT NOT NULL,
    "sessionExerciseId" TEXT NOT NULL,
    "prescriptionSetId" TEXT NOT NULL,
    "actualReps" INTEGER,
    "actualKg" DECIMAL(10,3),
    "actualSeconds" INTEGER,
    "rpe" DECIMAL(4,1),
    "rir" INTEGER,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WorkoutSessionSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutReply" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityOutbox" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Food" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "source" TEXT NOT NULL,
    "externalId" TEXT,
    "sourceVersion" TEXT,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "searchText" TEXT NOT NULL,
    "preparation" TEXT NOT NULL DEFAULT '',
    "referenceUnit" TEXT NOT NULL,
    "nutrients" JSONB NOT NULL,
    "provenance" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Food_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodMeasure" (
    "id" TEXT NOT NULL,
    "foodId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "provenance" TEXT NOT NULL,

    CONSTRAINT "FoodMeasure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionPlan" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NutritionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionVersion" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "draftRevision" INTEGER NOT NULL DEFAULT 0,
    "objective" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "validFrom" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "NutritionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionMeal" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "time" TEXT,
    "position" INTEGER NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "NutritionMeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionMealItem" (
    "id" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "foodId" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "substitutions" JSONB NOT NULL,

    CONSTRAINT "NutritionMealItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionAssignment" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,

    CONSTRAINT "NutritionAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealLog" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "mealName" TEXT NOT NULL,
    "prescribedMealId" TEXT,
    "consumedAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MealLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealLogItem" (
    "id" TEXT NOT NULL,
    "logId" TEXT NOT NULL,
    "foodId" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "MealLogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionReply" (
    "id" TEXT NOT NULL,
    "logId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NutritionReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkoutProgram_authorId_idx" ON "WorkoutProgram"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutVersion_programId_number_key" ON "WorkoutVersion"("programId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutDay_versionId_position_key" ON "WorkoutDay"("versionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutPrescriptionExercise_dayId_position_key" ON "WorkoutPrescriptionExercise"("dayId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutPrescriptionSet_exerciseId_position_key" ON "WorkoutPrescriptionSet"("exerciseId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutAssignment_versionId_studentId_key" ON "WorkoutAssignment"("versionId", "studentId");

-- CreateIndex
CREATE INDEX "WorkoutSession_studentId_startedAt_idx" ON "WorkoutSession"("studentId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutSessionExercise_sessionId_prescriptionExerciseId_key" ON "WorkoutSessionExercise"("sessionId", "prescriptionExerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutSessionSet_sessionExerciseId_prescriptionSetId_key" ON "WorkoutSessionSet"("sessionExerciseId", "prescriptionSetId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityOutbox_sessionId_key" ON "ActivityOutbox"("sessionId");

-- CreateIndex
CREATE INDEX "Food_ownerId_active_idx" ON "Food"("ownerId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Food_source_externalId_key" ON "Food"("source", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "NutritionVersion_planId_number_key" ON "NutritionVersion"("planId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "NutritionMeal_versionId_position_key" ON "NutritionMeal"("versionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "NutritionMealItem_mealId_position_key" ON "NutritionMealItem"("mealId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "NutritionAssignment_versionId_studentId_key" ON "NutritionAssignment"("versionId", "studentId");

-- CreateIndex
CREATE INDEX "MealLog_studentId_date_idx" ON "MealLog"("studentId", "date");

-- AddForeignKey
ALTER TABLE "WorkoutProgram" ADD CONSTRAINT "WorkoutProgram_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutVersion" ADD CONSTRAINT "WorkoutVersion_programId_fkey" FOREIGN KEY ("programId") REFERENCES "WorkoutProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutDay" ADD CONSTRAINT "WorkoutDay_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "WorkoutVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutPrescriptionExercise" ADD CONSTRAINT "WorkoutPrescriptionExercise_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "WorkoutDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutPrescriptionSet" ADD CONSTRAINT "WorkoutPrescriptionSet_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "WorkoutPrescriptionExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutAssignment" ADD CONSTRAINT "WorkoutAssignment_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "WorkoutVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutAssignment" ADD CONSTRAINT "WorkoutAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "WorkoutVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "WorkoutDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSessionExercise" ADD CONSTRAINT "WorkoutSessionExercise_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkoutSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSessionExercise" ADD CONSTRAINT "WorkoutSessionExercise_prescriptionExerciseId_fkey" FOREIGN KEY ("prescriptionExerciseId") REFERENCES "WorkoutPrescriptionExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSessionSet" ADD CONSTRAINT "WorkoutSessionSet_sessionExerciseId_fkey" FOREIGN KEY ("sessionExerciseId") REFERENCES "WorkoutSessionExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSessionSet" ADD CONSTRAINT "WorkoutSessionSet_prescriptionSetId_fkey" FOREIGN KEY ("prescriptionSetId") REFERENCES "WorkoutPrescriptionSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutReply" ADD CONSTRAINT "WorkoutReply_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkoutSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Food" ADD CONSTRAINT "Food_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodMeasure" ADD CONSTRAINT "FoodMeasure_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionPlan" ADD CONSTRAINT "NutritionPlan_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionVersion" ADD CONSTRAINT "NutritionVersion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "NutritionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionMeal" ADD CONSTRAINT "NutritionMeal_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "NutritionVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionMealItem" ADD CONSTRAINT "NutritionMealItem_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "NutritionMeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionAssignment" ADD CONSTRAINT "NutritionAssignment_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "NutritionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionAssignment" ADD CONSTRAINT "NutritionAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealLog" ADD CONSTRAINT "MealLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealLogItem" ADD CONSTRAINT "MealLogItem_logId_fkey" FOREIGN KEY ("logId") REFERENCES "MealLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionReply" ADD CONSTRAINT "NutritionReply_logId_fkey" FOREIGN KEY ("logId") REFERENCES "MealLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

