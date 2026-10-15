import 'dotenv/config';
import { getDb } from '../src/lib/db';
import { importExercises } from '../src/lib/exercise-import';
try {
  // Operator imports are not HTTP requests and can atomically update a larger catalog.
  console.log(await importExercises(await getDb()));
} finally {
  await (await getDb()).$disconnect();
}
