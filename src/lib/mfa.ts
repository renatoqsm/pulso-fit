import type { PrismaClient, User } from '@prisma/client';
import { derivePasswordKey, digest, randomToken } from './crypto';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newMfaSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let bits = 0,
    value = 0,
    output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += alphabet[(value >>> bits) & 31];
    }
  }
  return output;
}
function decode(secret: string) {
  let bits = 0,
    value = 0;
  const out: number[] = [];
  for (const char of secret) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error('Invalid MFA secret');
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 255);
    }
  }
  return new Uint8Array(out);
}
export async function totp(secret: string, counter: number) {
  const key = await crypto.subtle.importKey(
    'raw',
    decode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const data = new Uint8Array(8);
  new DataView(data.buffer).setBigUint64(0, BigInt(counter));
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
  const offset = mac[mac.length - 1] & 15;
  return String((new DataView(mac.buffer).getUint32(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    '0',
  );
}
async function encryptionKey(password: string, salt: string) {
  const bytes = await derivePasswordKey(password, salt);
  try {
    return await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  } finally {
    bytes.fill(0);
  }
}
export async function encryptMfa(secret: string, password: string, userId: string) {
  const mfaSalt = randomToken(),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(userId) },
    await encryptionKey(password, mfaSalt),
    new TextEncoder().encode(secret),
  );
  return {
    mfaCipher: Buffer.from(cipher).toString('base64'),
    mfaIv: Buffer.from(iv).toString('base64'),
    mfaSalt,
  };
}
export async function decryptMfa(
  user: Pick<User, 'id' | 'mfaCipher' | 'mfaIv' | 'mfaSalt'>,
  password: string,
) {
  if (!user.mfaCipher || !user.mfaIv || !user.mfaSalt) throw new Error('MFA unavailable');
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: Buffer.from(user.mfaIv, 'base64'),
        additionalData: new TextEncoder().encode(user.id),
      },
      await encryptionKey(password, user.mfaSalt),
      Buffer.from(user.mfaCipher, 'base64'),
    ),
  );
}
export async function matchingCounter(secret: string, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const counter = Math.floor(now / 30000);
  for (const delta of [0, -1, 1])
    if ((await totp(secret, counter + delta)) === code) return counter + delta;
  return null;
}
export async function verifyMfa(
  db: PrismaClient,
  user: User,
  password: string,
  code: string,
  preventReplay = true,
) {
  if (!user.mfaEnabled) return true;
  if (/^[a-f0-9]{64}$/.test(code)) {
    const hash = await digest(code);
    const current = await db.user.findUnique({ where: { id: user.id } });
    if (!current?.mfaEnabled || !current.mfaRecoveryHashes.includes(hash)) return false;
    const used = (
      await db.user.updateMany({
        where: {
          id: user.id,
          mfaEnabled: true,
          mfaRecoveryHashes: { equals: current.mfaRecoveryHashes },
        },
        data: { mfaRecoveryHashes: current.mfaRecoveryHashes.filter((v) => v !== hash) },
      })
    ).count;
    return used === 1;
  }
  let counter: number | null;
  try {
    counter = await matchingCounter(await decryptMfa(user, password), code);
  } catch {
    return false;
  }
  if (counter === null) return false;
  if (!preventReplay) return true;
  return (
    (
      await db.user.updateMany({
        where: {
          id: user.id,
          mfaEnabled: true,
          OR: [{ mfaLastCounter: null }, { mfaLastCounter: { lt: counter } }],
        },
        data: { mfaLastCounter: counter },
      })
    ).count === 1
  );
}
