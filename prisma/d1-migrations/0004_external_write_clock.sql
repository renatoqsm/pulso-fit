-- Changes through any authorized connection invalidate in-flight snapshots.

CREATE TRIGGER clock_user_insert AFTER INSERT ON "User" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_user_update AFTER UPDATE ON "User" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_user_delete AFTER DELETE ON "User" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_profile_insert AFTER INSERT ON "Profile" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_profile_update AFTER UPDATE ON "Profile" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_profile_delete AFTER DELETE ON "Profile" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_session_insert AFTER INSERT ON "Session" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_session_update AFTER UPDATE ON "Session" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_session_delete AFTER DELETE ON "Session" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_professionalcredential_insert AFTER INSERT ON "ProfessionalCredential" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_professionalcredential_update AFTER UPDATE ON "ProfessionalCredential" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_professionalcredential_delete AFTER DELETE ON "ProfessionalCredential" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_invitation_insert AFTER INSERT ON "Invitation" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_invitation_update AFTER UPDATE ON "Invitation" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_invitation_delete AFTER DELETE ON "Invitation" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_professionalstudentlink_insert AFTER INSERT ON "ProfessionalStudentLink" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_professionalstudentlink_update AFTER UPDATE ON "ProfessionalStudentLink" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_professionalstudentlink_delete AFTER DELETE ON "ProfessionalStudentLink" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_accessconsent_insert AFTER INSERT ON "AccessConsent" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_accessconsent_update AFTER UPDATE ON "AccessConsent" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_accessconsent_delete AFTER DELETE ON "AccessConsent" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_auditlog_insert AFTER INSERT ON "AuditLog" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_auditlog_update AFTER UPDATE ON "AuditLog" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_auditlog_delete AFTER DELETE ON "AuditLog" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_exercise_insert AFTER INSERT ON "Exercise" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_exercise_update AFTER UPDATE ON "Exercise" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_exercise_delete AFTER DELETE ON "Exercise" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_muscle_insert AFTER INSERT ON "Muscle" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_muscle_update AFTER UPDATE ON "Muscle" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_muscle_delete AFTER DELETE ON "Muscle" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_equipment_insert AFTER INSERT ON "Equipment" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_equipment_update AFTER UPDATE ON "Equipment" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_equipment_delete AFTER DELETE ON "Equipment" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_exercisemuscle_insert AFTER INSERT ON "ExerciseMuscle" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_exercisemuscle_update AFTER UPDATE ON "ExerciseMuscle" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_exercisemuscle_delete AFTER DELETE ON "ExerciseMuscle" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_exerciseequipment_insert AFTER INSERT ON "ExerciseEquipment" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_exerciseequipment_update AFTER UPDATE ON "ExerciseEquipment" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_exerciseequipment_delete AFTER DELETE ON "ExerciseEquipment" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_exercisefavorite_insert AFTER INSERT ON "ExerciseFavorite" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_exercisefavorite_update AFTER UPDATE ON "ExerciseFavorite" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_exercisefavorite_delete AFTER DELETE ON "ExerciseFavorite" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_exerciseimportjob_insert AFTER INSERT ON "ExerciseImportJob" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_exerciseimportjob_update AFTER UPDATE ON "ExerciseImportJob" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_exerciseimportjob_delete AFTER DELETE ON "ExerciseImportJob" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutprogram_insert AFTER INSERT ON "WorkoutProgram" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutprogram_update AFTER UPDATE ON "WorkoutProgram" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutprogram_delete AFTER DELETE ON "WorkoutProgram" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutversion_insert AFTER INSERT ON "WorkoutVersion" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutversion_update AFTER UPDATE ON "WorkoutVersion" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutversion_delete AFTER DELETE ON "WorkoutVersion" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutday_insert AFTER INSERT ON "WorkoutDay" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutday_update AFTER UPDATE ON "WorkoutDay" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutday_delete AFTER DELETE ON "WorkoutDay" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutprescriptionexercise_insert AFTER INSERT ON "WorkoutPrescriptionExercise" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutprescriptionexercise_update AFTER UPDATE ON "WorkoutPrescriptionExercise" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutprescriptionexercise_delete AFTER DELETE ON "WorkoutPrescriptionExercise" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutprescriptionset_insert AFTER INSERT ON "WorkoutPrescriptionSet" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutprescriptionset_update AFTER UPDATE ON "WorkoutPrescriptionSet" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutprescriptionset_delete AFTER DELETE ON "WorkoutPrescriptionSet" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutassignment_insert AFTER INSERT ON "WorkoutAssignment" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutassignment_update AFTER UPDATE ON "WorkoutAssignment" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutassignment_delete AFTER DELETE ON "WorkoutAssignment" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutsession_insert AFTER INSERT ON "WorkoutSession" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutsession_update AFTER UPDATE ON "WorkoutSession" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutsession_delete AFTER DELETE ON "WorkoutSession" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutsessionexercise_insert AFTER INSERT ON "WorkoutSessionExercise" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutsessionexercise_update AFTER UPDATE ON "WorkoutSessionExercise" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutsessionexercise_delete AFTER DELETE ON "WorkoutSessionExercise" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutsessionset_insert AFTER INSERT ON "WorkoutSessionSet" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutsessionset_update AFTER UPDATE ON "WorkoutSessionSet" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutsessionset_delete AFTER DELETE ON "WorkoutSessionSet" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutreply_insert AFTER INSERT ON "WorkoutReply" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutreply_update AFTER UPDATE ON "WorkoutReply" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_workoutreply_delete AFTER DELETE ON "WorkoutReply" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_activityoutbox_insert AFTER INSERT ON "ActivityOutbox" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_activityoutbox_update AFTER UPDATE ON "ActivityOutbox" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_activityoutbox_delete AFTER DELETE ON "ActivityOutbox" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_food_insert AFTER INSERT ON "Food" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_food_update AFTER UPDATE ON "Food" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_food_delete AFTER DELETE ON "Food" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_foodmeasure_insert AFTER INSERT ON "FoodMeasure" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_foodmeasure_update AFTER UPDATE ON "FoodMeasure" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_foodmeasure_delete AFTER DELETE ON "FoodMeasure" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_nutritionplan_insert AFTER INSERT ON "NutritionPlan" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_nutritionplan_update AFTER UPDATE ON "NutritionPlan" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_nutritionplan_delete AFTER DELETE ON "NutritionPlan" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_nutritionversion_insert AFTER INSERT ON "NutritionVersion" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_nutritionversion_update AFTER UPDATE ON "NutritionVersion" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_nutritionversion_delete AFTER DELETE ON "NutritionVersion" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_nutritionmeal_insert AFTER INSERT ON "NutritionMeal" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_nutritionmeal_update AFTER UPDATE ON "NutritionMeal" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_nutritionmeal_delete AFTER DELETE ON "NutritionMeal" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_nutritionmealitem_insert AFTER INSERT ON "NutritionMealItem" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_nutritionmealitem_update AFTER UPDATE ON "NutritionMealItem" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_nutritionmealitem_delete AFTER DELETE ON "NutritionMealItem" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_nutritionassignment_insert AFTER INSERT ON "NutritionAssignment" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_nutritionassignment_update AFTER UPDATE ON "NutritionAssignment" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_nutritionassignment_delete AFTER DELETE ON "NutritionAssignment" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_meallog_insert AFTER INSERT ON "MealLog" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_meallog_update AFTER UPDATE ON "MealLog" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_meallog_delete AFTER DELETE ON "MealLog" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_meallogitem_insert AFTER INSERT ON "MealLogItem" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_meallogitem_update AFTER UPDATE ON "MealLogItem" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_meallogitem_delete AFTER DELETE ON "MealLogItem" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_nutritionreply_insert AFTER INSERT ON "NutritionReply" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_nutritionreply_update AFTER UPDATE ON "NutritionReply" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_nutritionreply_delete AFTER DELETE ON "NutritionReply" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_mediaasset_insert AFTER INSERT ON "MediaAsset" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_mediaasset_update AFTER UPDATE ON "MediaAsset" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_mediaasset_delete AFTER DELETE ON "MediaAsset" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_deletionrequest_insert AFTER INSERT ON "DeletionRequest" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_deletionrequest_update AFTER UPDATE ON "DeletionRequest" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER clock_deletionrequest_delete AFTER DELETE ON "DeletionRequest" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;
