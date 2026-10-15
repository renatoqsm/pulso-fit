import 'dotenv/config';
import { DatabaseSync } from 'node:sqlite';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { localDatabasePath } from '../src/lib/db';
if (!process.argv.includes('--bootstrap'))
  throw new Error('Use --bootstrap only before public launch or during controlled maintenance.');
const output =
  process.argv.find((v) => v.startsWith('--output='))?.slice(9) ?? '.local/catalog.sql';
const db = new DatabaseSync(localDatabasePath(), { readOnly: true });
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
const literal = (value: unknown) =>
  value == null
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : "'" + String(value).replaceAll("'", "''") + "'";
const lines = [
  '-- Public catalog bootstrap only. No users, sessions, credentials or private foods.',
  'UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1;',
];
function insert(
  table: string,
  rows: Record<string, unknown>[],
  keys: string[],
  preserve: string[] = [],
) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]),
    changes = columns.filter((c) => !keys.includes(c) && !preserve.includes(c));
  const conflict =
    ' ON CONFLICT (' +
    keys.map(quote).join(',') +
    ') ' +
    (changes.length
      ? 'DO UPDATE SET ' + changes.map((c) => quote(c) + '=excluded.' + quote(c)).join(',')
      : 'DO NOTHING') +
    ';';
  const prefix = 'INSERT INTO ' + quote(table) + ' (' + columns.map(quote).join(',') + ') VALUES ';
  let values: string[] = [];
  let bytes = Buffer.byteLength(prefix + conflict, 'utf8');
  const flush = () => {
    if (values.length) lines.push(prefix + values.join(',\n') + conflict);
    values = [];
    bytes = Buffer.byteLength(prefix + conflict, 'utf8');
  };
  for (const row of rows) {
    const value = '(' + columns.map((c) => literal(row[c])).join(',') + ')';
    const size = Buffer.byteLength(value, 'utf8') + 2;
    if (size + Buffer.byteLength(prefix + conflict, 'utf8') > 90000)
      throw new Error('Public catalog record exceeds safe SQL size.');
    if (values.length && bytes + size > 60000) flush();
    values.push(value);
    bytes += size;
  }
  flush();
}
try {
  insert('Muscle', db.prepare('SELECT * FROM Muscle').all(), ['id']);
  insert('Equipment', db.prepare('SELECT * FROM Equipment').all(), ['id']);
  const exercises = db
    .prepare("SELECT * FROM Exercise WHERE source='WGER' AND ownerId IS NULL")
    .all();
  const exerciseIds = new Map(exercises.map((row) => [row.id, 'wger-' + row.externalId]));
  insert(
    'Exercise',
    exercises.map((row) => ({ ...row, id: exerciseIds.get(row.id) })),
    ['source', 'externalId'],
    ['id', 'active', 'createdAt'],
  );
  insert(
    'ExerciseMuscle',
    db
      .prepare(
        "SELECT m.* FROM ExerciseMuscle m JOIN Exercise e ON e.id=m.exerciseId WHERE e.source='WGER' AND e.ownerId IS NULL",
      )
      .all()
      .map((row) => ({ ...row, exerciseId: exerciseIds.get(row.exerciseId) })),
    ['exerciseId', 'muscleId', 'role'],
  );
  insert(
    'ExerciseEquipment',
    db
      .prepare(
        "SELECT m.* FROM ExerciseEquipment m JOIN Exercise e ON e.id=m.exerciseId WHERE e.source='WGER' AND e.ownerId IS NULL",
      )
      .all()
      .map((row) => ({ ...row, exerciseId: exerciseIds.get(row.exerciseId) })),
    ['exerciseId', 'equipmentId'],
  );
  const foods = db.prepare("SELECT * FROM Food WHERE source='USDA_FDC' AND ownerId IS NULL").all();
  insert(
    'Food',
    foods.map((row) => ({ ...row, id: 'usda-fdc-' + row.externalId })),
    ['source', 'externalId'],
    ['id', 'active', 'createdAt'],
  );
  lines.push('UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1;');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, lines.join('\n\n') + '\n');
  await writeFile(output + '.json', JSON.stringify(lines.filter((line) => !line.startsWith('--'))));
  console.log({
    file: output,
    exercises: exercises.length,
    foods: foods.length,
    privateRecordsExported: 0,
  });
} finally {
  db.close();
}
