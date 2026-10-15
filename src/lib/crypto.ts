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
async function derive(password: string, salt: string, iterations: number) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return hex(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-512', salt: new TextEncoder().encode(salt), iterations },
        key,
        256,
      ),
    ),
  );
}
export async function hashPassword(password: string) {
  const salt = randomToken();
  return `pbkdf2-sha512$${ITERATIONS}$${salt}$${await derive(password, salt, ITERATIONS)}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [algorithm, count, salt, expected] = stored.split('$');
  if (algorithm !== 'pbkdf2-sha512' || Number(count) !== ITERATIONS || !salt || !expected)
    return false;
  const actual = await derive(password, salt, Number(count));
  let difference = actual.length ^ expected.length;
  for (let i = 0; i < actual.length; i++)
    difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}
