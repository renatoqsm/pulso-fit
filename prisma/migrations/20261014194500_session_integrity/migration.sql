ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_valid_end" CHECK (("status"='IN_PROGRESS' AND "endedAt" IS NULL) OR ("status"<>'IN_PROGRESS' AND "endedAt" IS NOT NULL AND "endedAt">="startedAt"));
CREATE FUNCTION pulso_session_header_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."status"<>'IN_PROGRESS' THEN RAISE EXCEPTION 'Finished session header is immutable'; END IF;
 IF TG_OP='UPDATE' AND (NEW."studentId"<>OLD."studentId" OR NEW."versionId"<>OLD."versionId" OR NEW."dayId"<>OLD."dayId" OR NEW."startedAt"<>OLD."startedAt") THEN RAISE EXCEPTION 'Session ownership and prescription cannot be changed'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER immutable_session_header BEFORE UPDATE OR DELETE ON "WorkoutSession" FOR EACH ROW EXECUTE FUNCTION pulso_session_header_guard();
CREATE FUNCTION pulso_session_exercise_origin_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."sessionId"<>OLD."sessionId" OR NEW."prescriptionExerciseId"<>OLD."prescriptionExerciseId" THEN RAISE EXCEPTION 'Session exercise origin is immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER immutable_session_exercise_origin BEFORE UPDATE ON "WorkoutSessionExercise" FOR EACH ROW EXECUTE FUNCTION pulso_session_exercise_origin_guard();
CREATE FUNCTION pulso_session_set_origin_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."sessionExerciseId"<>OLD."sessionExerciseId" OR NEW."prescriptionSetId"<>OLD."prescriptionSetId" THEN RAISE EXCEPTION 'Session set origin is immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER immutable_session_set_origin BEFORE UPDATE ON "WorkoutSessionSet" FOR EACH ROW EXECUTE FUNCTION pulso_session_set_origin_guard();
