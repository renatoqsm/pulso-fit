const ITERATIONS = 210_000;
function hex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
export function randomToken() {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}
export async function digest(value: string) {
  return hex(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
  );
}
export async function derivePasswordKey(password: string, salt: string) {
  const passwordBytes = new TextEncoder().encode(password);
  const saltBytes = new TextEncoder().encode(salt);
  const key = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveBits']);
  try {
    return new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-512', salt: saltBytes, iterations: ITERATIONS },
        key,
        256,
      ),
    );
  } catch (error) {
    // Production Workers can cap native PBKDF2 iterations; local workerd does not.
    // Preserve the exact standard KDF and existing hashes, never lower its cost.
    if (
      !(error instanceof Error) ||
      error.name !== 'NotSupportedError' ||
      !/Pbkdf2 failed: iteration counts above \d+ are not supported \(requested 210000\)/i.test(
        error.message,
      )
    )
      throw error;
    const { pbkdf2Async } = await import('@noble/hashes/pbkdf2.js');
    const { sha512 } = await import('@noble/hashes/sha2.js');
    return new Uint8Array(
      await pbkdf2Async(sha512, passwordBytes, saltBytes, { c: ITERATIONS, dkLen: 32 }),
    );
  } finally {
    passwordBytes.fill(0);
    saltBytes.fill(0);
  }
}
async function derive(password: string, salt: string) {
  const key = await derivePasswordKey(password, salt);
  try {
    return hex(key);
  } finally {
    key.fill(0);
  }
}
export async function hashPassword(password: string) {
  const salt = randomToken();
  return `pbkdf2-sha512$${ITERATIONS}$${salt}$${await derive(password, salt)}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [algorithm, count, salt, expected] = stored.split('$');
  if (algorithm !== 'pbkdf2-sha512' || Number(count) !== ITERATIONS || !salt || !expected)
    return false;
  const actual = await derive(password, salt);
  let difference = actual.length ^ expected.length;
  for (let i = 0; i < actual.length; i++)
    difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}
