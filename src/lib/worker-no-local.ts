import type { D1Binding } from './d1-types';
export async function localD1(_path: string): Promise<D1Binding> {
  throw new Error('Cloudflare D1 binding DB is required. Local SQLite is unavailable in Workers.');
}
