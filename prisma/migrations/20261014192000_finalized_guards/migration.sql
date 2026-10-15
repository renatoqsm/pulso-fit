CREATE UNIQUE INDEX "MealLog_planned_meal_per_day" ON "MealLog"("studentId","date","prescribedMealId") WHERE "prescribedMealId" IS NOT NULL;
ALTER TABLE "MealLogItem" ADD CONSTRAINT "MealLogItem_positive_quantity" CHECK ("quantity">0 AND "unit" IN ('g','ml'));
ALTER TABLE "NutritionMealItem" ADD CONSTRAINT "NutritionMealItem_positive_quantity" CHECK ("quantity">0 AND "unit" IN ('g','ml'));
CREATE FUNCTION pulso_published_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE published timestamptz;
BEGIN
 IF TG_TABLE_NAME='WorkoutDay' THEN SELECT "publishedAt" INTO published FROM "WorkoutVersion" WHERE "id"=NEW."versionId";
 ELSIF TG_TABLE_NAME='WorkoutPrescriptionExercise' THEN SELECT v."publishedAt" INTO published FROM "WorkoutDay" d JOIN "WorkoutVersion" v ON v."id"=d."versionId" WHERE d."id"=NEW."dayId";
 ELSIF TG_TABLE_NAME='WorkoutPrescriptionSet' THEN SELECT v."publishedAt" INTO published FROM "WorkoutPrescriptionExercise" e JOIN "WorkoutDay" d ON d."id"=e."dayId" JOIN "WorkoutVersion" v ON v."id"=d."versionId" WHERE e."id"=NEW."exerciseId";
 ELSIF TG_TABLE_NAME='NutritionMeal' THEN SELECT "publishedAt" INTO published FROM "NutritionVersion" WHERE "id"=NEW."versionId";
 ELSE SELECT v."publishedAt" INTO published FROM "NutritionMeal" m JOIN "NutritionVersion" v ON v."id"=m."versionId" WHERE m."id"=NEW."mealId";
 END IF;
 IF published IS NOT NULL THEN RAISE EXCEPTION 'Published protocol cannot receive or move children'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER no_insert_workout_day BEFORE INSERT OR UPDATE ON "WorkoutDay" FOR EACH ROW EXECUTE FUNCTION pulso_published_insert_guard();
CREATE TRIGGER no_insert_workout_exercise BEFORE INSERT OR UPDATE ON "WorkoutPrescriptionExercise" FOR EACH ROW EXECUTE FUNCTION pulso_published_insert_guard();
CREATE TRIGGER no_insert_workout_set BEFORE INSERT OR UPDATE ON "WorkoutPrescriptionSet" FOR EACH ROW EXECUTE FUNCTION pulso_published_insert_guard();
CREATE TRIGGER no_insert_nutrition_meal BEFORE INSERT OR UPDATE ON "NutritionMeal" FOR EACH ROW EXECUTE FUNCTION pulso_published_insert_guard();
CREATE TRIGGER no_insert_nutrition_item BEFORE INSERT OR UPDATE ON "NutritionMealItem" FOR EACH ROW EXECUTE FUNCTION pulso_published_insert_guard();
CREATE FUNCTION pulso_completed_session_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE state text;
BEGIN
 IF TG_TABLE_NAME='WorkoutSessionExercise' THEN
  SELECT "status"::text INTO state FROM "WorkoutSession" WHERE "id"=CASE WHEN TG_OP='DELETE' THEN OLD."sessionId" ELSE NEW."sessionId" END;
 ELSE
  SELECT s."status"::text INTO state FROM "WorkoutSessionExercise" e JOIN "WorkoutSession" s ON s."id"=e."sessionId" WHERE e."id"=CASE WHEN TG_OP='DELETE' THEN OLD."sessionExerciseId" ELSE NEW."sessionExerciseId" END;
 END IF;
 IF state<>'IN_PROGRESS' THEN RAISE EXCEPTION 'Finished session records are immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER finalized_session_exercise BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutSessionExercise" FOR EACH ROW EXECUTE FUNCTION pulso_completed_session_guard();
CREATE TRIGGER finalized_session_set BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutSessionSet" FOR EACH ROW EXECUTE FUNCTION pulso_completed_session_guard();
