import type { PrismaClient } from '@prisma/client';
import { D1Store } from './d1-store';
import type { D1Binding } from './d1-types';
import { HttpError } from './http-error';
const state = globalThis as unknown as { pulsoLocalD1?: Promise<D1Binding> };
export function localDatabasePath() {
  return process.env.PULSO_DB_PATH ?? process.cwd() + '/.local/pulso-fit.sqlite';
}
export async function getBinding(): Promise<D1Binding> {
  let bindings: { DB?: D1Binding } | undefined;
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    bindings = getCloudflareContext().env as unknown as typeof bindings;
  } catch {
    /* Node development uses native SQLite with the same schema and SQL. */
  }
  if (bindings) {
    if (!bindings.DB) throw new Error('Cloudflare D1 binding DB is required.');
    return bindings.DB;
  }
  return (state.pulsoLocalD1 ??= import('@/lib/local-d1').then((m) =>
    m.localD1(localDatabasePath()),
  ));
}
export async function getDb(): Promise<PrismaClient> {
  return new D1Store(await getBinding()).asClient();
}
export async function withDb<T>(fn: (db: PrismaClient) => Promise<T>): Promise<T> {
  // Reads, permission checks and staged writes share an optimistic revision.
  // D1 batch plus the commit guard atomically validates and applies all writes.
  const actual = await getBinding();
  let queries = 0;
  const binding: D1Binding = {
    prepare(sql) {
      queries++;
      if (queries > 50)
        throw new HttpError(
          409,
          'Operação atingiu o limite de consultas do plano gratuito. Reduza o lote e tente novamente.',
        );
      return actual.prepare(sql);
    },
    batch: (statements) => actual.batch(statements),
  };
  const result = await new D1Store(binding).$transaction(fn);
  if (process.env.PULSO_QUERY_DIAGNOSTICS === '1' && result instanceof Response)
    result.headers.set('X-Pulso-D1-Queries', String(queries));
  return result;
}

export async function afterCommit(db: PrismaClient, callback: () => Promise<void> | void) {
  await (db as unknown as D1Store).onCommit(callback);
}
