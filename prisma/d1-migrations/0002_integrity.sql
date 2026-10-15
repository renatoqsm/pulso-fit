CREATE TRIGGER immutable_workoutversion_update BEFORE UPDATE ON "WorkoutVersion" WHEN OLD.publishedAt IS NOT NULL BEGIN SELECT RAISE(ABORT,'Published version is immutable'); END;

CREATE TRIGGER immutable_workoutversion_delete BEFORE DELETE ON "WorkoutVersion" WHEN OLD.publishedAt IS NOT NULL BEGIN SELECT RAISE(ABORT,'Published version is immutable'); END;

CREATE TRIGGER immutable_nutritionversion_update BEFORE UPDATE ON "NutritionVersion" WHEN OLD.publishedAt IS NOT NULL BEGIN SELECT RAISE(ABORT,'Published version is immutable'); END;

CREATE TRIGGER immutable_nutritionversion_delete BEFORE DELETE ON "NutritionVersion" WHEN OLD.publishedAt IS NOT NULL BEGIN SELECT RAISE(ABORT,'Published version is immutable'); END;

CREATE TRIGGER published_workoutday_insert BEFORE INSERT ON "WorkoutDay" WHEN EXISTS (SELECT 1 FROM WorkoutVersion v WHERE v.id=NEW.versionId AND v.publishedAt IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Published children are immutable'); END;

CREATE TRIGGER published_workoutday_update BEFORE UPDATE ON "WorkoutDay" WHEN EXISTS (SELECT 1 FROM WorkoutVersion v WHERE v.id=OLD.versionId AND v.publishedAt IS NOT NULL) OR EXISTS (SELECT 1 FROM WorkoutVersion v WHERE v.id=NEW.versionId AND v.publishedAt IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Published children are immutable'); END;

CREATE TRIGGER published_workoutday_delete BEFORE DELETE ON "WorkoutDay" WHEN EXISTS (SELECT 1 FROM WorkoutVersion v WHERE v.id=OLD.versionId AND v.publishedAt IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Published children are immutable'); END;

CREATE TRIGGER published_workoutprescriptionexercise_insert BEFORE INSERT ON "WorkoutPrescriptionExercise" WHEN EXISTS (SELECT 1 FROM WorkoutDay d JOIN WorkoutVersion v ON v.id=d.versionId WHERE d.id=NEW.dayId AND v.publishedAt IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Published children are immutable'); END;

CREATE TRIGGER published_workoutprescriptionexercise_update BEFORE UPDATE ON "WorkoutPrescriptionExercise" WHEN EXISTS (SELECT 1 FROM WorkoutDay d JOIN WorkoutVersion v ON v.id=d.versionId WHERE d.id=OLD.dayId AND v.publishedAt IS NOT NULL) OR EXISTS (SELECT 1 FROM WorkoutDay d JOIN WorkoutVersion v ON v.id=d.versionId WHERE d.id=NEW.dayId AND v.publishedAt IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Published children are immutable'); END;

CREATE TRIGGER published_workoutprescriptionexercise_delete BEFORE DELETE ON "WorkoutPrescriptionExercise" WHEN EXISTS (SELECT 1 FROM WorkoutDay d JOIN WorkoutVersion v ON v.id=d.versionId WHERE d.id=OLD.dayId AND v.publishedAt IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Published children are immutable'); END;

CREATE TRIGGER published_workoutprescriptionset_insert BEFORE INSERT ON "WorkoutPrescriptionSet" WHEN EXISTS (SELECT 1 FROM WorkoutPrescriptionExercise e JOIN WorkoutDay d ON d.id=e.dayId JOIN WorkoutVersion v ON v.id=d.versionId WHERE e.id=NEW.exerciseId AND v.publishedAt IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Published children are immutable'); END;

CREATE TRIGGER published_workoutprescriptionset_update BEFORE UPDATE ON "WorkoutPrescriptionSet" WHEN EXISTS (SELECT 1 FROM WorkoutPrescriptionExercise e JOIN WorkoutDay d ON d.id=e.dayId JOIN WorkoutVersion v ON v.id=d.versionId WHERE e.id=OLD.exerciseId AND v.publishedAt IS NOT NULL) OR EXISTS (SELECT 1 FROM WorkoutPrescriptionExercise e JOIN WorkoutDay d ON d.id=e.dayId JOIN WorkoutVersion v ON v.id=d.versionId WHERE e.id=NEW.exerciseId AND v.publishedAt IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Published children are immutable'); END;

CREATE TRIGGER published_workoutprescriptionset_delete BEFORE DELETE ON "WorkoutPrescriptionSet" WHEN EXISTS (SELECT 1 FROM WorkoutPrescriptionExercise e JOIN WorkoutDay d ON d.id=e.dayId JOIN WorkoutVersion v ON v.id=d.versionId WHERE e.id=OLD.exerciseId AND v.publishedAt IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Published children are immutable'); END;

CREATE TRIGGER published_nutritionmeal_insert BEFORE INSERT ON "NutritionMeal" WHEN EXISTS (SELECT 1 FROM NutritionVersion v WHERE v.id=NEW.versionId AND v.publishedAt IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Published children are immutable'); END;

CREATE TRIGGER published_nutritionmeal_update BEFORE UPDATE ON "NutritionMeal" WHEN EXISTS (SELECT 1 FROM NutritionVersion v WHERE v.id=OLD.versionId AND v.publishedAt IS NOT NULL) OR EXISTS (SELECT 1 FROM NutritionVersion v WHERE v.id=NEW.versionId AND v.publishedAt IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Published children are immutable'); END;

CREATE TRIGGER published_nutritionmeal_delete BEFORE DELETE ON "NutritionMeal" WHEN EXISTS (SELECT 1 FROM NutritionVersion v WHERE v.id=OLD.versionId AND v.publishedAt IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Published children are immutable'); END;

CREATE TRIGGER published_nutritionmealitem_insert BEFORE INSERT ON "NutritionMealItem" WHEN EXISTS (SELECT 1 FROM NutritionMeal m JOIN NutritionVersion v ON v.id=m.versionId WHERE m.id=NEW.mealId AND v.publishedAt IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Published children are immutable'); END;

CREATE TRIGGER published_nutritionmealitem_update BEFORE UPDATE ON "NutritionMealItem" WHEN EXISTS (SELECT 1 FROM NutritionMeal m JOIN NutritionVersion v ON v.id=m.versionId WHERE m.id=OLD.mealId AND v.publishedAt IS NOT NULL) OR EXISTS (SELECT 1 FROM NutritionMeal m JOIN NutritionVersion v ON v.id=m.versionId WHERE m.id=NEW.mealId AND v.publishedAt IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Published children are immutable'); END;

CREATE TRIGGER published_nutritionmealitem_delete BEFORE DELETE ON "NutritionMealItem" WHEN EXISTS (SELECT 1 FROM NutritionMeal m JOIN NutritionVersion v ON v.id=m.versionId WHERE m.id=OLD.mealId AND v.publishedAt IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Published children are immutable'); END;

CREATE TRIGGER closed_session_update BEFORE UPDATE ON "WorkoutSession" WHEN OLD.status<>'IN_PROGRESS' OR NEW.studentId IS NOT OLD.studentId OR NEW.versionId IS NOT OLD.versionId OR NEW.dayId IS NOT OLD.dayId OR NEW.startedAt IS NOT OLD.startedAt BEGIN SELECT RAISE(ABORT,'Session origin or closed header is immutable'); END;

CREATE TRIGGER closed_session_delete BEFORE DELETE ON "WorkoutSession" WHEN OLD.status<>'IN_PROGRESS' BEGIN SELECT RAISE(ABORT,'Session origin or closed header is immutable'); END;

CREATE TRIGGER closed_workoutsessionexercise_insert BEFORE INSERT ON "WorkoutSessionExercise" WHEN EXISTS (SELECT 1 FROM WorkoutSession s WHERE s.id=NEW.sessionId AND s.status<>'IN_PROGRESS') BEGIN SELECT RAISE(ABORT,'Closed session entries are immutable'); END;

CREATE TRIGGER closed_workoutsessionexercise_update BEFORE UPDATE ON "WorkoutSessionExercise" WHEN EXISTS (SELECT 1 FROM WorkoutSession s WHERE s.id=OLD.sessionId AND s.status<>'IN_PROGRESS') OR EXISTS (SELECT 1 FROM WorkoutSession s WHERE s.id=NEW.sessionId AND s.status<>'IN_PROGRESS') BEGIN SELECT RAISE(ABORT,'Closed session entries are immutable'); END;

CREATE TRIGGER closed_workoutsessionexercise_delete BEFORE DELETE ON "WorkoutSessionExercise" WHEN EXISTS (SELECT 1 FROM WorkoutSession s WHERE s.id=OLD.sessionId AND s.status<>'IN_PROGRESS') BEGIN SELECT RAISE(ABORT,'Closed session entries are immutable'); END;

CREATE TRIGGER closed_workoutsessionset_insert BEFORE INSERT ON "WorkoutSessionSet" WHEN EXISTS (SELECT 1 FROM WorkoutSessionExercise e JOIN WorkoutSession s ON s.id=e.sessionId WHERE e.id=NEW.sessionExerciseId AND s.status<>'IN_PROGRESS') BEGIN SELECT RAISE(ABORT,'Closed session entries are immutable'); END;

CREATE TRIGGER closed_workoutsessionset_update BEFORE UPDATE ON "WorkoutSessionSet" WHEN EXISTS (SELECT 1 FROM WorkoutSessionExercise e JOIN WorkoutSession s ON s.id=e.sessionId WHERE e.id=OLD.sessionExerciseId AND s.status<>'IN_PROGRESS') OR EXISTS (SELECT 1 FROM WorkoutSessionExercise e JOIN WorkoutSession s ON s.id=e.sessionId WHERE e.id=NEW.sessionExerciseId AND s.status<>'IN_PROGRESS') BEGIN SELECT RAISE(ABORT,'Closed session entries are immutable'); END;

CREATE TRIGGER closed_workoutsessionset_delete BEFORE DELETE ON "WorkoutSessionSet" WHEN EXISTS (SELECT 1 FROM WorkoutSessionExercise e JOIN WorkoutSession s ON s.id=e.sessionId WHERE e.id=OLD.sessionExerciseId AND s.status<>'IN_PROGRESS') BEGIN SELECT RAISE(ABORT,'Closed session entries are immutable'); END;

CREATE TRIGGER session_exercise_origin BEFORE UPDATE ON "WorkoutSessionExercise" WHEN NEW.sessionId IS NOT OLD.sessionId OR NEW.prescriptionExerciseId IS NOT OLD.prescriptionExerciseId BEGIN SELECT RAISE(ABORT,'Session exercise origin is immutable'); END;

CREATE TRIGGER session_set_origin BEFORE UPDATE ON "WorkoutSessionSet" WHEN NEW.sessionExerciseId IS NOT OLD.sessionExerciseId OR NEW.prescriptionSetId IS NOT OLD.prescriptionSetId BEGIN SELECT RAISE(ABORT,'Session set origin is immutable'); END;
