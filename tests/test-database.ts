import { D1Store } from '../src/lib/d1-store';
import { localD1 } from '../src/lib/local-d1';
export async function testDatabase(path: string) {
  if (process.env.TEST_D1_BINDING === 'local-worker') {
    const { getPlatformProxy } = await import('wrangler');
    const proxy = await getPlatformProxy({
      environment: 'test',
      remoteBindings: false,
      persist: { path: '.wrangler-test/state/v3' },
    });
    return { db: new D1Store(proxy.env.DB as any).asClient(), dispose: () => proxy.dispose() };
  }
  return { db: new D1Store(await localD1(path)).asClient(), dispose: async () => {} };
}
