import { verifyMfa } from '@/lib/mfa';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withDb } from '@/lib/db';
import { currentUser, createSession, destroySession } from '@/lib/auth';
import { digest, hashPassword, verifyPassword } from '@/lib/crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { HttpError } from '@/lib/http-error';
import { adminGet, adminPost } from '@/lib/admin-api';
import { accountGet, accountPost } from '@/lib/account-api';
import { workspace } from '@/lib/workspace';
import { workoutGet, workoutPost } from '@/lib/workout-api';
import { exerciseGet, exercisePost } from '@/lib/exercise-api';
const identity = z.object({
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase().trim()),
  password: z.string().min(12).max(128),
});
const register = identity.extend({
  name: z.string().trim().min(2).max(100),
  role: z.literal('STUDENT').default('STUDENT'),
});
const ok = (data: unknown) => NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
async function handle(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const path = (await params).path.join('/');
    if (
      /^(foods|nutrition|meals|credentials|invitations|links|students)(\/|$)/.test(path) ||
      path === 'admin/review' ||
      path.startsWith('admin/credentials/') ||
      /^sessions\/[^/]+\/reply$/.test(path)
    )
      throw new HttpError(
        404,
        'Recurso indisponível. O Pulso Fit agora é dedicado ao treino individual.',
      );
    if (process.env.NODE_ENV === 'production' && !process.env.APP_URL)
      throw new HttpError(503, 'Origem da aplicação não configurada.');
    if (req.method === 'POST') {
      const origin = req.headers.get('origin');
      const expected = new URL(process.env.APP_URL ?? req.url).origin;
      if (origin !== expected) throw new HttpError(403, 'Origem da solicitação inválida.');
      if (!req.headers.get('content-type')?.includes('application/json'))
        throw new HttpError(415, 'Envie dados JSON.');
      const raw = await req.text();
      if (raw.length > (path.startsWith('auth/') ? 16_384 : 262_144))
        throw new HttpError(413, 'Solicitação muito grande.');
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        throw new HttpError(400, 'JSON inválido.');
      }
      return await withDb(async (db) => {
        // Persistent atomic rate limit. Never store raw IPs, emails or credentials.
        const ip =
          process.env.NODE_ENV === 'production'
            ? (req.headers.get('cf-connecting-ip') ?? 'unknown')
            : 'local';
        const key = await digest(`${path}:${ip}`);
        const now = new Date();
        const expiration = new Date(now.getTime() + 15 * 60 * 1000);
        const limits = await db.$queryRaw<
          { count: number }[]
        >`INSERT INTO "RateLimit" ("key","count","expiresAt") VALUES (${key},1,${expiration}) ON CONFLICT ("key") DO UPDATE SET "count"=CASE WHEN "RateLimit"."expiresAt"<${now} THEN 1 ELSE "RateLimit"."count"+1 END,"expiresAt"=CASE WHEN "RateLimit"."expiresAt"<${now} THEN ${expiration} ELSE "RateLimit"."expiresAt" END RETURNING "count"`;

        if (
          limits[0].count >
          (path.startsWith('auth/') ? 30 : path.startsWith('sessions/') ? 600 : 120)
        )
          throw new HttpError(429, 'Muitas tentativas. Aguarde 15 minutos.');
        if (path === 'auth/register') {
          const data = register.parse(body);
          const passwordHash = await hashPassword(data.password);
          const user = await db.$transaction(async (tx) => {
            const user = await tx.user.create({
              data: {
                email: data.email,
                passwordHash,
                role: data.role,
                profile: { create: { name: data.name } },
              },
            });
            await tx.auditLog.create({
              data: { actorId: user.id, action: 'ACCOUNT_CREATED', resourceId: user.id },
            });
            return user;
          });
          await createSession(db, user.id, user);
          return ok({ message: 'Conta criada.' });
        }
        if (path === 'auth/login') {
          const data = identity.extend({ code: z.string().max(64).optional() }).parse(body);
          const user = await db.user.findUnique({ where: { email: data.email } });
          // Equal-cost derivation for unknown accounts.
          const valid = user
            ? await verifyPassword(data.password, user.passwordHash)
            : (await hashPassword(data.password), false);
          if (
            !user ||
            user.disabledAt ||
            !valid ||
            !(await verifyMfa(db, user, data.password, data.code ?? ''))
          )
            throw new HttpError(401, 'Email, senha ou código incorretos.');
          await createSession(db, user.id, user);
          return ok({ message: 'Acesso autorizado.' });
        }
        if (path === 'auth/logout') {
          await destroySession(db);
          return ok({ message: 'Sessão encerrada.' });
        }
        const user = await currentUser(db);
        if (!user) throw new HttpError(401, 'Entre para continuar.');
        if (path.startsWith('admin/users/') || path.startsWith('admin/credentials/'))
          return adminPost(db, user, path, body);
        if (path.startsWith('account/')) return accountPost(db, user, path, body);
        if (path.startsWith('workouts/') || path.startsWith('sessions/'))
          return workoutPost(db, user, path, body);
        if (path.startsWith('exercises/') || path === 'admin/import-exercises')
          return exercisePost(db, user, path, body);
        if (path === 'profile') {
          const data = z
            .object({
              name: z.string().trim().min(2).max(100),
              bio: z.string().trim().max(1000),
              specialty: z.string().trim().max(150),
              contact: z.string().trim().max(150),
            })
            .parse(body);
          await db.$transaction(async (tx) => {
            await tx.profile.update({ where: { userId: user.id }, data });
            await tx.auditLog.create({
              data: { actorId: user.id, action: 'PROFILE_UPDATED', resourceId: user.id },
            });
          });
          return ok({ message: 'Perfil atualizado.' });
        }
        throw new HttpError(404, 'Recurso não encontrado.');
      });
    }
    return await withDb(async (db) => {
      const user = await currentUser(db);
      if (!user) throw new HttpError(401, 'Entre para continuar.');
      if (path === 'admin/overview' || path === 'admin/users') return adminGet(db, user, path, req);
      if (path.startsWith('account/') || path.startsWith('media/'))
        return accountGet(db, user, path);
      if (path === 'workspace') return workspace(db, user);
      if (
        ['workouts', 'sessions', 'progress'].includes(path) ||
        path.startsWith('workouts/') ||
        path.startsWith('sessions/')
      )
        return workoutGet(db, user, path, req);
      if (path === 'exercises' || path.startsWith('exercises/'))
        return exerciseGet(db, user, path, req);
      if (path === 'me')
        return ok({
          id: user.id,
          email: user.email,
          role: user.role,
          mfaEnabled: user.mfaEnabled,
          profile: user.profile,
        });
      if (path === 'dashboard')
        return ok({
          user: { id: user.id, email: user.email, role: user.role, profile: user.profile },
        });
      throw new HttpError(404, 'Recurso não encontrado.');
    });
  } catch (error) {
    if (error instanceof HttpError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: 'Confira os campos informados.' }, { status: 400 });
    // Node and Workers load distinct Prisma runtime classes. Use its stable error name/code.
    const prismaCode =
      error instanceof Error && error.name === 'PrismaClientKnownRequestError' && 'code' in error
        ? String(error.code)
        : '';
    if (prismaCode === 'P2002')
      return NextResponse.json(
        { error: 'Não foi possível criar: email, habilitação ou vínculo já cadastrado.' },
        { status: 409 },
      );
    // Log only safe error classes/codes, never request data or exception messages.
    console.error(
      'Pulso request failed',
      error instanceof Error ? error.name : 'UnknownError',
      prismaCode,
    );
    return NextResponse.json(
      { error: 'Não foi possível concluir. Tente novamente.' },
      { status: 500 },
    );
  }
}
export const GET = handle;
export const POST = handle;
