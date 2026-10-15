-- Remove a plan from use without changing immutable prescriptions or past sessions.
CREATE TABLE "WorkoutProgramRemoval" (
  "programId" TEXT NOT NULL PRIMARY KEY,
  "removedAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY ("programId") REFERENCES "WorkoutProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TRIGGER clock_workoutprogramremoval_insert AFTER INSERT ON "WorkoutProgramRemoval" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER clock_workoutprogramremoval_update AFTER UPDATE ON "WorkoutProgramRemoval" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER clock_workoutprogramremoval_delete AFTER DELETE ON "WorkoutProgramRemoval" BEGIN UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;
