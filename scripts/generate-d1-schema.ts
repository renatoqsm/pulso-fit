import internals from '@prisma/internals';
const { getDMMF } = internals;
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const schema = await readFile('prisma/schema.prisma', 'utf8');
const { datamodel } = await getDMMF({ datamodel: schema });
await mkdir('data/schema', { recursive: true });
await writeFile('data/schema/models.json', JSON.stringify(datamodel, null, 2) + '\n');
if (!process.argv.includes('--initial-migration')) process.exit(0);
const q = (name: string) => '"' + name.replaceAll('"', '""') + '"';
const literal = (value: unknown) =>
  value === null
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : typeof value === 'boolean'
        ? value
          ? '1'
          : '0'
        : "'" + String(value).replaceAll("'", "''") + "'";
const now = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";
const sql: string[] = [
  '-- Cloudflare D1 / SQLite physical schema. Domain types are generated from Prisma.',
  'PRAGMA foreign_keys=ON;',
];
const checks: Record<string, string[]> = {
  Exercise: [
    "(source='WGER' AND ownerId IS NULL AND externalId IS NOT NULL) OR (source='CUSTOM' AND ownerId IS NOT NULL AND externalId IS NULL)",
  ],
  Food: [
    "referenceUnit IN ('g','ml')",
    "(source='CUSTOM' AND ownerId IS NOT NULL AND externalId IS NULL) OR (source='USDA_FDC' AND ownerId IS NULL AND externalId IS NOT NULL)",
  ],
  WorkoutPrescriptionSet: [
    'repsMin IS NULL OR repsMin>=0',
    'repsMax IS NULL OR repsMax>=coalesce(repsMin,0)',
    'targetKg IS NULL OR CAST(targetKg AS REAL)>=0',
    'durationSeconds IS NULL OR durationSeconds>=0',
    'restSeconds BETWEEN 0 AND 86400',
    'rir IS NULL OR rir BETWEEN 0 AND 100',
    'rpe IS NULL OR CAST(rpe AS REAL) BETWEEN 0 AND 10',
    "kind IN ('WARMUP','WORKING','TIMED','FAILURE')",
  ],
  WorkoutSession: [
    'revision>=0',
    "(status='IN_PROGRESS' AND endedAt IS NULL) OR (status<>'IN_PROGRESS' AND endedAt IS NOT NULL AND endedAt>=startedAt)",
    'effort IS NULL OR effort BETWEEN 0 AND 10',
    'difficulty IS NULL OR difficulty BETWEEN 0 AND 10',
    'rating IS NULL OR rating BETWEEN 1 AND 5',
  ],
  WorkoutSessionSet: [
    'actualReps IS NULL OR actualReps>=0',
    'actualKg IS NULL OR CAST(actualKg AS REAL)>=0',
    'actualSeconds IS NULL OR actualSeconds>=0',
    'rpe IS NULL OR CAST(rpe AS REAL) BETWEEN 0 AND 10',
    'rir IS NULL OR rir BETWEEN 0 AND 100',
  ],
  FoodMeasure: ['CAST(quantity AS REAL)>0', "unit IN ('g','ml')"],
  NutritionMealItem: ['CAST(quantity AS REAL)>0', "unit IN ('g','ml')"],
  MealLogItem: ['CAST(quantity AS REAL)>0', "unit IN ('g','ml')"],
  MealLog: ['revision>=0'],
};
for (const model of datamodel.models) {
  const scalars = model.fields.filter((f) => f.kind !== 'object');
  const ids = model.primaryKey?.fields ?? scalars.filter((f) => f.isId).map((f) => f.name);
  const columns = scalars.map((f) => {
    const type =
      f.isList || f.type === 'Json'
        ? 'TEXT'
        : f.type === 'Bytes'
          ? 'BLOB'
          : ['Int', 'Boolean', 'BigInt'].includes(f.type)
            ? 'INTEGER'
            : f.type === 'Float'
              ? 'REAL'
              : 'TEXT';
    let definition = q(f.name) + ' ' + type + (f.isRequired ? ' NOT NULL' : '');
    if (f.isId && ids.length === 1) definition += ' PRIMARY KEY';
    if (f.hasDefaultValue) {
      const d = f.default as any;
      const value =
        d && typeof d === 'object' && !Array.isArray(d) && d.name
          ? d.name === 'now'
            ? now
            : d.name === 'cuid' || d.name === 'uuid'
              ? '(lower(hex(randomblob(16))))'
              : undefined
          : literal(f.isList || f.type === 'Json' ? JSON.stringify(d) : d);
      if (value !== undefined) definition += ' DEFAULT ' + value;
    } else if (f.isUpdatedAt) definition += ' DEFAULT ' + now;
    return definition;
  });
  if (ids.length > 1) columns.push('PRIMARY KEY (' + ids.map(q).join(',') + ')');
  for (const f of scalars.filter((f) => f.isUnique)) columns.push('UNIQUE (' + q(f.name) + ')');
  for (const fields of model.uniqueFields) columns.push('UNIQUE (' + fields.map(q).join(',') + ')');
  for (const relation of model.fields.filter(
    (f) => f.kind === 'object' && f.relationFromFields?.length,
  )) {
    const action =
      relation.relationOnDelete
        ?.replace('SetNull', 'SET NULL')
        .replace('NoAction', 'NO ACTION')
        .toUpperCase() ?? (relation.isRequired ? 'RESTRICT' : 'SET NULL');
    columns.push(
      'FOREIGN KEY (' +
        relation.relationFromFields!.map(q).join(',') +
        ') REFERENCES ' +
        q(relation.type) +
        ' (' +
        relation.relationToFields!.map(q).join(',') +
        ') ON DELETE ' +
        action +
        ' ON UPDATE CASCADE',
    );
  }
  for (const f of scalars) {
    if (f.type === 'Boolean')
      columns.push('CHECK (' + q(f.name) + ' IS NULL OR ' + q(f.name) + ' IN (0,1))');
    if (f.isList || f.type === 'Json')
      columns.push('CHECK (' + q(f.name) + ' IS NULL OR json_valid(' + q(f.name) + '))');
    if (f.kind === 'enum') {
      const values = datamodel.enums
        .find((e) => e.name === f.type)!
        .values.map((v) => literal(v.name));
      columns.push('CHECK (' + q(f.name) + ' IN (' + values.join(',') + '))');
    }
  }
  for (const check of checks[model.name] ?? []) columns.push('CHECK (' + check + ')');
  sql.push('CREATE TABLE ' + q(model.name) + ' (\n  ' + columns.join(',\n  ') + '\n);');
  // Relation indexes keep joins scoped and avoid whole-table scans under D1 limits.
  for (const relation of model.fields.filter(
    (f) => f.kind === 'object' && f.relationFromFields?.length,
  )) {
    const fields = relation.relationFromFields!;
    sql.push(
      'CREATE INDEX ' +
        q(model.name + '_' + fields.join('_') + '_idx') +
        ' ON ' +
        q(model.name) +
        ' (' +
        fields.map(q).join(',') +
        ');',
    );
  }
}
sql.push(
  "CREATE UNIQUE INDEX one_active_workout_session ON WorkoutSession(studentId) WHERE status='IN_PROGRESS';",
);
sql.push(
  'CREATE UNIQUE INDEX one_prescribed_meal_per_day ON MealLog(studentId,date,prescribedMealId) WHERE prescribedMealId IS NOT NULL;',
);
sql.push('CREATE INDEX food_source_active_idx ON Food(source,active);');
sql.push('CREATE INDEX exercise_source_active_idx ON Exercise(source,active);');
sql.push('CREATE INDEX workout_student_started_idx ON WorkoutSession(studentId,startedAt);');
sql.push('CREATE INDEX meal_student_date_idx ON MealLog(studentId,date);');
sql.push('CREATE INDEX rate_expiry_idx ON RateLimit(expiresAt);');
sql.push(
  'CREATE TABLE "__StoreClock" (id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL DEFAULT 0);',
);
sql.push('INSERT INTO "__StoreClock" (id,revision) VALUES (1,0);');
sql.push('CREATE TABLE "__CommitGuard" (id TEXT PRIMARY KEY,revision INTEGER NOT NULL);');
sql.push(
  'CREATE TRIGGER assert_store_revision BEFORE INSERT ON "__CommitGuard" BEGIN SELECT CASE WHEN NEW.revision<>(SELECT revision FROM "__StoreClock" WHERE id=1) THEN RAISE(ABORT,\'PULSO_WRITE_CONFLICT\') END; UPDATE "__StoreClock" SET revision=revision+1 WHERE id=1; END;',
);
await mkdir('prisma/d1-migrations', { recursive: true });
await writeFile('prisma/d1-migrations/0001_schema.sql', sql.join('\n\n') + '\n');
