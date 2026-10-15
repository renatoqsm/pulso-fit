import type { D1Binding, D1Statement } from './d1-types';
// Native SQLite is used only in Node development/tests. Workers use the D1 binding.
export async function localD1(path: string): Promise<D1Binding> {
  const { DatabaseSync } = await import(/* webpackIgnore: true */ 'node:sqlite');
  const { mkdir } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  await mkdir(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  class Statement implements D1Statement {
    values: unknown[] = [];
    constructor(readonly sql: string) {}
    bind(...values: unknown[]) {
      const s = new Statement(this.sql);
      s.values = values;
      return s;
    }
    async all<T = Record<string, unknown>>() {
      const statement = db.prepare(this.sql);
      const values = this.values as (string | number | null | Uint8Array)[];
      const results = statement.all(...values) as T[];
      return {
        results,
        success: true,
        meta: { changes: Number(db.prepare('SELECT changes() AS n').get()!.n) },
      };
    }
    async run() {
      const result = db
        .prepare(this.sql)
        .run(...(this.values as (string | number | null | Uint8Array)[]));
      return { success: true, meta: { changes: Number(result.changes) } };
    }
  }
  return {
    prepare: (sql) => new Statement(sql),
    async batch<T>(statements: D1Statement[]) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const results = [];
        for (const raw of statements) {
          const s = raw as Statement;
          const statement = db.prepare(s.sql);
          const values = s.values as (string | number | null | Uint8Array)[];
          // RETURNING and SELECT yield rows; all other commands use run.
          if (/^\s*(SELECT|WITH)\b/i.test(s.sql) || /\bRETURNING\b/i.test(s.sql))
            results.push(await s.all<T>());
          else {
            const r = statement.run(...values);
            results.push({
              results: [] as T[],
              success: true,
              meta: { changes: Number(r.changes) },
            });
          }
        }
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
