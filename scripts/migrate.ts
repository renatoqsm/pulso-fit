import 'dotenv/config';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { localDatabasePath } from '../src/lib/db';
const path = localDatabasePath();
await mkdir(dirname(path), { recursive: true });
const db = new DatabaseSync(path);
db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
db.exec(
  'CREATE TABLE IF NOT EXISTS PulsoMigration (name TEXT PRIMARY KEY,checksum TEXT NOT NULL,appliedAt TEXT NOT NULL)',
);
try {
  for (const name of (await readdir('prisma/d1-migrations'))
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    const sql = await readFile('prisma/d1-migrations/' + name, 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    db.exec('BEGIN IMMEDIATE');
    try {
      const existing = db.prepare('SELECT checksum FROM PulsoMigration WHERE name=?').get(name);
      if (existing) {
        if (existing.checksum !== checksum) throw new Error('Applied migration changed: ' + name);
        console.log('Já aplicada: ' + name);
      } else {
        db.exec(sql);
        db.prepare('INSERT INTO PulsoMigration(name,checksum,appliedAt) VALUES (?,?,?)').run(
          name,
          checksum,
          new Date().toISOString(),
        );
        console.log('Aplicada: ' + name);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
} finally {
  db.close();
}
