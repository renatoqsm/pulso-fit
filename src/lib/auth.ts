import { afterCommit } from './db';
import { cookies } from 'next/headers';
import type { PrismaClient, User } from '@prisma/client';
import { HttpError } from './http-error';
import { digest, randomToken } from './crypto';
export const SESSION_COOKIE = 'pulso_session';
export async function currentUser(db: PrismaClient) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: await digest(token) },
    include: { user: { include: { profile: true } } },
  });
  return session && !session.user.disabledAt && session.expiresAt > new Date()
    ? session.user
    : null;
}
export async function createSession(
  db: PrismaClient,
  userId: string,
  expected?: Pick<User, 'passwordHash' | 'mfaEnabled' | 'mfaCipher'>,
) {
  const token = randomToken();
  const tokenHash = await digest(token);
  await db.$transaction(async (tx) => {
    const account = await tx.user.findUnique({ where: { id: userId } });
    if (
      !account ||
      account.disabledAt ||
      (expected &&
        (account.passwordHash !== expected.passwordHash ||
          account.mfaEnabled !== expected.mfaEnabled ||
          account.mfaCipher !== expected.mfaCipher))
    )
      throw new HttpError(401, 'Conta alterada; autentique novamente.');
    await tx.session.create({
      data: { userId, tokenHash, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });
  });
  await afterCommit(db, async () => {
    (await cookies()).set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.APP_URL?.startsWith('https://') ?? process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });
  });
}
export async function destroySession(db: PrismaClient) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: await digest(token) } });
  await afterCommit(db, () => {
    jar.delete(SESSION_COOKIE);
  });
}
