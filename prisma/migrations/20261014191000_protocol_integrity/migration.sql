CREATE UNIQUE INDEX "WorkoutSession_one_active_per_student" ON "WorkoutSession"("studentId") WHERE "status"='IN_PROGRESS';
ALTER TABLE "WorkoutPrescriptionSet" ADD CONSTRAINT "WorkoutPrescriptionSet_valid_ranges" CHECK (("repsMin" IS NULL OR "repsMin">=0) AND ("repsMax" IS NULL OR "repsMax">=COALESCE("repsMin",0)) AND ("targetKg" IS NULL OR "targetKg">=0) AND "restSeconds">=0);
ALTER TABLE "Food" ADD CONSTRAINT "Food_reference_unit" CHECK ("referenceUnit" IN ('g','ml'));
ALTER TABLE "Food" ADD CONSTRAINT "Food_global_or_private" CHECK (("source"='CUSTOM' AND "ownerId" IS NOT NULL AND "externalId" IS NULL) OR ("source"<>'CUSTOM' AND "ownerId" IS NULL AND "externalId" IS NOT NULL));
CREATE FUNCTION pulso_workout_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE published timestamptz;
BEGIN
 IF TG_TABLE_NAME='WorkoutVersion' THEN published:=OLD."publishedAt";
 ELSIF TG_TABLE_NAME='WorkoutDay' THEN SELECT "publishedAt" INTO published FROM "WorkoutVersion" WHERE "id"=OLD."versionId";
 ELSIF TG_TABLE_NAME='WorkoutPrescriptionExercise' THEN SELECT v."publishedAt" INTO published FROM "WorkoutDay" d JOIN "WorkoutVersion" v ON v."id"=d."versionId" WHERE d."id"=OLD."dayId";
 ELSE SELECT v."publishedAt" INTO published FROM "WorkoutPrescriptionExercise" e JOIN "WorkoutDay" d ON d."id"=e."dayId" JOIN "WorkoutVersion" v ON v."id"=d."versionId" WHERE e."id"=OLD."exerciseId";
 END IF;
 IF published IS NOT NULL THEN RAISE EXCEPTION 'Published workout is immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER immutable_workout_version BEFORE UPDATE OR DELETE ON "WorkoutVersion" FOR EACH ROW EXECUTE FUNCTION pulso_workout_immutable();
CREATE TRIGGER immutable_workout_day BEFORE UPDATE OR DELETE ON "WorkoutDay" FOR EACH ROW EXECUTE FUNCTION pulso_workout_immutable();
CREATE TRIGGER immutable_workout_exercise BEFORE UPDATE OR DELETE ON "WorkoutPrescriptionExercise" FOR EACH ROW EXECUTE FUNCTION pulso_workout_immutable();
CREATE TRIGGER immutable_workout_set BEFORE UPDATE OR DELETE ON "WorkoutPrescriptionSet" FOR EACH ROW EXECUTE FUNCTION pulso_workout_immutable();
CREATE FUNCTION pulso_nutrition_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE published timestamptz;
BEGIN
 IF TG_TABLE_NAME='NutritionVersion' THEN published:=OLD."publishedAt";
 ELSIF TG_TABLE_NAME='NutritionMeal' THEN SELECT "publishedAt" INTO published FROM "NutritionVersion" WHERE "id"=OLD."versionId";
 ELSE SELECT v."publishedAt" INTO published FROM "NutritionMeal" m JOIN "NutritionVersion" v ON v."id"=m."versionId" WHERE m."id"=OLD."mealId";
 END IF;
 IF published IS NOT NULL THEN RAISE EXCEPTION 'Published nutrition plan is immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER immutable_nutrition_version BEFORE UPDATE OR DELETE ON "NutritionVersion" FOR EACH ROW EXECUTE FUNCTION pulso_nutrition_immutable();
CREATE TRIGGER immutable_nutrition_meal BEFORE UPDATE OR DELETE ON "NutritionMeal" FOR EACH ROW EXECUTE FUNCTION pulso_nutrition_immutable();
CREATE TRIGGER immutable_nutrition_item BEFORE UPDATE OR DELETE ON "NutritionMealItem" FOR EACH ROW EXECUTE FUNCTION pulso_nutrition_immutable();
