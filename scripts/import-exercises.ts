import 'dotenv/config';
import { withDb, getDb } from '../src/lib/db';
import { importExercises } from '../src/lib/exercise-import';
try {
  console.log(await withDb((db) => importExercises(db)));
} finally {
  await (await getDb()).$disconnect();
}
