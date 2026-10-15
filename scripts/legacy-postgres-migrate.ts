import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import pg from 'pg';
// SQL files are generated/reviewed with Prisma; this runner avoids the experimental
// schema engine's PostgreSQL introspection limitation and keeps atomic history.
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('SELECT pg_advisory_lock(704202610)');
  await client.query(
    'CREATE TABLE IF NOT EXISTS "PulsoMigration" ("name" text PRIMARY KEY,"checksum" text NOT NULL,"appliedAt" timestamptz NOT NULL DEFAULT now())',
  );
  const directory = resolve('prisma/migrations');
  for (const name of (await readdir(directory, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()) {
    const sql = await readFile(resolve(directory, name, 'migration.sql'), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const applied = await client.query<{ checksum: string }>(
      'SELECT "checksum" FROM "PulsoMigration" WHERE "name"=$1',
      [name],
    );
    if (applied.rowCount) {
      if (applied.rows[0].checksum !== checksum)
        throw new Error(`Migration já aplicada foi alterada: ${name}`);
      console.log(`Já aplicada: ${name}`);
      continue;
    }
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO "PulsoMigration" ("name","checksum") VALUES ($1,$2)', [
        name,
        checksum,
      ]);
      await client.query('COMMIT');
      console.log(`Aplicada: ${name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.query('SELECT pg_advisory_unlock(704202610)');
  await client.end();
}
